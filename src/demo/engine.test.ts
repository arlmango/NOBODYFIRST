import { describe, expect, it } from 'vitest';
import {
  LEVEL_ONE,
  applyExchange,
  checkSelection,
  createInitialState,
  describeArrivals,
  explainMissing,
  previewExchange,
  resetDemo,
  totals,
  type DemoState,
  type LevelDefinition,
} from './index';

const A_OFFER = 'A-key-for-coin';
const B_OFFER = 'B-coin-for-key';
const BOTH = [A_OFFER, B_OFFER];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

/** A plain, unfrozen copy of the starting state, then deep-frozen so any mutation throws. */
function frozenStart(): DemoState {
  return deepFreeze(structuredClone({ holdings: LEVEL_ONE.initial, applied: false }) as DemoState);
}

describe('selection check', () => {
  it('reports an empty selection', () => {
    expect(checkSelection(LEVEL_ONE, []).status).toBe('empty');
  });

  it('only A: names the promise B has not made', () => {
    const check = checkSelection(LEVEL_ONE, [A_OFFER]);
    expect(check.status).toBe('incomplete');
    if (check.status !== 'incomplete') return;
    expect(check.missing).toHaveLength(1);
    expect(check.missing[0]).toMatchObject({ from: 'B', to: 'A', item: 'COIN', qty: 1, matchingOfferId: B_OFFER });
    expect(explainMissing(check.missing[0])).toBe("B has not promised 1 coin to A, so A's key would not move.");
  });

  it('only B: names the promise A has not made', () => {
    const check = checkSelection(LEVEL_ONE, [B_OFFER]);
    expect(check.status).toBe('incomplete');
    if (check.status !== 'incomplete') return;
    expect(check.missing[0]).toMatchObject({ from: 'A', to: 'B', item: 'KEY', qty: 1, matchingOfferId: A_OFFER });
    expect(explainMissing(check.missing[0])).toBe("A has not promised 1 key to B, so B's coin would not move.");
  });

  it('both promises form a complete package in either order', () => {
    expect(checkSelection(LEVEL_ONE, BOTH)).toEqual({ status: 'complete', selected: BOTH });
    expect(checkSelection(LEVEL_ONE, [B_OFFER, A_OFFER])).toEqual({ status: 'complete', selected: BOTH });
  });

  it('rejects offer IDs that are not in the fixed table', () => {
    const check = checkSelection(LEVEL_ONE, [A_OFFER, 'A-key-for-nothing']);
    expect(check).toMatchObject({ status: 'invalid', reason: 'unknown-offer', offerIds: ['A-key-for-nothing'] });
  });
});

