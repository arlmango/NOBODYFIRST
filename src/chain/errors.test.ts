import { describe, expect, it } from 'vitest';
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  HttpRequestError,
  UserRejectedRequestError,
  encodeErrorResult,
} from 'viem';
import { coordinatorAbi, itemsAbi, npcAbi } from './abi.generated';
import { classifyError, decodeRevertData, describePlanRejection } from './errors';
import type { NpcRulesView } from './types';

const OFFER_A1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
const OFFER_B1 = '0x2222222222222222222222222222222222222222222222222222222222222222' as const;
const NONE = `0x${'0'.repeat(64)}` as const;

const RULES: NpcRulesView[] = [
  { npcId: 0, address: '0x00000000000000000000000000000000000000a1', offerId: OFFER_A1, giveTo: 1, giveItem: 1, giveQty: 1, needFrom: 1, needItem: 2, needQty: 1, goalKey: 0, goalCoin: 1 },
  { npcId: 1, address: '0x00000000000000000000000000000000000000b1', offerId: OFFER_B1, giveTo: 0, giveItem: 2, giveQty: 1, needFrom: 0, needItem: 1, needQty: 1, goalKey: 1, goalCoin: 0 },
  { npcId: 2, address: '0x00000000000000000000000000000000000000c1', offerId: NONE, giveTo: 0, giveItem: 0, giveQty: 0, needFrom: 0, needItem: 0, needQty: 0, goalKey: 0, goalCoin: 0 },
];

/** A revert the way viem surfaces it from simulateContract against the coordinator ABI. */
function simulatedRevert(data: `0x${string}`) {
  const reverted = new ContractFunctionRevertedError({ abi: coordinatorAbi, data, functionName: 'execute' });
  return new ContractFunctionExecutionError(reverted, { abi: coordinatorAbi, functionName: 'execute', args: [] });
}

describe('decodeRevertData (coordinator + npc + items ABIs merged)', () => {
  it('decodes an NPC error that is not in the coordinator ABI', () => {
    const data = encodeErrorResult({ abi: npcAbi, errorName: 'PlanRejected', args: [0, 4] });
    const d = decodeRevertData(data);
    expect(d?.name).toBe('PlanRejected');
    expect(d?.args.map(Number)).toEqual([0, 4]);
  });

  it('decodes ledger and coordinator errors', () => {
    expect(decodeRevertData(encodeErrorResult({ abi: itemsAbi, errorName: 'NotCoordinator' }))?.name).toBe('NotCoordinator');
    expect(decodeRevertData(encodeErrorResult({ abi: coordinatorAbi, errorName: 'StaleNonce', args: [0n, 1n] }))?.name).toBe('StaleNonce');
  });

  it('returns null for an unknown selector or empty data', () => {
    expect(decodeRevertData('0xdeadbeef00000000')).toBeNull();
    expect(decodeRevertData('0x')).toBeNull();
  });
});

describe('PlanRejected → sentence naming the missing promise', () => {
  it('only A selected: A rejects because B’s promise is missing', () => {
    const s = describePlanRejection(0, 4, RULES);
    expect(s).toContain('A rejected the package');
    expect(s).toContain("B's promise is not selected");
    expect(s).toContain('1 coin');
  });

  it('only B selected: A rejects an incoming coin without its own promise', () => {
    const s = describePlanRejection(0, 6, RULES);
    expect(s).toContain("A's promise (1 key to B for 1 coin from B) is not selected");
  });

  it('nothing selected: names A’s goal and promise', () => {
    const s = describePlanRejection(0, 9, RULES);
    expect(s).toContain('0 keys and 1 coin');
    expect(s).toContain("A's promise");
  });

  it('every code 1..10 has a sentence, an unknown code is reported honestly', () => {
    for (let code = 1; code <= 10; code++) {
      const s = describePlanRejection(1, code, RULES);
      expect(s.startsWith('B rejected the package')).toBe(true);
      expect(s).not.toContain('undefined');
    }
    expect(describePlanRejection(2, 42)).toContain('code 42');
  });
});

describe('classifyError', () => {
  it('simulation revert with PlanRejected(0,4) → contract / incomplete-selection with decoded args', () => {
    const data = encodeErrorResult({ abi: npcAbi, errorName: 'PlanRejected', args: [0, 4] });
    const c = classifyError(simulatedRevert(data), RULES);
    expect(c.type).toBe('contract');
    if (c.type !== 'contract') return;
    expect(c.failure.kind).toBe('incomplete-selection');
    expect(c.failure.errorName).toBe('PlanRejected');
    expect(c.failure.errorArgs).toEqual(['0', '4']);
    expect(c.failure.rawData).toBe(data);
  });

  it('StaleNonce / StaleSnapshot → stale; NotRunOwner → not-owner; AlreadySolved → already-solved', () => {
    const k = (errorName: 'StaleNonce' | 'StaleSnapshot' | 'NotRunOwner' | 'AlreadySolved', args: readonly unknown[]) => {
      const data = encodeErrorResult({ abi: coordinatorAbi, errorName, args } as Parameters<typeof encodeErrorResult>[0]);
      const c = classifyError(simulatedRevert(data));
      return c.type === 'contract' ? c.failure.kind : c.type;
    };
    expect(k('StaleNonce', [0n, 1n])).toBe('stale');
    expect(k('StaleSnapshot', [`0x${'1'.repeat(64)}`, `0x${'2'.repeat(64)}`])).toBe('stale');
    expect(k('NotRunOwner', [1n, '0x0000000000000000000000000000000000000001'])).toBe('not-owner');
    expect(k('AlreadySolved', [1n])).toBe('already-solved');
  });

  it('unknown selector → honest raw selector, not a guess', () => {
    const c = classifyError(simulatedRevert('0x8c2021060000000000000000000000000000000000000000000000000000000000000001'));
    expect(c.type).toBe('contract');
    if (c.type !== 'contract') return;
    expect(c.failure.kind).toBe('unknown-contract-error');
    expect(c.failure.message).toContain('0x8c202106');
    expect(c.failure.rawData?.startsWith('0x8c202106')).toBe(true);
  });

  it('wallet rejection (viem UserRejectedRequestError and raw EIP-1193 code 4001) is never a revert', () => {
    expect(classifyError(new UserRejectedRequestError(new Error('User denied'))).type).toBe('user-rejected');
    expect(classifyError({ code: 4001, message: 'User rejected the request.' }).type).toBe('user-rejected');
    const wrapped = new Error('outer', { cause: { code: 4001, message: 'denied' } });
    expect(classifyError(wrapped).type).toBe('user-rejected');
  });

  it('network failure → rpc, not a contract error', () => {
    const c = classifyError(new HttpRequestError({ url: 'http://127.0.0.1:8545', details: 'fetch failed' }));
    expect(c.type).toBe('rpc');
    if (c.type === 'rpc') expect(c.failure.kind).toBe('rpc');
  });
});
