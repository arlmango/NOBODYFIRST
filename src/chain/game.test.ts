import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, type Log, type PublicClient } from 'viem';
import { coordinatorAbi, itemsAbi } from './abi.generated';
import { createChainGateway, decodeGameEvents } from './game';
import { replacementReason } from './settle';
import type { DeploymentManifest } from './types';

const M = {
  coordinator: '0xa16E02E87b7454126E5E10d957A927A7F5B5d2be',
  items: '0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968',
  npcA: '0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883',
  npcB: '0x10C6E9530F1C1AF873a391030a1D9E8ed0630D26',
  npcC: '0x603E1BD79259EbcbAaeD0c83eeC09cA0B89a5bcC',
} as unknown as DeploymentManifest;
const PLAYER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
const RUN = BigInt(PLAYER);
const H = (c: string) => `0x${c.repeat(64)}` as const;

function log(address: string, topics: readonly (`0x${string}` | null)[] | `0x${string}`[], data: `0x${string}`, logIndex: number): Log {
  return {
    address: address as `0x${string}`,
    topics: topics as [`0x${string}`, ...`0x${string}`[]],
    data,
    logIndex,
    blockNumber: 5n,
    blockHash: H('5'),
    transactionHash: H('6'),
    transactionIndex: 0,
    removed: false,
  };
}

describe('decodeGameEvents (receipt logs → proof events)', () => {
  const solvedTopics = encodeEventTopics({ abi: coordinatorAbi, eventName: 'LevelSolved', args: { runId: RUN, player: PLAYER } });
  const solvedData = encodeAbiParameters([{ type: 'uint64' }, { type: 'bytes32' }, { type: 'bytes32' }], [1n, H('a'), H('b')]);
  const movedTopics = encodeEventTopics({ abi: itemsAbi, eventName: 'ItemMoved', args: { runId: RUN, fromNpc: 0, toNpc: 1 } });
  const movedData = encodeAbiParameters([{ type: 'uint8' }, { type: 'uint32' }], [1, 1]);

  it('decodes LevelSolved and ItemMoved with string args, ordered by log index', () => {
    const events = decodeGameEvents(
      [log(M.coordinator, solvedTopics as `0x${string}`[], solvedData, 7), log(M.items, movedTopics as `0x${string}`[], movedData, 3)],
      M,
    );
    expect(events.map((e) => e.name)).toEqual(['ItemMoved', 'LevelSolved']);
    expect(events[1].args).toMatchObject({ runId: RUN.toString(), player: PLAYER, newNonce: '1', snapshotHash: H('a') });
    expect(events[0].args).toMatchObject({ fromNpc: '0', toNpc: '1', item: '1', qty: '1' });
  });

  it('ignores identical-looking events from contracts outside the deployment', () => {
    const fake = '0x000000000000000000000000000000000000dEaD';
    expect(decodeGameEvents([log(fake, solvedTopics as `0x${string}`[], solvedData, 1)], M)).toEqual([]);
  });
});

describe('gateway receipt wait', () => {
  it('dispose() stops an in-flight receipt wait (no work continues after unmount)', async () => {
    const client = { waitForTransactionReceipt: () => new Promise(() => {}) } as unknown as PublicClient;
    const manifest = { ...M, chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', deployBlockNumber: '1', deployBlockHash: H('2') } as DeploymentManifest;
    const gw = createChainGateway(manifest, client, null, async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const wait = gw.waitForReceipt(H('7'), () => {});
    gw.dispose();
    await expect(wait).rejects.toThrow(/stopped/);
    await expect(gw.waitForReceipt(H('7'), () => {})).rejects.toThrow();
  });
});

describe('replacementReason', () => {
  const base = { hash: H('c'), status: 'success' as const, blockNumber: 1n, blockHash: H('d'), to: M.coordinator, events: [{ name: 'LevelSolved', address: M.coordinator, args: {}, logIndex: 0 }] };
  it('replaced only when the mined tx is a coordinator call with our events; otherwise cancelled', () => {
    expect(replacementReason({ reason: 'replaced', newHash: H('c') }, base, M.coordinator)).toBe('replaced');
    expect(replacementReason({ reason: 'cancelled', newHash: H('c') }, base, M.coordinator)).toBe('cancelled');
    expect(replacementReason({ reason: 'replaced', newHash: H('c') }, { ...base, to: PLAYER }, M.coordinator)).toBe('cancelled');
    expect(replacementReason({ reason: 'replaced', newHash: H('c') }, { ...base, events: [] }, M.coordinator)).toBe('cancelled');
  });
});
