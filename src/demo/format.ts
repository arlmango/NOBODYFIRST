// Plain-language strings derived from demo data. No React.

import type { InvalidSelectionReason, Inventory, ItemId, MissingPromise, SelectionCheck, Transfer } from './types';

const ITEM_NAME: Readonly<Record<ItemId, { one: string; many: string }>> = Object.freeze({
  KEY: { one: 'key', many: 'keys' },
  COIN: { one: 'coin', many: 'coins' },
});

const ITEM_ORDER: readonly ItemId[] = ['KEY', 'COIN'];

export function itemName(item: ItemId): string {
  return ITEM_NAME[item].one;
}

/** "1 key", "2 coins". */
export function formatQty(item: ItemId, qty: number): string {
  return `${qty} ${qty === 1 ? ITEM_NAME[item].one : ITEM_NAME[item].many}`;
}

/** Items a person holds, in fixed order, e.g. [{item:'KEY', qty:1}]. Empty array when nothing. */
export function inventoryEntries(inv: Inventory): { item: ItemId; qty: number }[] {
  return ITEM_ORDER.filter((item) => (inv[item] ?? 0) > 0).map((item) => ({ item, qty: inv[item] ?? 0 }));
}

/** "1 key", "1 key, 1 coin", or "empty". */
export function formatInventory(inv: Inventory): string {
  const entries = inventoryEntries(inv);
  return entries.length === 0 ? 'empty' : entries.map((e) => formatQty(e.item, e.qty)).join(', ');
}

/** "A → B: 1 key". */
export function formatTransfer(t: Transfer): string {
  return `${t.from} → ${t.to}: ${formatQty(t.item, t.qty)}`;
}

/** "B has not promised 1 coin to A, so A's key would not move." */
export function explainMissing(m: MissingPromise): string {
  const blocked = m.blocked.qty === 1 ? itemName(m.blocked.item) : formatQty(m.blocked.item, m.blocked.qty);
  return `${m.from} has not promised ${formatQty(m.item, m.qty)} to ${m.to}, so ${m.to}'s ${blocked} would not move.`;
}

/** "A received a coin. B received a key." */
export function describeArrivals(transfers: readonly Transfer[]): string {
  return [...transfers]
    .sort((x, y) => x.to.localeCompare(y.to))
    .map((t) => `${t.to} received ${t.qty === 1 ? `a ${itemName(t.item)}` : formatQty(t.item, t.qty)}.`)
    .join(' ');
}

/** Short headline for the selection state, used in the summary and the live region. */
export function selectionHeadline(check: SelectionCheck, offerCount: number): string {
  switch (check.status) {
    case 'empty':
      return 'No promises selected';
    case 'invalid':
      return 'This selection cannot be used';
    case 'incomplete':
      return `${check.selected.length} of ${offerCount} promises selected`;
    case 'complete':
      return check.selected.length === 2 ? 'Both promises selected' : 'All promises selected';
  }
}

/** Plain explanation for a malformed selection. The UI only sends unique IDs from its checkboxes. */
export function explainInvalid(reason: InvalidSelectionReason): string {
  switch (reason) {
    case 'duplicate-offer':
      return 'The same promise was sent more than once, so nothing can move. Reset the demo to start again.';
    case 'unknown-offer':
      return 'This selection is not part of this room. Reset the demo to start again.';
    case 'conflicting-offers':
      return 'One person can make only one promise in this room. Reset the demo to start again.';
  }
}
