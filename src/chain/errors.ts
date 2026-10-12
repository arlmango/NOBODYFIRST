// Error decoding and classification for the Local chain mode.
// Contract reverts are decoded with the merged coordinator + NPC + items error ABIs; wallet rejection
// and RPC/network failures are classified separately so a rejection is never shown as a revert.

import { decodeErrorResult, type Abi } from 'viem';
import { coordinatorAbi, itemsAbi, npcAbi } from './abi.generated';
import type { Failure, FailureKind, Hex, NpcRulesView } from './types';

/** Only the `error` entries of the three runtime ABIs (identical signatures share a selector). */
export const mergedErrorAbi: Abi = ([...coordinatorAbi, ...npcAbi, ...itemsAbi] as Abi).filter(
  (item) => item.type === 'error',
);

export const PLAN_REJECTION_CODES = {
  UNKNOWN_OFFER: 1,
  OWN_TRANSFER_MISSING: 2,
  OWN_TRANSFER_MISMATCH: 3,
  INCOMING_MISSING: 4,
  INCOMING_MISMATCH: 5,
  UNEXPECTED_INCOMING: 6,
  UNEXPECTED_OUTGOING: 7,
  INSUFFICIENT_STOCK: 8,
  GOAL_NOT_MET: 9,
  OBSERVER_TOUCHED: 10,
} as const;

const NPC_NAME = ['A', 'B', 'C'] as const;
const ITEM_NAME: Record<number, { one: string; many: string }> = {
  1: { one: 'key', many: 'keys' },
  2: { one: 'coin', many: 'coins' },
};

export function npcName(id: number): string {
  return NPC_NAME[id] ?? `NPC #${id}`;
}

export function qtyText(item: number, qty: number): string {
  const n = ITEM_NAME[item];
  if (!n) return `${qty} × item #${item}`;
  return `${qty} ${qty === 1 ? n.one : n.many}`;
}

function promiseText(r: NpcRulesView): string {
  return `${npcName(r.npcId)}'s promise (${qtyText(r.giveItem, r.giveQty)} to ${npcName(r.giveTo)} for ${qtyText(
    r.needItem,
    r.needQty,
  )} from ${npcName(r.needFrom)})`;
}

function goalText(r: NpcRulesView): string {
  return `${qtyText(1, r.goalKey)} and ${qtyText(2, r.goalCoin)}`;
}

/** Codes that, with the level-1 offers, mean "a promise the package needs is not in it". */
const INCOMPLETE_CODES: ReadonlySet<number> = new Set([
  PLAN_REJECTION_CODES.OWN_TRANSFER_MISSING,
  PLAN_REJECTION_CODES.INCOMING_MISSING,
  PLAN_REJECTION_CODES.UNEXPECTED_INCOMING,
  PLAN_REJECTION_CODES.GOAL_NOT_MET,
]);

/**
 * Human sentence for `PlanRejected(npcId, code)`, naming the promise that is missing or not satisfied.
 * `rules` (from `npc.rules()`) makes the sentence concrete; without it a generic sentence is used.
 */
export function describePlanRejection(npcId: number, code: number, rules?: readonly NpcRulesView[] | null): string {
  const who = npcName(npcId);
  const own = rules?.find((r) => r.npcId === npcId);
  const other = own ? rules?.find((r) => r.npcId === own.needFrom) : undefined;
  const C = PLAN_REJECTION_CODES;
  switch (code) {
    case C.UNKNOWN_OFFER:
      return `${who} rejected the package: the promise chosen for ${who} is not one of ${who}'s own promises.`;
    case C.OWN_TRANSFER_MISSING:
      return own
        ? `${who} rejected the package: ${promiseText(own)} is selected, but its transfer is missing from the plan.`
        : `${who} rejected the package: ${who}'s promise is selected, but its transfer is missing from the plan.`;
    case C.OWN_TRANSFER_MISMATCH:
      return own
        ? `${who} rejected the package: the planned transfer from ${who} does not match ${promiseText(own)}.`
        : `${who} rejected the package: the planned transfer from ${who} does not match ${who}'s promise.`;
    case C.INCOMING_MISSING:
      return own
        ? `${who} rejected the package: ${promiseText(own)} needs ${npcName(own.needFrom)}'s promise of ${qtyText(
            own.needItem,
            own.needQty,
          )}, but ${npcName(own.needFrom)}'s promise is not selected. ${who} will not give first.`
        : `${who} rejected the package: ${who} gives only in exchange for an incoming promise that is not selected.`;
    case C.INCOMING_MISMATCH:
      return own
        ? `${who} rejected the package: what ${who} would receive does not match ${promiseText(own)}.`
        : `${who} rejected the package: what ${who} would receive does not match ${who}'s promise.`;
    case C.UNEXPECTED_INCOMING:
      return own && other
        ? `${who} rejected the package: ${who} would receive from ${npcName(other.npcId)}, but ${promiseText(
            own,
          )} is not selected, so ${who} does not accept it.`
        : `${who} rejected the package: ${who} would receive an item without ${who}'s own promise being selected.`;
    case C.UNEXPECTED_OUTGOING:
      return `${who} rejected the package: an item would leave ${who} although ${who} has made no promise in it.`;
    case C.INSUFFICIENT_STOCK:
      return own
        ? `${who} rejected the package: ${who} does not hold ${qtyText(own.giveItem, own.giveQty)} to keep ${promiseText(own)}.`
        : `${who} rejected the package: ${who} does not hold enough to keep its promise.`;
    case C.GOAL_NOT_MET:
      return own
        ? `${who} rejected the package: after it, ${who} would not hold exactly ${goalText(own)}. ${
            own.offerId === ZERO_OFFER ? '' : `${promiseText(own)} must be selected together with the promise it depends on.`
          }`.trim()
        : `${who} rejected the package: after it, ${who} would not reach its goal.`;
    case C.OBSERVER_TOUCHED:
      return `${who} rejected the package: ${who} is only an observer and may not be part of any transfer.`;
    default:
      return `${who} rejected the package with code ${code}, which this interface does not know.`;
  }
}

