// Deployment manifest: fetch (no-store), validate shape, then verify it against the live chain.
// Any mismatch → a precise DeploymentCheck failure; data from a stale manifest is never used.

import { getAddress, isAddress, type PublicClient } from 'viem';
import { coordinatorAbi, itemsAbi, npcAbi } from './abi.generated';
import { isLoopbackUrl } from './clients';
import { errorChain, isNetworkError } from './errors';
import type { Address, DeploymentCheck, DeploymentManifest, Hex } from './types';

export const MANIFEST_PATH = '/local-deployment.json';

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const DEC_RE = /^(0|[1-9][0-9]*)$/;

type Fail = Extract<DeploymentCheck, { ok: false }>;
const fail = (reason: Fail['reason'], detail: string): Fail => ({ ok: false, reason, detail });

/** coordinator + deployBlockHash: a redeploy (or Anvil restart that reuses addresses) changes it. */
export function deploymentKeyOf(m: DeploymentManifest): string {
  return `${m.coordinator.toLowerCase()}@${m.deployBlockHash.toLowerCase()}`;
}

/** Validates the manifest JSON shape; does not touch the network. */
export function parseManifest(raw: unknown): DeploymentCheck {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('invalid', 'The manifest is not a JSON object.');
  const r = raw as Record<string, unknown>;
  if (r.schema !== 1) return fail('invalid', `Unsupported manifest schema ${String(r.schema)} (expected 1).`);
  if (typeof r.chainId !== 'number' || !Number.isSafeInteger(r.chainId) || r.chainId <= 0) {
    return fail('invalid', 'The manifest chainId is missing or not a positive integer.');
  }
  if (typeof r.rpcUrl !== 'string') return fail('invalid', 'The manifest rpcUrl is missing.');
  if (!isLoopbackUrl(r.rpcUrl)) {
    return fail('non-loopback-rpc', `The manifest RPC URL ${r.rpcUrl} is not a loopback address; only 127.0.0.1/localhost is allowed.`);
  }
  const addrs: Record<string, Address> = {};
  for (const k of ['deployer', 'coordinator', 'items', 'npcA', 'npcB', 'npcC'] as const) {
    const v = r[k];
    if (typeof v !== 'string' || !isAddress(v, { strict: false })) return fail('invalid', `The manifest field ${k} is not an address.`);
    addrs[k] = getAddress(v);
  }
  const distinct = new Set(['coordinator', 'items', 'npcA', 'npcB', 'npcC'].map((k) => addrs[k].toLowerCase()));
  if (distinct.size !== 5) return fail('invalid', 'The manifest lists the same address for two contracts.');
  for (const k of ['deployTxHash', 'deployBlockHash'] as const) {
    if (typeof r[k] !== 'string' || !HASH_RE.test(r[k] as string)) return fail('invalid', `The manifest field ${k} is not a 32-byte hash.`);
  }
  if (typeof r.deployBlockNumber !== 'string' || !DEC_RE.test(r.deployBlockNumber)) {
    return fail('invalid', 'The manifest deployBlockNumber is not a decimal string.');
  }
  for (const k of ['sourceId', 'forgeVersion', 'createdAt'] as const) {
    if (typeof r[k] !== 'string') return fail('invalid', `The manifest field ${k} is missing.`);
  }
  const manifest: DeploymentManifest = {
    schema: 1,
    chainId: r.chainId,
    rpcUrl: r.rpcUrl,
    deployer: addrs.deployer,
    coordinator: addrs.coordinator,
    items: addrs.items,
    npcA: addrs.npcA,
    npcB: addrs.npcB,
    npcC: addrs.npcC,
    deployTxHash: r.deployTxHash as Hex,
    deployBlockNumber: r.deployBlockNumber,
    deployBlockHash: r.deployBlockHash as Hex,
    sourceId: r.sourceId as string,
    forgeVersion: r.forgeVersion as string,
    createdAt: r.createdAt as string,
  };
  return { ok: true, manifest };
}

