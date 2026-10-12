// Stage 3 — shared types for the Local chain (Anvil) mode.
// Owner: orchestrator. opus-chain implements the controller against these types, opus-ui renders them.
// No React imports here; no demo-engine imports (the Demo mode stays a separate module).

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** Written by scripts/chain/* after a real deployment; served at /local-deployment.json (dev/preview only). */
export interface DeploymentManifest {
  schema: 1;
  /** Always 31337 for Anvil; checked against eth_chainId of `rpcUrl`. */
  chainId: number;
  /** Loopback only (127.0.0.1 / localhost). */
  rpcUrl: string;
  deployer: Address;
  coordinator: Address;
  items: Address;
  npcA: Address;
  npcB: Address;
  npcC: Address;
  deployTxHash: Hex;
  deployBlockNumber: string; // decimal string (bigint-safe)
  deployBlockHash: Hex; // used to detect an Anvil restart that reused the same addresses
  /** sha256 over contracts/src/**.sol (sorted) at deployment time. */
  sourceId: string;
  forgeVersion: string;
  createdAt: string; // ISO
}

export type DeploymentCheck =
  | { ok: true; manifest: DeploymentManifest }
  | {
      ok: false;
      /** missing = no manifest; unreachable = RPC down; stale = no code / hash mismatch / wiring mismatch. */
      reason: 'missing' | 'invalid' | 'non-loopback-rpc' | 'unreachable' | 'stale' | 'wrong-chain';
      detail: string;
    };

/** Item ids and NPC ids as in the contracts. */
export const KEY = 1;
export const COIN = 2;
export const NPC_IDS = { A: 0, B: 1, C: 2 } as const;

/** Canonical balances as returned by items.snapshotBalances: [A.KEY, A.COIN, B.KEY, B.COIN, C.KEY, C.COIN]. */
export type Balances = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

export interface NpcRulesView {
  npcId: number;
  address: Address;
  offerId: Hex; // bytes32(0) for the observer
  giveTo: number;
  giveItem: number;
  giveQty: number;
  needFrom: number;
  needItem: number;
  needQty: number;
  goalKey: number;
  goalCoin: number;
}

export interface RunView {
  runId: bigint;
  owner: Address;
  active: boolean;
  solved: boolean;
  /** Game nonce of the coordinator (NOT the account nonce). */
  nonce: bigint;
  balances: Balances;
  snapshotHash: Hex;
}

/** What the player can choose: only registered offer ids; C is always NONE. */
export interface Choice {
  A: boolean; // true = NPC_A's own offer, false = NONE
  B: boolean; // true = NPC_B's own offer, false = NONE
}

export interface PlannedTransfer {
  fromNpc: number;
  toNpc: number;
  item: number;
  qty: number;
}

export interface SelectionEntry {
  npcId: number;
  offerId: Hex;
}

/** A frozen, simulated execute call. `execute` sends exactly these values. */
export interface PreviewPlan {
  account: Address;
  runId: bigint;
  package: readonly SelectionEntry[];
  expectedNonce: bigint;
  expectedSnapshotHash: Hex;
  before: Balances;
  transfers: readonly PlannedTransfer[];
  /** Locally derived from the NPCs' immutable offers; verified against the chain after the receipt. */
  expectedAfter: Balances;
  /** True only if eth_call of the very same execute() succeeded. */
  simulated: true;
  chainId: number;
  deploymentKey: string;
}

export type FailureKind =
  | 'incomplete-selection' // contract rejected: promise missing / not satisfied
  | 'plan-rejected'
  | 'stale'
  | 'not-owner'
  | 'already-solved'
  | 'unknown-contract-error'
  | 'rpc';

export interface Failure {
  kind: FailureKind;
  /** Human sentence; for unknown errors: the honest raw reason. */
  message: string;
  /** Decoded custom error name / args when known, else the raw selector/data. */
  errorName?: string;
  errorArgs?: readonly string[];
  rawData?: Hex;
}

export type TxStatus =
  | 'awaiting-wallet'
  | 'pending'
  | 'confirmed' // receipt success
  | 'reverted' // receipt reverted
  | 'rejected' // user rejected in the wallet (nothing sent)
  | 'replaced'
  | 'cancelled'
  | 'unknown'; // sent but outcome not readable yet

export interface ChainEvent {
  name: string; // e.g. LevelSolved, ItemMoved, PermitIssued, PermitConsumed, RunStarted
  address: Address;
  args: Record<string, string>;
  logIndex: number;
}

