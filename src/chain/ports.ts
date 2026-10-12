// Boundaries the controller depends on. Real implementations: clients.ts (wallet), game.ts (chain),
// deployment.ts (manifest). Tests pass fakes, so the state machine is checked without a browser or RPC.

import type { PendingStore } from './pending';
import type {
  Address,
  ChainEvent,
  DeploymentCheck,
  DeploymentManifest,
  Hex,
  NpcRulesView,
  PlannedTransfer,
  RunView,
  SelectionEntry,
  TxView,
} from './types';

export interface WalletEvents {
  accountsChanged(accounts: Address[]): void;
  chainChanged(chainId: number): void;
  disconnect(): void;
}

export interface WalletGateway {
  /** Silent eth_accounts (allowed on boot). */
  accounts(): Promise<Address[]>;
  /** eth_requestAccounts — only ever called from connect(). */
  requestAccounts(): Promise<Address[]>;
  chainId(): Promise<number>;
  /** wallet_switchEthereumChain (and add, if the wallet does not know the chain) — explicit click only. */
  switchChain(manifest: DeploymentManifest): Promise<void>;
  subscribe(events: WalletEvents): () => void;
}

export interface ExecuteArgs {
  account: Address;
  runId: bigint;
  package: readonly SelectionEntry[];
  expectedNonce: bigint;
  expectedSnapshotHash: Hex;
}

export interface ReceiptResult {
  hash: Hex;
  status: 'success' | 'reverted';
  blockNumber: bigint;
  blockHash: Hex;
  /** Recipient of the mined tx (null for a contract creation). */
  to: Address | null;
  events: ChainEvent[];
}

export interface Replacement {
  reason: 'replaced' | 'cancelled' | 'repriced';
  newHash: Hex;
}

export interface RunHistory {
  startRun: TxView | null;
  execute: TxView | null;
}

export interface ChainGateway {
  readonly manifest: DeploymentManifest;
  /** coordinator + deployBlockHash; a redeploy changes it. */
  readonly deploymentKey: string;
  readRules(): Promise<NpcRulesView[]>;
  /** runOf + snapshotBalances + currentSnapshotHash read at ONE block. null when the run does not exist. */
  readRun(runId: bigint): Promise<RunView | null>;
  readOutgoing(npcId: number, offerId: Hex): Promise<{ hasTransfer: boolean; transfer: PlannedTransfer }>;
  /** eth_call of execute() from `account`; throws the revert. Optional block for replaying a mined revert. */
  simulateExecute(args: ExecuteArgs, blockNumber?: bigint): Promise<void>;
  sendStartRun(account: Address): Promise<Hex>;
  sendExecute(args: ExecuteArgs): Promise<Hex>;
  waitForReceipt(hash: Hex, onReplaced: (r: Replacement) => void): Promise<ReceiptResult>;
  /** null while not mined. */
  getReceipt(hash: Hex): Promise<ReceiptResult | null>;
  /** Whether the node knows the tx at all (mined or in the pool). */
  hasTransaction(hash: Hex): Promise<boolean>;
  /** RunStarted / LevelSolved logs of this run (getLogs from the deploy block), with their receipts. */
  readRunHistory(runId: bigint): Promise<RunHistory>;
  /**
   * Cheap re-validation against the live chain before a send / on recheck: re-fetched manifest (no-store)
   * has the same deploymentKey, chainId matches, deploy block hash matches, coordinator has code.
   */
  revalidate(): Promise<DeploymentCheck>;
  /** Stops in-flight receipt waits (they reject) — called on controller dispose. */
  dispose(): void;
}

export interface DeploymentResult {
  check: DeploymentCheck;
  gateway: ChainGateway | null;
}

export interface ControllerEnv {
  loadDeployment(): Promise<DeploymentResult>;
  /** null → no EIP-1193 provider (phase no-wallet). */
  wallet: WalletGateway | null;
  pending: PendingStore;
  now?(): string;
}
