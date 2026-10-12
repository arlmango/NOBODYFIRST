// Promise-matching engine for the design-preview demo.
// General over a level's fixed offer table: no branching on specific offer IDs.
// Every function is pure: inputs are never mutated, outputs are frozen.

import type {
  ApplyResult,
  DemoState,
  ExchangePlan,
  Holdings,
  Inventory,
  ItemId,
  LevelDefinition,
  MissingPromise,
  Offer,
  PersonId,
  PreviewResult,
  SelectionCheck,
  Transfer,
} from './types';

const ITEM_ORDER: readonly ItemId[] = ['KEY', 'COIN'];

function freezeInventory(source: Partial<Record<ItemId, number>>): Inventory {
  const out: Partial<Record<ItemId, number>> = {};
  for (const item of ITEM_ORDER) {
    const qty = source[item] ?? 0;
    if (qty > 0) out[item] = qty;
  }
  return Object.freeze(out);
}

function freezeHoldings(level: LevelDefinition, source: Holdings): Holdings {
  const out = {} as Record<PersonId, Inventory>;
  for (const person of level.people) out[person] = freezeInventory({ ...source[person] });
  return Object.freeze(out);
}

function sameInventory(a: Inventory, b: Inventory): boolean {
  return ITEM_ORDER.every((item) => (a[item] ?? 0) === (b[item] ?? 0));
}

/** Total quantity of each item across all people. */
export function totals(level: LevelDefinition, holdings: Holdings): Record<ItemId, number> {
  const sum = { KEY: 0, COIN: 0 } as Record<ItemId, number>;
  for (const person of level.people) {
    for (const item of ITEM_ORDER) sum[item] += holdings[person]?.[item] ?? 0;
  }
  return sum;
}

/** Offers in the table that a given person can promise (table order). */
export function offersFrom<Id extends string>(
  level: LevelDefinition<Id>,
  person: PersonId,
): readonly (Offer & { readonly id: Id })[] {
  return level.offers.filter((offer) => offer.from === person);
}

/** Does `candidate` deliver exactly what `waiting` requires, to the person who is waiting? */
function fulfils(candidate: Offer, waiting: Offer): boolean {
  return (
    candidate.from === waiting.requires.from &&
    candidate.to === waiting.from &&
    candidate.gives.item === waiting.requires.item &&
    candidate.gives.qty === waiting.requires.qty
  );
}

/**
 * Classify a selection of offer IDs against the level's table.
 * A selection is a set: any repeated ID is refused. The order of unique IDs does not matter;
 * the result lists selected IDs in table order.
 */
export function checkSelection(level: LevelDefinition, selection: readonly string[]): SelectionCheck {
  // Checked first, before unknown IDs: a repeated ID is malformed input whether or not it is known.
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of selection) (seen.has(id) ? repeated : seen).add(id);
  if (repeated.size > 0) {
    // Deterministic report: repeated table IDs in table order, then repeated unknown IDs as given.
    const tableIds = level.offers.map((offer) => offer.id);
    const offerIds = [
      ...tableIds.filter((id) => repeated.has(id)),
      ...[...repeated].filter((id) => !tableIds.includes(id)),
    ];
    return Object.freeze({ status: 'invalid', reason: 'duplicate-offer', offerIds: Object.freeze(offerIds) });
  }

  const requested = seen;
  const unknown = [...requested].filter((id) => !level.offers.some((offer) => offer.id === id));
  if (unknown.length > 0) {
    return Object.freeze({ status: 'invalid', reason: 'unknown-offer', offerIds: Object.freeze(unknown) });
  }

  const chosen = level.offers.filter((offer) => requested.has(offer.id));
  if (chosen.length === 0) return Object.freeze({ status: 'empty' });

  const givers = new Map<PersonId, string[]>();
  for (const offer of chosen) givers.set(offer.from, [...(givers.get(offer.from) ?? []), offer.id]);
  const conflicting = [...givers.values()].filter((ids) => ids.length > 1).flat();
  if (conflicting.length > 0) {
    return Object.freeze({
      status: 'invalid',
      reason: 'conflicting-offers',
      offerIds: Object.freeze(conflicting),
    });
  }

  const selected = Object.freeze(chosen.map((offer) => offer.id));
  const missing: MissingPromise[] = [];
  for (const offer of chosen) {
    if (chosen.some((other) => other !== offer && fulfils(other, offer))) continue;
    const match = level.offers.find((other) => other !== offer && fulfils(other, offer));
    missing.push(
      Object.freeze({
        waitingOfferId: offer.id,
        from: offer.requires.from,
        to: offer.from,
        item: offer.requires.item,
        qty: offer.requires.qty,
        blocked: Object.freeze({ item: offer.gives.item, qty: offer.gives.qty }),
        matchingOfferId: match ? match.id : null,
      }),
    );
  }

  if (missing.length > 0) {
    return Object.freeze({ status: 'incomplete', selected, missing: Object.freeze(missing) });
  }
  return Object.freeze({ status: 'complete', selected });
}