describe('preview and apply', () => {
  it('refuses to preview or apply an empty selection', () => {
    const state = createInitialState(LEVEL_ONE);
    expect(previewExchange(LEVEL_ONE, state, [])).toMatchObject({ ok: false, reason: 'empty' });
    expect(applyExchange(LEVEL_ONE, state, [])).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('refuses to apply only A or only B, and nothing moves', () => {
    const state = createInitialState(LEVEL_ONE);
    for (const selection of [[A_OFFER], [B_OFFER]]) {
      expect(previewExchange(LEVEL_ONE, state, selection)).toMatchObject({ ok: false, reason: 'incomplete' });
      expect(applyExchange(LEVEL_ONE, state, selection)).toMatchObject({ ok: false, reason: 'incomplete' });
    }
    expect(state.holdings).toEqual({ A: { KEY: 1 }, B: { COIN: 1 }, C: {} });
  });

  it('preview lists both transfers and expected holdings without changing state', () => {
    const state = frozenStart();
    const preview = previewExchange(LEVEL_ONE, state, BOTH);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.plan.transfers).toEqual([
      { from: 'A', to: 'B', item: 'KEY', qty: 1 },
      { from: 'B', to: 'A', item: 'COIN', qty: 1 },
    ]);
    expect(preview.plan.before).toEqual({ A: { KEY: 1 }, B: { COIN: 1 }, C: {} });
    expect(preview.plan.after).toEqual({ A: { COIN: 1 }, B: { KEY: 1 }, C: {} });
    expect(state).toEqual({ holdings: { A: { KEY: 1 }, B: { COIN: 1 }, C: {} }, applied: false });
  });

  it('full package ends with exact holdings: A only 1 coin, B only 1 key, C empty', () => {
    const result = applyExchange(LEVEL_ONE, createInitialState(LEVEL_ONE), BOTH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.holdings).toStrictEqual({ A: { COIN: 1 }, B: { KEY: 1 }, C: {} });
    expect(result.state.applied).toBe(true);
    expect(describeArrivals(result.plan.transfers)).toBe('A received a coin. B received a key.');
  });

  it('keeps item totals and leaves C unchanged', () => {
    const start = createInitialState(LEVEL_ONE);
    const result = applyExchange(LEVEL_ONE, start, BOTH);
    if (!result.ok) throw new Error('expected success');
    expect(totals(LEVEL_ONE, result.state.holdings)).toEqual(totals(LEVEL_ONE, start.holdings));
    expect(totals(LEVEL_ONE, result.state.holdings)).toEqual({ KEY: 1, COIN: 1 });
    expect(result.state.holdings.C).toStrictEqual(start.holdings.C);
    expect(result.plan.before.C).toStrictEqual(result.plan.after.C);
  });

  it('does not mutate the input state or the selection', () => {
    const state = frozenStart();
    const snapshot = structuredClone(state);
    const selection = Object.freeze([...BOTH]);
    const result = applyExchange(LEVEL_ONE, state, selection);
    expect(result.ok).toBe(true);
    expect(state).toEqual(snapshot);
    expect(selection).toEqual(BOTH);
    expect(LEVEL_ONE.initial).toEqual({ A: { KEY: 1 }, B: { COIN: 1 }, C: {} });
  });

  it('cannot apply the same exchange twice', () => {
    const first = applyExchange(LEVEL_ONE, createInitialState(LEVEL_ONE), BOTH);
    if (!first.ok) throw new Error('expected success');
    const second = applyExchange(LEVEL_ONE, first.state, BOTH);
    expect(second).toMatchObject({ ok: false, reason: 'already-applied' });
    expect(previewExchange(LEVEL_ONE, first.state, BOTH)).toMatchObject({ ok: false, reason: 'already-applied' });
    expect(first.state.holdings).toStrictEqual({ A: { COIN: 1 }, B: { KEY: 1 }, C: {} });
  });

  it('refuses a package when a giver no longer holds the item', () => {
    const state: DemoState = { holdings: { A: { COIN: 1 }, B: { KEY: 1 }, C: {} }, applied: false };
    expect(applyExchange(LEVEL_ONE, state, BOTH)).toMatchObject({ ok: false, reason: 'insufficient-holdings' });
  });

  it('reset restores the initial state after an exchange, and the exchange can run again', () => {
    const fresh = createInitialState(LEVEL_ONE);
    const applied = applyExchange(LEVEL_ONE, fresh, BOTH);
    if (!applied.ok) throw new Error('expected success');
    expect(applied.state).not.toEqual(fresh);

    const reset = resetDemo(LEVEL_ONE);
    expect(reset).toStrictEqual(fresh);
    expect(reset).toStrictEqual({ holdings: { A: { KEY: 1 }, B: { COIN: 1 }, C: {} }, applied: false });

    const again = applyExchange(LEVEL_ONE, reset, BOTH);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.state.holdings).toStrictEqual({ A: { COIN: 1 }, B: { KEY: 1 }, C: {} });
    expect(applied.state.holdings).toStrictEqual(again.state.holdings);
  });

  it('reports an applied state as already applied, whatever is selected', () => {
    const applied = applyExchange(LEVEL_ONE, createInitialState(LEVEL_ONE), BOTH);
    if (!applied.ok) throw new Error('expected success');
    for (const selection of [[], [A_OFFER], [B_OFFER], BOTH]) {
      expect(previewExchange(LEVEL_ONE, applied.state, selection)).toMatchObject({ ok: false, reason: 'already-applied' });
      expect(applyExchange(LEVEL_ONE, applied.state, selection)).toMatchObject({ ok: false, reason: 'already-applied' });
    }
  });
});

describe('repeated offer IDs', () => {
  it('refuses [A, A] as a duplicate', () => {
    expect(checkSelection(LEVEL_ONE, [A_OFFER, A_OFFER])).toEqual({
      status: 'invalid',
      reason: 'duplicate-offer',
      offerIds: [A_OFFER],
    });
  });

  it('refuses [A, B, A] even though both promises are present', () => {
    expect(checkSelection(LEVEL_ONE, [A_OFFER, B_OFFER, A_OFFER])).toMatchObject({
      status: 'invalid',
      reason: 'duplicate-offer',
      offerIds: [A_OFFER],
    });
  });

  it('refuses [B, A, B] even though both promises are present', () => {
    expect(checkSelection(LEVEL_ONE, [B_OFFER, A_OFFER, B_OFFER])).toMatchObject({
      status: 'invalid',
      reason: 'duplicate-offer',
      offerIds: [B_OFFER],
    });
  });

  it('lists repeated IDs once each, in table order, whatever the input order', () => {
    for (const selection of [
      [A_OFFER, B_OFFER, B_OFFER, A_OFFER],
      [B_OFFER, A_OFFER, B_OFFER, A_OFFER],
      [B_OFFER, B_OFFER, A_OFFER, A_OFFER, A_OFFER],
    ]) {
      expect(checkSelection(LEVEL_ONE, selection)).toEqual({
        status: 'invalid',
        reason: 'duplicate-offer',
        offerIds: [A_OFFER, B_OFFER],
      });
    }
  });

  it('reports a repeated ID before an unknown one', () => {
    expect(checkSelection(LEVEL_ONE, ['nope', A_OFFER, A_OFFER])).toMatchObject({ reason: 'duplicate-offer' });
  });

  it('accepts unique [B, A] and ends with exact holdings', () => {
    const result = applyExchange(LEVEL_ONE, createInitialState(LEVEL_ONE), [B_OFFER, A_OFFER]);
    if (!result.ok) throw new Error('expected success');
    expect(result.state.holdings).toStrictEqual({ A: { COIN: 1 }, B: { KEY: 1 }, C: {} });
  });

  it('preview and apply refuse duplicates without touching state or selection; a valid apply still works', () => {
    const state = frozenStart();
    const snapshot = structuredClone(state);
    for (const ids of [[A_OFFER, A_OFFER], [A_OFFER, B_OFFER, A_OFFER], [B_OFFER, A_OFFER, B_OFFER]]) {
      const selection = Object.freeze([...ids]);
      expect(previewExchange(LEVEL_ONE, state, selection)).toMatchObject({ ok: false, reason: 'duplicate-offer' });
      expect(applyExchange(LEVEL_ONE, state, selection)).toMatchObject({ ok: false, reason: 'duplicate-offer' });
      expect(selection).toEqual(ids);
    }
    expect(state).toEqual(snapshot);
    const valid = applyExchange(LEVEL_ONE, state, BOTH);
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.state.holdings).toStrictEqual({ A: { COIN: 1 }, B: { KEY: 1 }, C: {} });
  });
});