export interface TxView {
  kind: 'startRun' | 'execute';
  hash: Hex | null;
  status: TxStatus;
  blockNumber: bigint | null;
  blockHash: Hex | null;
  receiptStatus: 'success' | 'reverted' | null;
  events: readonly ChainEvent[];
  /** hash of the replacing tx when status = replaced / cancelled (kept for compatibility; see `replacement`). */
  replacedBy: Hex | null;
  /**
   * Evidence of the transaction that actually got mined in place of `hash` (status replaced/cancelled).
   * For those statuses the receipt fields above (blockNumber, blockHash, receiptStatus, events) belong to
   * the ORIGINAL hash and are empty/null (it was never mined); the mined tx lives only here.
   */
  replacement: ReplacementView | null;
}

export interface ReplacementView {
  hash: Hex;
  blockNumber: bigint | null;
  blockHash: Hex | null;
  receiptStatus: 'success' | 'reverted' | null;
  events: readonly ChainEvent[];
  /** 'cancelled' = the replacement is a plain self-transfer / nothing of ours executed. */
  reason: 'replaced' | 'cancelled' | 'repriced';
  /**
   * The hash that was originally sent (and never mined). Always set by the controller for every
   * replacement reason, including 'repriced' where TxView.hash is the mined hash.
   */
  originalHash?: Hex | null;
}

/** Everything the Proof panel shows; unknown values are null and rendered as "Not available". */
export interface ProofData {
  mode: 'Local chain';
  chainId: number | null;
  rpcUrl: string | null;
  coordinator: Address | null;
  items: Address | null;
  npcA: Address | null;
  npcB: Address | null;
  npcC: Address | null;
  player: Address | null;
  runId: bigint | null;
  startRunTx: TxView | null;
  executeTx: TxView | null;
  finalBalances: Balances | null;
}

export type Phase =
  | 'booting' // reading deployment / provider
  | 'deployment-error' // see deploymentError
  | 'no-wallet' // no EIP-1193 provider found
  | 'disconnected'
  | 'wrong-network'
  | 'loading' // reading run state
  | 'rpc-unavailable'
  | 'no-run' // connected, correct network, no run yet
  | 'starting-run' // startRun in flight (awaiting-wallet or pending)
  | 'idle' // active run, selection being made
  | 'previewing'
  | 'preview-ready'
  | 'preview-failed'
  | 'stale-preview'
  | 'executing' // awaiting-wallet or pending (see tx.status)
  | 'verifying' // receipt in, reading contracts back
  | 'success' // confirmed AND contract state agrees
  | 'reverted'
  | 'user-rejected'
  | 'read-failed' // outcome unknown: receipt known/unknown but readback failed; offer recheck
  | 'already-solved'; // restored from contracts after reload / other session

export interface ChainLevelState {
  phase: Phase;
  deployment: DeploymentCheck | null;
  account: Address | null;
  walletChainId: number | null;
  rules: readonly NpcRulesView[] | null;
  run: RunView | null;
  choice: Choice;
  preview: PreviewPlan | null;
  failure: Failure | null;
  tx: TxView | null; // current / last operation
  proof: ProofData;
  /** One polite status sentence for the live region; changes only on real transitions. */
  announcement: string;
  /** True while an account/network change invalidated an in-flight operation's result. */
  invalidatedOperation: boolean;
}

export interface ChainLevelActions {
  connect(): Promise<void>; // user-initiated eth_requestAccounts
  switchNetwork(): Promise<void>; // user-initiated wallet_switchEthereumChain
  startRun(): Promise<void>;
  setChoice(next: Choice): void;
  preview(): Promise<void>;
  execute(): Promise<void>; // sends exactly state.preview; no-op when not preview-ready; single-flight
  recheck(): Promise<void>; // re-read contracts / pending tx
  dismiss(): void; // clear failure / user-rejected back to idle
}

export interface ChainLevelController {
  getState(): ChainLevelState;
  subscribe(listener: () => void): () => void;
  actions: ChainLevelActions;
  dispose(): void;
}

/** Pending-tx record persisted in localStorage — the ONLY thing stored; never `solved`. */
export interface PendingRecord {
  hash: Hex;
  kind: 'startRun' | 'execute';
  account: Address;
  chainId: number;
  /** coordinator address + deployBlockHash, so a redeploy invalidates it. */
  deploymentKey: string;
  savedAt: string;
}
