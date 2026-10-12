import { describe, expect, it } from 'vitest';
import { LocalStockError, OFFER_NONE, balancesEqual, buildPackage, deriveExpectedAfter, runIdOf, toBalances, transfersFromOutgoing } from './plan';
import type { NpcRulesView } from './types';

const OFFER_A1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const OFFER_B1 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const rule = (npcId: number, offerId: `0x${string}`): NpcRulesView => ({
  npcId, address: `0x${String(npcId + 1).padStart(40, '0')}`, offerId, giveTo: 0, giveItem: 1, giveQty: 1, needFrom: 0, needItem: 2, needQty: 1, goalKey: 0, goalCoin: 0,
});
const RULES = [rule(0, OFFER_A1), rule(1, OFFER_B1), rule(2, OFFER_NONE)];
const START = toBalances([1n, 0n, 0n, 1n, 0n, 0n]); // A: 1 KEY, B: 1 COIN, C: nothing
const A_GIVES = { fromNpc: 0, toNpc: 1, item: 1, qty: 1 };
const B_GIVES = { fromNpc: 1, toNpc: 0, item: 2, qty: 1 };

describe('buildPackage', () => {
  it('uses only the registered offer ids; C is always NONE; one entry per NPC in id order', () => {
    expect(buildPackage({ A: true, B: true }, RULES)).toEqual([
      { npcId: 0, offerId: OFFER_A1 },
      { npcId: 1, offerId: OFFER_B1 },
      { npcId: 2, offerId: OFFER_NONE },
    ]);
    expect(buildPackage({ A: true, B: false }, RULES).map((s) => s.offerId)).toEqual([OFFER_A1, OFFER_NONE, OFFER_NONE]);
    expect(buildPackage({ A: false, B: false }, RULES).map((s) => s.offerId)).toEqual([OFFER_NONE, OFFER_NONE, OFFER_NONE]);
  });

  it('refuses to build without the NPC rules read from the chain', () => {
    expect(() => buildPackage({ A: true, B: true }, RULES.slice(0, 2))).toThrow();
  });
});

describe('transfers and expected-after balances', () => {
  it('both promises: A ends with 1 coin, B with 1 key, C untouched', () => {
    const transfers = transfersFromOutgoing([
      { npcId: 1, hasTransfer: true, transfer: B_GIVES },
      { npcId: 0, hasTransfer: true, transfer: A_GIVES },
      { npcId: 2, hasTransfer: false, transfer: { fromNpc: 0, toNpc: 0, item: 0, qty: 0 } },
    ]);
    expect(transfers).toEqual([A_GIVES, B_GIVES]); // npcId order, NONE contributes nothing
    expect(deriveExpectedAfter(START, transfers)).toEqual([0n, 1n, 1n, 0n, 0n, 0n]);
  });

  it('only A: the key moves to B (the chain would reject this; the derivation itself is mechanical)', () => {
    expect(deriveExpectedAfter(START, [A_GIVES])).toEqual([0n, 0n, 1n, 1n, 0n, 0n]);
  });

  it('spend is measured against `before` only — incoming never counts as stock', () => {
    const empty = toBalances([0n, 0n, 0n, 1n, 0n, 0n]);
    expect(() => deriveExpectedAfter(empty, [B_GIVES, A_GIVES])).toThrow(LocalStockError);
  });

  it('rejects a transfer whose shape does not belong to the NPC that returned it', () => {
    expect(() => transfersFromOutgoing([{ npcId: 0, hasTransfer: true, transfer: B_GIVES }])).toThrow();
    expect(() => transfersFromOutgoing([{ npcId: 0, hasTransfer: true, transfer: { ...A_GIVES, qty: 0 } }])).toThrow();
    expect(() => transfersFromOutgoing([{ npcId: 0, hasTransfer: true, transfer: { ...A_GIVES, toNpc: 0 } }])).toThrow();
  });

  it('balancesEqual compares all six slots exactly', () => {
    expect(balancesEqual(START, toBalances([1n, 0n, 0n, 1n, 0n, 0n]))).toBe(true);
    expect(balancesEqual(START, toBalances([1n, 0n, 0n, 1n, 0n, 1n]))).toBe(false);
    expect(balancesEqual(START, null)).toBe(false);
  });
});

it('runIdOf is uint256(uint160(account))', () => {
  expect(runIdOf('0x0000000000000000000000000000000000000102')).toBe(258n);
});