const ZERO_OFFER: Hex = `0x${'0'.repeat(64)}`;

export interface DecodedContractError {
  name: string;
  args: readonly unknown[];
  raw: Hex;
}

/** Decodes revert data with the merged ABIs; null when the selector is unknown or data is empty. */
export function decodeRevertData(data: Hex | null | undefined): DecodedContractError | null {
  if (!data || data.length < 10) return null;
  try {
    const r = decodeErrorResult({ abi: mergedErrorAbi, data });
    return { name: r.errorName, args: (r.args ?? []) as readonly unknown[], raw: data };
  } catch {
    return null;
  }
}

export function stringifyArg(v: unknown): string {
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) return '';
  try {
    return JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x));
  } catch {
    return String(v);
  }
}

function num(v: unknown): number {
  return typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v);
}

/** Maps a decoded custom error to a Failure with a human sentence. */
export function describeContractError(err: DecodedContractError, rules?: readonly NpcRulesView[] | null): Failure {
  const args = err.args;
  const base = { errorName: err.name, errorArgs: args.map(stringifyArg), rawData: err.raw };
  const f = (kind: FailureKind, message: string): Failure => ({ kind, message, ...base });
  switch (err.name) {
    case 'PlanRejected': {
      const npcId = num(args[0]);
      const code = num(args[1]);
      return f(INCOMPLETE_CODES.has(code) ? 'incomplete-selection' : 'plan-rejected', describePlanRejection(npcId, code, rules));
    }
    case 'StaleNonce':
      return f('stale', 'The run changed since this preview (its game nonce moved on). Preview again before sending.');
    case 'StaleSnapshot':
      return f('stale', 'The run changed since this preview (its balances or state differ). Preview again before sending.');
    case 'PrepareChangedState':
      return f('stale', 'The run changed while the NPCs were preparing their permits. Nothing moved.');
    case 'NotRunOwner':
      return f('not-owner', 'This run belongs to a different account. Only the run owner can send its package.');
    case 'AlreadySolved':
      return f('already-solved', 'This run is already solved. A repeat attempt is not supported in this version.');
    case 'RunMissing':
      return f('unknown-contract-error', 'There is no run for this account yet. Start a run first.');
    case 'RunExists':
      return f('unknown-contract-error', 'A run already exists for this account.');
    case 'RunNotActive':
      return f('unknown-contract-error', 'This run is not active.');
    case 'UnknownOffer':
      return f(
        'plan-rejected',
        `The promise chosen for ${npcName(num(args[0]))} is not registered by ${npcName(num(args[0]))}.`,
      );
    case 'ObserverMustSelectNone':
      return f('plan-rejected', 'C is only an observer and cannot take part with a promise.');
    case 'BadPackageLength':
      return f('plan-rejected', `The package must contain exactly one entry per NPC (it had ${stringifyArg(args[0])}).`);
    case 'DuplicateNpc':
      return f('plan-rejected', `The package lists ${npcName(num(args[0]))} more than once.`);
    case 'InvalidNpc':
      return f('plan-rejected', `The package names an NPC that does not exist (#${stringifyArg(args[0])}).`);
    case 'InsufficientStock':
      return f(
        'plan-rejected',
        `${npcName(num(args[0]))} does not hold enough: it has ${stringifyArg(args[2])}, the package needs ${stringifyArg(args[3])}.`,
      );
    case 'GoalNotSatisfied':
      return f('plan-rejected', `${npcName(num(args[0]))}'s goal would not be met after the exchange.`);
    default:
      return f(
        'unknown-contract-error',
        `The contract rejected the call with ${err.name}(${args.map(stringifyArg).join(', ')}).`,
      );
  }
}