export type FetchLike = (input: string, init?: { cache?: 'no-store'; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export async function fetchManifest(fetchFn: FetchLike): Promise<DeploymentCheck> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchFn(MANIFEST_PATH, { cache: 'no-store', headers: { accept: 'application/json' } });
  } catch (e) {
    return fail('missing', `The deployment manifest ${MANIFEST_PATH} could not be loaded: ${(e as Error).message ?? String(e)}`);
  }
  if (res.status === 404) {
    return fail('missing', 'No local deployment found. Start Anvil and deploy level 1 (scripts/chain/local-chain.mjs start, then deploy).');
  }
  if (!res.ok) return fail('missing', `The deployment manifest request failed with HTTP ${res.status}.`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return fail('invalid', 'The deployment manifest is not valid JSON.');
  }
  return parseManifest(json);
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Verifies the manifest against the chain: chainId, code, wiring both ways, deploy block hash. */
export async function verifyDeployment(m: DeploymentManifest, client: PublicClient): Promise<DeploymentCheck> {
  try {
    const chainId = await client.getChainId();
    if (chainId !== m.chainId) {
      return fail('wrong-chain', `The RPC at ${m.rpcUrl} reports chain ${chainId}, but the manifest was written for chain ${m.chainId}.`);
    }
    const named: [string, Address][] = [
      ['coordinator', m.coordinator],
      ['items', m.items],
      ['NPC A', m.npcA],
      ['NPC B', m.npcB],
      ['NPC C', m.npcC],
    ];
    const codes = await Promise.all(named.map(([, a]) => client.getCode({ address: a })));
    for (let i = 0; i < named.length; i++) {
      const code = codes[i];
      if (!code || code === '0x') {
        return fail('stale', `No contract code at the ${named[i][0]} address ${named[i][1]}. Anvil was probably restarted; deploy again.`);
      }
    }
    const block = await client.getBlock({ blockNumber: BigInt(m.deployBlockNumber) }).catch((e: unknown) => {
      if (isNetworkError(e)) throw e;
      return null;
    });
    if (!block || !block.hash || !same(block.hash, m.deployBlockHash)) {
      return fail('stale', `Block ${m.deployBlockNumber} on the chain is not the deployment block in the manifest. Anvil was restarted; deploy again.`);
    }
    const npcs: Address[] = [m.npcA, m.npcB, m.npcC];
    const [coordItems, itemsCoord, coordNpcs, itemsNpcs, npcCoords, npcItems, npcIds] = await Promise.all([
      client.readContract({ address: m.coordinator, abi: coordinatorAbi, functionName: 'items' }),
      client.readContract({ address: m.items, abi: itemsAbi, functionName: 'coordinator' }),
      Promise.all([0, 1, 2].map((i) => client.readContract({ address: m.coordinator, abi: coordinatorAbi, functionName: 'npcAddress', args: [i] }))),
      Promise.all([0, 1, 2].map((i) => client.readContract({ address: m.items, abi: itemsAbi, functionName: 'npcAddress', args: [i] }))),
      Promise.all(npcs.map((a) => client.readContract({ address: a, abi: npcAbi, functionName: 'coordinator' }))),
      Promise.all(npcs.map((a) => client.readContract({ address: a, abi: npcAbi, functionName: 'items' }))),
      Promise.all(npcs.map((a) => client.readContract({ address: a, abi: npcAbi, functionName: 'npcIdValue' }))),
    ]);
    if (!same(coordItems, m.items)) return fail('stale', `coordinator.items() is ${coordItems}, the manifest says ${m.items}.`);
    if (!same(itemsCoord, m.coordinator)) return fail('stale', `items.coordinator() is ${itemsCoord}, the manifest says ${m.coordinator}.`);
    for (let i = 0; i < 3; i++) {
      const label = `NPC ${'ABC'[i]}`;
      if (!same(coordNpcs[i], npcs[i])) return fail('stale', `coordinator.npcAddress(${i}) is ${coordNpcs[i]}, the manifest's ${label} is ${npcs[i]}.`);
      if (!same(itemsNpcs[i], npcs[i])) return fail('stale', `items.npcAddress(${i}) is ${itemsNpcs[i]}, the manifest's ${label} is ${npcs[i]}.`);
      if (!same(npcCoords[i], m.coordinator)) return fail('stale', `${label}.coordinator() does not point to the manifest's coordinator.`);
      if (!same(npcItems[i], m.items)) return fail('stale', `${label}.items() does not point to the manifest's items ledger.`);
      if (Number(npcIds[i]) !== i) return fail('stale', `${label} reports npc id ${String(npcIds[i])}, expected ${i}.`);
    }
    return { ok: true, manifest: m };
  } catch (e) {
    if (isNetworkError(e)) {
      return fail('unreachable', `The local chain at ${m.rpcUrl} is not reachable. Start Anvil (scripts/chain/local-chain.mjs start).`);
    }
    const msg = errorChain(e).find((x) => typeof x.shortMessage === 'string')?.shortMessage ?? (e as Error).message ?? String(e);
    return fail('stale', `The deployment does not match the chain: ${String(msg)}`);
  }
}

const RESTARTED =
  'The local chain was restarted or redeployed since this page loaded, so the shown run is no longer valid. Reload the page (redeploy first if needed).';

/**
 * Cheap pre-send / recheck re-validation: the manifest served now must be the one in use (same
 * coordinator@deployBlockHash), and the chain must still have that deploy block and coordinator code.
 * Anvil restart + redeploy reuses the same addresses, so the block hash is the decisive check.
 */
export async function revalidateDeployment(
  m: DeploymentManifest,
  client: PublicClient,
  fetchFn: FetchLike,
): Promise<DeploymentCheck> {
  const fresh = await fetchManifest(fetchFn);
  if (!fresh.ok) return fail('stale', `${RESTARTED} (${fresh.detail})`);
  if (deploymentKeyOf(fresh.manifest) !== deploymentKeyOf(m)) {
    return fail('stale', `${RESTARTED} (the deployment manifest now names a different deployment)`);
  }
  try {
    const [chainId, block, code] = await Promise.all([
      client.getChainId(),
      client.getBlock({ blockNumber: BigInt(m.deployBlockNumber) }).catch((e: unknown) => {
        if (isNetworkError(e)) throw e;
        return null;
      }),
      client.getCode({ address: m.coordinator }),
    ]);
    if (chainId !== m.chainId) return fail('wrong-chain', `The RPC at ${m.rpcUrl} now reports chain ${chainId}, expected ${m.chainId}.`);
    if (!block?.hash || !same(block.hash, m.deployBlockHash)) return fail('stale', `${RESTARTED} (deploy block hash differs)`);
    if (!code || code === '0x') return fail('stale', `${RESTARTED} (no code at the coordinator)`);
    return { ok: true, manifest: m };
  } catch (e) {
    if (isNetworkError(e)) return fail('unreachable', `The local chain could not be reached at ${m.rpcUrl}.`);
    return fail('stale', `${RESTARTED} (${(e as Error).message ?? String(e)})`);
  }
}
