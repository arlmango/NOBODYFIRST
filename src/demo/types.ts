// Pure data types for the design-preview demo. No React, no I/O.

export type PersonId = 'A' | 'B' | 'C';
export type ItemId = 'KEY' | 'COIN';

/** What one person holds: item -> positive quantity. Zero entries are never stored. */
export type Inventory = Readonly<Partial<Record<ItemId, number>>>;
export type Holdings = Readonly<Record<PersonId, Inventory>>;

export interface Offer {
  readonly id: string;
  /** Who makes the promise and gives. */
  readonly from: PersonId;
  /** Who receives what is given. */
  readonly to: PersonId;
  readonly gives: { readonly item: ItemId; readonly qty: number };
  /** What the giver needs in return, and from whom. */
  readonly requires: { readonly from: PersonId; readonly item: ItemId; readonly qty: number };
}

export interface LevelDefinition<Id extends string = string> {
  readonly people: readonly PersonId[];
  readonly offers: readonly (Offer & { readonly id: Id })[];
  readonly initial: Holdings;
}

export interface DemoState {
  readonly holdings: Holdings;
  /** True once the exchange has been applied; a second application is refused. */
  readonly applied: boolean;
}

export interface Transfer {
  readonly from: PersonId;
  readonly to: PersonId;
  readonly item: ItemId;
  readonly qty: number;
}

/** A selected promise whose condition is not met because the counterparty has not promised. */
export interface MissingPromise {
  /** The selected offer that is waiting. */
  readonly waitingOfferId: string;
  /** Person who would have to promise. */
  readonly from: PersonId;
  /** Person waiting to receive. */
  readonly to: PersonId;
  readonly item: ItemId;
  readonly qty: number;
  /** What the waiting person would give if the promise were matched. */
  readonly blocked: { readonly item: ItemId; readonly qty: number };
  /** Offer in the table that would satisfy it, if one exists. */
  readonly matchingOfferId: string | null;
}

export type SelectionCheck =
  | { readonly status: 'empty' }
  | {
      readonly status: 'incomplete';
      readonly selected: readonly string[];
      readonly missing: readonly MissingPromise[];
    }
  | { readonly status: 'complete'; readonly selected: readonly string[] }
  | {
      readonly status: 'invalid';
      readonly reason: InvalidSelectionReason;
      readonly offerIds: readonly string[];
    };

/**
 * Why a selection is malformed: an offer ID listed more than once, an ID not in the level's
 * table, or two different offers from the same giver.
 */
export type InvalidSelectionReason = 'duplicate-offer' | 'unknown-offer' | 'conflicting-offers';

export interface ExchangePlan {
  readonly offers: readonly string[];
  readonly transfers: readonly Transfer[];
  readonly before: Holdings;
  readonly after: Holdings;
}

export type RefusalReason =
  | 'empty'
  | 'incomplete'
  | InvalidSelectionReason
  | 'already-applied'
  | 'insufficient-holdings'
  | 'conservation-violated'
  | 'bystander-changed';

export type PreviewResult =
  | { readonly ok: true; readonly plan: ExchangePlan }
  | { readonly ok: false; readonly reason: RefusalReason; readonly check: SelectionCheck };

export type ApplyResult =
  | { readonly ok: true; readonly state: DemoState; readonly plan: ExchangePlan }
  | { readonly ok: false; readonly reason: RefusalReason; readonly check: SelectionCheck };