// ----------------------------------------------------------------------------- classification

export type ClassifiedError =
  | { type: 'user-rejected'; message: string }
  | { type: 'wrong-network'; message: string }
  | { type: 'contract'; failure: Failure }
  | { type: 'rpc'; failure: Failure };

const HEX_RE = /^0x[0-9a-fA-F]*$/;

function isHex(v: unknown): v is Hex {
  return typeof v === 'string' && HEX_RE.test(v);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

/** Walks `err` and its `.cause` chain (bounded, cycle-safe). */
export function errorChain(err: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && out.length < 12 && !seen.has(cur)) {
    seen.add(cur);
    const rec = asRecord(cur);
    if (!rec) break;
    out.push(rec);
    cur = rec.cause;
  }
  return out;
}

export function isUserRejection(err: unknown): boolean {
  return errorChain(err).some(
    (e) => e.code === 4001 || e.code === 'ACTION_REJECTED' || e.name === 'UserRejectedRequestError',
  );
}

/** Finds revert data anywhere in the chain (viem ContractFunctionRevertedError.raw, RawContractError.data, RPC data). */
export function findRevertData(err: unknown): Hex | null {
  for (const e of errorChain(err)) {
    if (isHex(e.raw) && e.raw.length >= 10) return e.raw;
    if (isHex(e.data) && e.data.length >= 10) return e.data;
    const nested = asRecord(e.data);
    if (nested && isHex(nested.data) && nested.data.length >= 10) return nested.data;
  }
  return null;
}

function isRevert(err: unknown): boolean {
  return errorChain(err).some(
    (e) =>
      e.name === 'ContractFunctionRevertedError' ||
      e.name === 'RawContractError' ||
      e.name === 'ExecutionRevertedError' ||
      (typeof e.message === 'string' && /execution reverted/i.test(e.message) && e.code !== 4001),
  );
}

/** Transport-level failure (RPC down, timeout, refused) anywhere in the chain. */
export function isNetworkError(err: unknown): boolean {
  return errorChain(err).some(
    (x) =>
      x.name === 'HttpRequestError' ||
      x.name === 'TimeoutError' ||
      x.name === 'WebSocketRequestError' ||
      (typeof x.message === 'string' && /fetch failed|Failed to fetch|ECONNREFUSED|NetworkError|Load failed/i.test(x.message)),
  );
}

export const RPC_UNREACHABLE = 'The local chain could not be reached';

function shortMessage(err: unknown): string {
  for (const e of errorChain(err)) {
    if (typeof e.shortMessage === 'string' && e.shortMessage) return e.shortMessage;
  }
  const first = asRecord(err);
  if (first && typeof first.message === 'string') return first.message.split('\n')[0] ?? 'Unknown error';
  return String(err);
}

/**
 * Classifies any error from a read, simulation, wallet request or transaction.
 * Order: user rejection → chain mismatch → decodable contract error → revert without known data → RPC/network.
 */
export function classifyError(err: unknown, rules?: readonly NpcRulesView[] | null): ClassifiedError {
  if (isUserRejection(err)) {
    return { type: 'user-rejected', message: 'You rejected the request in the wallet. Nothing was sent.' };
  }
  if (errorChain(err).some((e) => e.name === 'ChainMismatchError' || e.code === 4901)) {
    return { type: 'wrong-network', message: 'The wallet is on a different network than the local Anvil chain.' };
  }
  const data = findRevertData(err);
  if (!data && isNetworkError(err)) {
    return { type: 'rpc', failure: { kind: 'rpc', message: `${RPC_UNREACHABLE}: ${shortMessage(err)}` } };
  }
  const decoded = decodeRevertData(data);
  if (decoded) return { type: 'contract', failure: describeContractError(decoded, rules) };
  if (data) {
    return {
      type: 'contract',
      failure: {
        kind: 'unknown-contract-error',
        message: `The contract reverted with an error this interface cannot decode (selector ${data.slice(0, 10)}).`,
        errorName: data.slice(0, 10),
        rawData: data,
      },
    };
  }
  if (isRevert(err)) {
    return {
      type: 'contract',
      failure: {
        kind: 'unknown-contract-error',
        message: `The contract reverted without readable error data: ${shortMessage(err)}`,
      },
    };
  }
  return {
    type: 'rpc',
    failure: { kind: 'rpc', message: `${RPC_UNREACHABLE} or answered with an error: ${shortMessage(err)}` },
  };
}
