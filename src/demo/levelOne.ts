// Level 01 "You First": fixed offer table and starting holdings.
// The UI never sends quantities or items, only offer IDs from this table.

import type { LevelDefinition } from './types';

export type LevelOneOfferId = 'A-key-for-coin' | 'B-coin-for-key';

export const LEVEL_ONE: LevelDefinition<LevelOneOfferId> = Object.freeze({
  people: Object.freeze(['A', 'B', 'C'] as const),
  offers: Object.freeze([
    Object.freeze({
      id: 'A-key-for-coin',
      from: 'A',
      to: 'B',
      gives: Object.freeze({ item: 'KEY', qty: 1 }),
      requires: Object.freeze({ from: 'B', item: 'COIN', qty: 1 }),
    }),
    Object.freeze({
      id: 'B-coin-for-key',
      from: 'B',
      to: 'A',
      gives: Object.freeze({ item: 'COIN', qty: 1 }),
      requires: Object.freeze({ from: 'A', item: 'KEY', qty: 1 }),
    }),
  ] as const),
  initial: Object.freeze({
    A: Object.freeze({ KEY: 1 }),
    B: Object.freeze({ COIN: 1 }),
    C: Object.freeze({}),
  }),
});