type PlanOutcome =
  | { ok: true; plan: ExchangePlan }
  | { ok: false; reason: 'insufficient-holdings' | 'conservation-violated' | 'bystander-changed' };

function buildPlan(level: LevelDefinition, holdings: Holdings, offerIds: readonly string[]): PlanOutcome {
  const chosen = level.offers.filter((offer) => offerIds.includes(offer.id));
  const transfers: Transfer[] = chosen.map((offer) =>
    Object.freeze({ from: offer.from, to: offer.to, item: offer.gives.item, qty: offer.gives.qty }),
  );

  const working = {} as Record<PersonId, Partial<Record<ItemId, number>>>;
  for (const person of level.people) working[person] = { ...holdings[person] };

  // Every giver must hold what they promise, measured against the state before the exchange.
  for (const person of level.people) {
    for (const item of ITEM_ORDER) {
      const owed = transfers
        .filter((t) => t.from === person && t.item === item)
        .reduce((sum, t) => sum + t.qty, 0);
      if (owed > (holdings[person]?.[item] ?? 0)) return { ok: false, reason: 'insufficient-holdings' };
    }
  }

  // All transfers happen together: compute the after-state from the before-state in one step.
  for (const t of transfers) {
    working[t.from][t.item] = (working[t.from][t.item] ?? 0) - t.qty;
    working[t.to][t.item] = (working[t.to][t.item] ?? 0) + t.qty;
  }

  const before = freezeHoldings(level, holdings);
  const after = freezeHoldings(level, working as Holdings);

  const totalBefore = totals(level, before);
  const totalAfter = totals(level, after);
  if (ITEM_ORDER.some((item) => totalBefore[item] !== totalAfter[item])) {
    return { ok: false, reason: 'conservation-violated' };
  }

  const involved = new Set<PersonId>(transfers.flatMap((t) => [t.from, t.to]));
  const bystanderChanged = level.people.some(
    (person) => !involved.has(person) && !sameInventory(before[person], after[person]),
  );
  if (bystanderChanged) return { ok: false, reason: 'bystander-changed' };

  return {
    ok: true,
    plan: Object.freeze({
      offers: Object.freeze([...chosen.map((offer) => offer.id)]),
      transfers: Object.freeze(transfers),
      before,
      after,
    }),
  };
}


/** Show what would happen. Never changes state. */
export function previewExchange(
  level: LevelDefinition,
  state: DemoState,
  selection: readonly string[],
): PreviewResult {
  const check = checkSelection(level, selection);
  // An applied state is final whatever is selected; report that before selection problems.
  if (state.applied) return Object.freeze({ ok: false, reason: 'already-applied', check });
  switch (check.status) {
    case 'empty':
    case 'incomplete':
      return Object.freeze({ ok: false, reason: check.status, check });
    case 'invalid':
      return Object.freeze({ ok: false, reason: check.reason, check });
    case 'complete':
      break;
  }

  const outcome = buildPlan(level, state.holdings, check.selected);
  if (!outcome.ok) return Object.freeze({ ok: false, reason: outcome.reason, check });
  return Object.freeze({ ok: true, plan: outcome.plan });
}

/** Apply a complete selection once. Returns a new state; the input state is untouched. */
export function applyExchange(
  level: LevelDefinition,
  state: DemoState,
  selection: readonly string[],
): ApplyResult {
  const preview = previewExchange(level, state, selection);
  if (!preview.ok) return preview;
  const next: DemoState = Object.freeze({ holdings: preview.plan.after, applied: true });
  return Object.freeze({ ok: true, state: next, plan: preview.plan });
}

/** A fresh starting state for the level. Reset is the same operation. */
export function createInitialState(level: LevelDefinition): DemoState {
  return Object.freeze({ holdings: freezeHoldings(level, level.initial), applied: false });
}

export const resetDemo = createInitialState;