describe('engine generality (synthetic fixture, not a game level)', () => {
  // Synthetic three-person cycle used only to show the matcher is not tied to level 01's IDs.
  // It is NOT level 02 (which uses an APPLE); it reuses KEY/COIN on purpose.
  const SYNTHETIC_CYCLE: LevelDefinition = {
    people: ['A', 'B', 'C'],
    offers: [
      { id: 'a', from: 'A', to: 'C', gives: { item: 'KEY', qty: 1 }, requires: { from: 'B', item: 'COIN', qty: 1 } },
      { id: 'b', from: 'B', to: 'A', gives: { item: 'COIN', qty: 1 }, requires: { from: 'C', item: 'KEY', qty: 1 } },
      { id: 'c', from: 'C', to: 'B', gives: { item: 'KEY', qty: 1 }, requires: { from: 'A', item: 'KEY', qty: 1 } },
    ],
    initial: { A: { KEY: 1 }, B: { COIN: 1 }, C: { KEY: 1 } },
  };

  it('synthetic cycle: needs every promise and names the one that is missing', () => {
    const check = checkSelection(SYNTHETIC_CYCLE, ['a', 'b']);
    expect(check.status).toBe('incomplete');
    if (check.status !== 'incomplete') return;
    expect(check.missing.map((m) => m.waitingOfferId)).toEqual(['b']);
    expect(check.missing[0]).toMatchObject({ from: 'C', to: 'B', matchingOfferId: 'c' });
    expect(checkSelection(SYNTHETIC_CYCLE, ['a', 'b', 'c']).status).toBe('complete');
  });

  it('synthetic cycle: applies with conservation', () => {
    const result = applyExchange(SYNTHETIC_CYCLE, createInitialState(SYNTHETIC_CYCLE), ['c', 'a', 'b']);
    if (!result.ok) throw new Error('expected success');
    expect(result.state.holdings).toStrictEqual({ A: { COIN: 1 }, B: { KEY: 1 }, C: { KEY: 1 } });
    expect(totals(SYNTHETIC_CYCLE, result.state.holdings)).toEqual(totals(SYNTHETIC_CYCLE, SYNTHETIC_CYCLE.initial));
  });

  // Synthetic fixture (not a game level): level 01's table plus a second, different offer from A.
  const SYNTHETIC_TWO_OFFERS_FROM_A: LevelDefinition = {
    ...LEVEL_ONE,
    offers: [...LEVEL_ONE.offers, { ...LEVEL_ONE.offers[0], id: 'A-key-to-C', to: 'C' }],
  };

  it('refuses two different promises from the same giver', () => {
    expect(checkSelection(SYNTHETIC_TWO_OFFERS_FROM_A, [A_OFFER, 'A-key-to-C', B_OFFER])).toMatchObject({
      status: 'invalid',
      reason: 'conflicting-offers',
    });
  });

  it('a conflicting-offers refusal leaves state and selection untouched; a valid apply still works', () => {
    const level = SYNTHETIC_TWO_OFFERS_FROM_A;
    const state = deepFreeze(structuredClone(createInitialState(level)) as DemoState);
    const snapshot = structuredClone(state);
    const selection = Object.freeze([A_OFFER, 'A-key-to-C', B_OFFER]);
    expect(previewExchange(level, state, selection)).toMatchObject({ ok: false, reason: 'conflicting-offers' });
    expect(applyExchange(level, state, selection)).toMatchObject({ ok: false, reason: 'conflicting-offers' });
    expect(state).toEqual(snapshot);
    expect(selection).toEqual([A_OFFER, 'A-key-to-C', B_OFFER]);
    const valid = applyExchange(level, state, BOTH);
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.state.holdings).toStrictEqual({ A: { COIN: 1 }, B: { KEY: 1 }, C: {} });
  });
});
