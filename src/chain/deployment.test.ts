import { describe, expect, it } from 'vitest';
import { HttpRequestError, type PublicClient } from 'viem';
import { createReadClient, createWalletGateway, isLoopbackUrl, localChain } from './clients';
import { fetchManifest, parseManifest, revalidateDeployment, verifyDeployment, type FetchLike } from './deployment';
import type { DeploymentManifest } from './types';

const M: DeploymentManifest = {
  schema: 1,
  chainId: 31337,
  rpcUrl: 'http://127.0.0.1:8545',
  deployer: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  coordinator: '0xa16E02E87b7454126E5E10d957A927A7F5B5d2be',
  items: '0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968',
  npcA: '0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883',
  npcB: '0x10C6E9530F1C1AF873a391030a1D9E8ed0630D26',
  npcC: '0x603E1BD79259EbcbAaeD0c83eeC09cA0B89a5bcC',
  deployTxHash: `0x${'1'.repeat(64)}`,
  deployBlockNumber: '1',
  deployBlockHash: `0x${'2'.repeat(64)}`,
  sourceId: 'abc',
  forgeVersion: 'forge 1.8.5',
  createdAt: '2026-10-12T00:00:00.000Z',
};

describe('manifest shape', () => {
  it('accepts a complete loopback manifest', () => {
    expect(parseManifest(M)).toEqual({ ok: true, manifest: M });
  });

  it('refuses non-loopback RPC URLs (no external RPC ever)', () => {
    for (const rpcUrl of ['https://mainnet.example.org', 'http://192.168.1.2:8545', 'http://127.0.0.1.evil.com:8545', 'ws://127.0.0.1:8545']) {
      const r = parseManifest({ ...M, rpcUrl });
      expect(r.ok ? 'ok' : r.reason).toBe('non-loopback-rpc');
    }
    expect(isLoopbackUrl('http://localhost:8545')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:8545')).toBe(true);
  });

  it('rejects bad addresses, hashes, block numbers and duplicate contracts as invalid', () => {
    const bad = [{ coordinator: '0x1234' }, { deployBlockHash: '0x12' }, { deployBlockNumber: '0x10' }, { npcB: M.npcA }, { schema: 2 }];
    for (const patch of bad) {
      const r = parseManifest({ ...M, ...patch });
      expect(r.ok ? 'ok' : r.reason).toBe('invalid');
    }
  });

  it('fetches with no-store and reports a missing manifest precisely', async () => {
    const seen: unknown[] = [];
    const r = await fetchManifest(async (url, init) => {
      seen.push([url, init?.cache]);
      return { ok: false, status: 404, json: async () => ({}) };
    });
    expect(seen).toEqual([['/local-deployment.json', 'no-store']]);
    expect(r.ok ? 'ok' : r.reason).toBe('missing');
  });
});

type Reader = (address: string, fn: string, args?: readonly unknown[]) => unknown;

function fakeClient(over: { chainId?: number; code?: (a: string) => string; blockHash?: string; read?: Reader; fail?: Error } = {}) {
  const npcs = [M.npcA, M.npcB, M.npcC];
  const defaultRead: Reader = (address, fn, args) => {
    const a = address.toLowerCase();
    if (a === M.coordinator.toLowerCase() && fn === 'items') return M.items;
    if (a === M.coordinator.toLowerCase() && fn === 'npcAddress') return npcs[Number(args?.[0])];
    if (a === M.items.toLowerCase() && fn === 'coordinator') return M.coordinator;
    if (a === M.items.toLowerCase() && fn === 'npcAddress') return npcs[Number(args?.[0])];
    const i = npcs.findIndex((n) => n.toLowerCase() === a);
    if (i >= 0 && fn === 'coordinator') return M.coordinator;
    if (i >= 0 && fn === 'items') return M.items;
    if (i >= 0 && fn === 'npcIdValue') return i;
    throw new Error(`unexpected read ${fn} at ${address}`);
  };
  const guard = () => {
    if (over.fail) throw over.fail;
  };
  return {
    getChainId: async () => (guard(), over.chainId ?? 31337),
    getCode: async ({ address }: { address: string }) => (guard(), over.code ? over.code(address) : '0x6080'),
    getBlock: async () => (guard(), { hash: over.blockHash ?? M.deployBlockHash }),
    readContract: async ({ address, functionName, args }: { address: string; functionName: string; args?: readonly unknown[] }) => (
      guard(), (over.read ?? defaultRead)(address, functionName, args)
    ),
  } as unknown as PublicClient;
}

describe('verifyDeployment against the chain', () => {
  it('passes when chain id, code, deploy block and wiring (both ways) match', async () => {
    expect((await verifyDeployment(M, fakeClient())).ok).toBe(true);
  });

  it('wrong chain id → wrong-chain', async () => {
    const r = await verifyDeployment(M, fakeClient({ chainId: 1 }));
    expect(r.ok ? 'ok' : r.reason).toBe('wrong-chain');
  });

  it('no code at an address (Anvil restarted) → stale, naming the contract', async () => {
    const r = await verifyDeployment(M, fakeClient({ code: (a) => (a === M.npcB ? '0x' : '0x60') }));
    expect(r.ok ? 'ok' : r.reason).toBe('stale');
    if (!r.ok) expect(r.detail).toContain('NPC B');
  });

  it('same addresses but a different deploy block hash → stale', async () => {
    const r = await verifyDeployment(M, fakeClient({ blockHash: `0x${'3'.repeat(64)}` }));
    expect(r.ok ? 'ok' : r.reason).toBe('stale');
  });

  it('wiring mismatch in either direction → stale', async () => {
    const coordWrong: Reader = (a, fn, args) =>
      a === M.coordinator && fn === 'npcAddress' && args?.[0] === 1 ? M.npcC : (fakeDefault(a, fn, args));
    const itemsWrong: Reader = (a, fn, args) => (a === M.items && fn === 'coordinator' ? M.npcA : fakeDefault(a, fn, args));
    for (const read of [coordWrong, itemsWrong]) {
      const r = await verifyDeployment(M, fakeClient({ read }));
      expect(r.ok ? 'ok' : r.reason).toBe('stale');
    }
  });

  it('RPC down → unreachable (never falls back to anything)', async () => {
    const r = await verifyDeployment(M, fakeClient({ fail: new HttpRequestError({ url: M.rpcUrl, details: 'fetch failed' }) }));
    expect(r.ok ? 'ok' : r.reason).toBe('unreachable');
  });
});

// Default reader used by the wiring-mismatch overrides.
function fakeDefault(address: string, fn: string, args?: readonly unknown[]): unknown {
  const npcs = [M.npcA, M.npcB, M.npcC];
  if (address === M.coordinator) return fn === 'items' ? M.items : npcs[Number(args?.[0])];
  if (address === M.items) return fn === 'coordinator' ? M.coordinator : npcs[Number(args?.[0])];
  const i = npcs.indexOf(address as (typeof npcs)[number]);
  return fn === 'coordinator' ? M.coordinator : fn === 'items' ? M.items : i;
}

describe('[M23] loopback guard on the clients', () => {
  it('refuses to create read clients, chain config or a wallet switch for a non-loopback RPC', async () => {
    const evil = { ...M, rpcUrl: 'https://rpc.example.org' };
    expect(() => createReadClient(evil)).toThrow(/non-loopback/);
    expect(() => localChain(evil)).toThrow(/non-loopback/);
    const calls: string[] = [];
    const gw = createWalletGateway({ request: async ({ method }) => (calls.push(method), null) });
    await expect(gw.switchChain(evil)).rejects.toThrow(/non-loopback/);
    expect(calls).toEqual([]);
    expect(() => createReadClient(M)).not.toThrow();
  });
});

describe('revalidateDeployment (cheap pre-send check)', () => {
  const serve = (m: unknown): FetchLike => async () => ({ ok: true, status: 200, json: async () => m });

  it('passes when the served manifest, chain id, deploy block hash and coordinator code still match', async () => {
    expect((await revalidateDeployment(M, fakeClient(), serve(M))).ok).toBe(true);
  });

  it('Anvil restarted + redeployed at the same addresses (new deploy block hash) → stale', async () => {
    const r = await revalidateDeployment(M, fakeClient({ blockHash: `0x${'9'.repeat(64)}` }), serve(M));
    expect(r.ok ? 'ok' : r.reason).toBe('stale');
    if (!r.ok) expect(r.detail).toContain('restarted or redeployed');
  });

  it('the served manifest now names another deployment → stale, even if the old block still matches', async () => {
    const r = await revalidateDeployment(M, fakeClient(), serve({ ...M, deployBlockHash: `0x${'8'.repeat(64)}` }));
    expect(r.ok ? 'ok' : r.reason).toBe('stale');
  });

  it('RPC down → unreachable', async () => {
    const r = await revalidateDeployment(M, fakeClient({ fail: new HttpRequestError({ url: M.rpcUrl }) }), serve(M));
    expect(r.ok ? 'ok' : r.reason).toBe('unreachable');
  });
});
