// Pure level-1 package logic: package building, transfer derivation and expected-after balances.
// Mirrors AtomicCoordinator steps 2/4/5 locally for display; the chain (simulation + receipt +
// readback) stays the authority — nothing here decides success.

import type { Address, Balances, Choice, Hex, NpcRulesView, PlannedTransfer, SelectionEntry } from './types';
import { COIN, KEY, NPC_IDS } from './types';

export const OFFER_NONE: Hex = `0x${'0'.repeat(64)}`;
const NPC_COUNT = 3;

export function balanceIndex(npcId: number, item: number): number {
  if (!Number.isInteger(npcId) || npcId < 0 || npcId >= NPC_COUNT) throw new Error(`invalid npc id ${npcId}`);
  if (item !== KEY && item !== COIN) throw new Error(`invalid item ${item}`);
  return npcId * 2 + item - 1;
}

/** runId = uint256(uint160(account)), as in AtomicCoordinator.startRun. */
export function runIdOf(account: Address): bigint {
  return BigInt(account);
}

export function toBalances(values: readonly bigint[]): Balances {
  if (values.length !== 6) throw new Error(`expected 6 balances, got ${values.length}`);
  return [values[0], values[1], values[2], values[3], values[4], values[5]] as unknown as Balances;
}

export function balancesEqual(a: Balances | null | undefined, b: Balances | null | undefined): boolean {
  if (!a || !b) return false;
  for (let i = 0; i < 6; i++) if (a[i] !== b[i]) return false;
  return true;
}

function ruleOf(rules: readonly NpcRulesView[], npcId: number): NpcRulesView {
  const r = rules.find((x) => x.npcId === npcId);
  if (!r) throw new Error(`rules for NPC ${npcId} were not read`);
  return r;
}

/**
 * Package = [{0, A ? ownA : NONE}, {1, B ? ownB : NONE}, {2, NONE}] using only the offer ids the NPCs
 * registered on chain (`ownOffer()` / `rules().offerId`). C is always NONE.
 */
export function buildPackage(choice: Choice, rules: readonly NpcRulesView[]): SelectionEntry[] {
  const a = ruleOf(rules, NPC_IDS.A);
  const b = ruleOf(rules, NPC_IDS.B);
  ruleOf(rules, NPC_IDS.C);
  if (choice.A && a.offerId === OFFER_NONE) throw new Error('NPC A has no registered offer');
  if (choice.B && b.offerId === OFFER_NONE) throw new Error('NPC B has no registered offer');
  return [
    { npcId: NPC_IDS.A, offerId: choice.A ? a.offerId : OFFER_NONE },
    { npcId: NPC_IDS.B, offerId: choice.B ? b.offerId : OFFER_NONE },
    { npcId: NPC_IDS.C, offerId: OFFER_NONE },
  ];
}

/** Output of `npc.outgoing(offerId)`, in npcId order. */
export interface OutgoingResult {
  npcId: number;
  hasTransfer: boolean;
  transfer: PlannedTransfer;
}

/** Collects the transfers the NPCs' own offers imply, with the coordinator's shape sanity check. */
export function transfersFromOutgoing(results: readonly OutgoingResult[]): PlannedTransfer[] {
  const out: PlannedTransfer[] = [];
  for (const r of [...results].sort((x, y) => x.npcId - y.npcId)) {
    if (!r.hasTransfer) continue;
    const t = r.transfer;
    const okShape =
      t.fromNpc === r.npcId &&
      t.toNpc >= 0 &&
      t.toNpc < NPC_COUNT &&
      t.toNpc !== r.npcId &&
      (t.item === KEY || t.item === COIN) &&
      t.qty > 0;
    if (!okShape) throw new Error(`NPC ${r.npcId} returned an invalid transfer`);
    out.push({ fromNpc: t.fromNpc, toNpc: t.toNpc, item: t.item, qty: t.qty });
  }
  return out;
}

export class LocalStockError extends Error {
  constructor(
    readonly npcId: number,
    readonly item: number,
    readonly have: bigint,
    readonly need: bigint,
  ) {
    super(`NPC ${npcId} has ${have} of item ${item}, the package needs ${need}`);
  }
}

/** Expected final balances: spend measured against `before` only (incoming never counts as stock). */
export function deriveExpectedAfter(before: Balances, transfers: readonly PlannedTransfer[]): Balances {
  const spent = [0n, 0n, 0n, 0n, 0n, 0n];
  for (const t of transfers) {
    const from = balanceIndex(t.fromNpc, t.item);
    spent[from] += BigInt(t.qty);
    if (spent[from] > before[from]) throw new LocalStockError(t.fromNpc, t.item, before[from], spent[from]);
  }
  const next = [...before];
  for (const t of transfers) {
    next[balanceIndex(t.fromNpc, t.item)] -= BigInt(t.qty);
    next[balanceIndex(t.toNpc, t.item)] += BigInt(t.qty);
  }
  return toBalances(next);
}

export function samePackage(a: readonly SelectionEntry[], b: readonly SelectionEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => x.npcId === b[i].npcId && x.offerId.toLowerCase() === b[i].offerId.toLowerCase())
  );
}
