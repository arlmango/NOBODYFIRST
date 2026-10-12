// React binding for the Local chain level controller (src/chain), plus small display helpers.
// The controller owns all chain state; this hook only subscribes to it (useSyncExternalStore),
// creates it after mount (never during render) and disposes it on unmount.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createChainLevelController } from '../chain';
import {
  COIN,
  KEY,
  type Address,
  type Balances,
  type ChainLevelActions,
  type ChainLevelController,
  type ChainLevelState,
  type DeploymentCheck,
  type Hex,
  type NpcRulesView,
  type PlannedTransfer,
} from '../chain/types';

export interface ChainLevel {
  /** null until the controller exists (first render after mount). */
  state: ChainLevelState | null;
  actions: ChainLevelActions | null;
}

const noopUnsubscribe = () => {};

export function useChainLevel(factory?: () => ChainLevelController): ChainLevel {
  const [controller, setController] = useState<ChainLevelController | null>(null);

  useEffect(() => {
    const created = factory ? factory() : createChainLevelController();
    setController(created);
    return () => created.dispose();
  }, [factory]);

  const subscribe = useCallback(
    (listener: () => void) => (controller ? controller.subscribe(listener) : noopUnsubscribe),
    [controller],
  );
  const getSnapshot = useCallback(() => (controller ? controller.getState() : null), [controller]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { state, actions: controller ? controller.actions : null };
}

/** Fire-and-forget for user-initiated controller actions. The controller reports every outcome
 *  through its state; a rejection here would only be an unhandled-promise error. */
export function runAction(action: () => Promise<void>): void {
  action().catch(() => {});
}

// ---------- Display helpers (real values only) ----------

export const NPC_LETTERS = ['A', 'B', 'C'] as const;
export type NpcLetter = (typeof NPC_LETTERS)[number];

export const NOT_AVAILABLE = 'Not available';

export function npcLetter(id: number): string {
  return NPC_LETTERS[id] ?? `NPC ${id}`;
}

export function itemKind(item: number): 'KEY' | 'COIN' | null {
  return item === KEY ? 'KEY' : item === COIN ? 'COIN' : null;
}

/** "1 key", "2 coins"; unknown item ids are shown honestly. */
export function formatQty(item: number, qty: number | bigint): string {
  const n = typeof qty === 'bigint' ? qty.toString() : String(qty);
  const one = n === '1';
  if (item === KEY) return `${n} ${one ? 'key' : 'keys'}`;
  if (item === COIN) return `${n} ${one ? 'coin' : 'coins'}`;
  return `${n} × item ${item}`;
}

export interface Holding {
  key: bigint;
  coin: bigint;
}

/** Balances layout: [A.KEY, A.COIN, B.KEY, B.COIN, C.KEY, C.COIN]. */
export function holdingOf(balances: Balances, npcId: number): Holding {
  return { key: balances[npcId * 2] ?? 0n, coin: balances[npcId * 2 + 1] ?? 0n };
}

/** "1 key", "1 key, 1 coin" or "empty". */
export function formatHolding(h: Holding): string {
  const parts: string[] = [];
  if (h.key > 0n) parts.push(formatQty(KEY, h.key));
  if (h.coin > 0n) parts.push(formatQty(COIN, h.coin));
  return parts.length ? parts.join(', ') : 'empty';
}

export function balancesEqual(a: Balances, b: Balances): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** A real 32-byte hash, never an all-zero placeholder. */
export function realHash(value: Hex | null | undefined): Hex | null {
  return value && HASH_RE.test(value) && !/^0x0+$/.test(value) ? value : null;
}

export function realAddress(value: Address | null | undefined): Address | null {
  return value && ADDRESS_RE.test(value) && !/^0x0+$/.test(value) ? value : null;
}

/** Observer: no registered offer (bytes32(0)) or nothing to give. */
export function isObserver(rule: NpcRulesView): boolean {
  return /^0x0*$/.test(rule.offerId) || rule.giveQty === 0;
}

/** "A → B: 1 key". */
export function formatTransfer(t: PlannedTransfer): string {
  return `${npcLetter(t.fromNpc)} → ${npcLetter(t.toNpc)}: ${formatQty(t.item, t.qty)}`;
}

/** "Has 1 key" / "Has nothing". */
export function hasText(h: Holding): string {
  const text = formatHolding(h);
  return `Has ${text === 'empty' ? 'nothing' : text}`;
}

export function deploymentMessage(deployment: DeploymentCheck | null): string {
  if (!deployment || deployment.ok) return 'The local deployment could not be validated.';
  switch (deployment.reason) {
    case 'missing':
      return 'No local deployment found: contracts/deployments/local-anvil.json is missing or not served.';
    case 'invalid':
      return 'The local deployment file is not valid.';
    case 'non-loopback-rpc':
      return 'The deployment points to a non-local RPC address. Only 127.0.0.1 or localhost is allowed.';
    case 'unreachable':
      return 'The local chain does not answer at the RPC address of the deployment.';
    case 'stale':
      return 'The deployment does not match the running chain (for example, Anvil was restarted). Deploy again.';
    case 'wrong-chain':
      return 'The chain ID of the local RPC does not match the deployment.';
  }
}
