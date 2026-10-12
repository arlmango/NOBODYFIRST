// Pure helpers of the ChainLevelController (no I/O, no closures over controller state).

import { classifyError } from './errors';
import { announcementFor } from './messages';
import { balancesEqual, runIdOf } from './plan';
import type { ExecuteArgs, ReceiptResult } from './ports';
import type { Address, ChainLevelState, Choice, Failure, Hex, NpcRulesView, Phase, PreviewPlan, ProofData, RunView, TxStatus, TxView } from './types';

export const NO_CHOICE: Choice = Object.freeze({ A: false, B: false });

export const lower = (a: string | null | undefined) => (a ?? '').toLowerCase();

/** Phases in which an active run is shown and the choice / preview may change. */
export const RUN_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'idle',
  'preview-ready',
  'preview-failed',
  'stale-preview',
  'user-rejected',
  'reverted',
]);

export interface TxHistory {
  startRun: TxView | null;
  execute: TxView | null;
}

export function emptyProof(): ProofData {
  return {
    mode: 'Local chain',
    chainId: null,
    rpcUrl: null,
    coordinator: null,
    items: null,
    npcA: null,
    npcB: null,
    npcC: null,
    player: null,
    runId: null,
    startRunTx: null,
    executeTx: null,
    finalBalances: null,
  };
}

/** Proof data derived only from verified deployment, wallet account, contract reads and receipts. */
export function proofOf(s: ChainLevelState, history: TxHistory): ProofData {
  const m = s.deployment?.ok ? s.deployment.manifest : null;
  return {
    mode: 'Local chain',
    chainId: m?.chainId ?? null,
    rpcUrl: m?.rpcUrl ?? null,
    coordinator: m?.coordinator ?? null,
    items: m?.items ?? null,
    npcA: m?.npcA ?? null,
    npcB: m?.npcB ?? null,
    npcC: m?.npcC ?? null,
    player: s.account,
    runId: s.account ? runIdOf(s.account) : null,
    startRunTx: history.startRun,
    executeTx: history.execute,
    finalBalances: s.run?.solved ? s.run.balances : null,
  };
}

export function initialState(): ChainLevelState {
  return {
    phase: 'booting',
    deployment: null,
    account: null,
    walletChainId: null,
    rules: null,
    run: null,
    choice: NO_CHOICE,
    preview: null,
    failure: null,
    tx: null,
    proof: emptyProof(),
    announcement: announcementFor('booting'),
    invalidatedOperation: false,
  };
}

export function phaseFromRun(run: RunView | null): Phase {
  if (!run) return 'no-run';
  return run.solved ? 'already-solved' : 'idle';
}

export function txStub(kind: TxView['kind'], status: TxStatus, hash: Hex | null = null): TxView {
  return { kind, hash, status, blockNumber: null, blockHash: null, receiptStatus: null, events: [], replacedBy: null, replacement: null };
}

export function argsOf(p: PreviewPlan): ExecuteArgs {
  return { account: p.account, runId: p.runId, package: p.package, expectedNonce: p.expectedNonce, expectedSnapshotHash: p.expectedSnapshotHash };
}

/**
 * Success criteria for a confirmed execute: run solved, ledger == expectedAfter, LevelSolved for this run
 * emitted by the coordinator in this receipt. Returns the unmet criteria (empty = success).
 */
export function unmetSuccessChecks(args: {
  run: RunView | null;
  plan: PreviewPlan | null;
  receipt: ReceiptResult;
  coordinator: Address;
  account: Address;
}): string[] {
  const { run, plan, receipt, coordinator, account } = args;
  const runId = runIdOf(account).toString();
  const solvedEvent = receipt.events.some(
    (ev) => ev.name === 'LevelSolved' && lower(ev.address) === lower(coordinator) && ev.args.runId === runId,
  );
  const problems: string[] = [];
  if (receipt.status !== 'success') problems.push('the receipt status is not success');
  if (!run?.solved) problems.push('the run is not marked solved');
  if (!plan) problems.push('the expected result of this transaction is not known in this session');
  else if (!balancesEqual(run?.balances, plan.expectedAfter)) problems.push('the ledger balances differ from the expected result');
  if (!solvedEvent) problems.push('no LevelSolved event for this run is in the receipt');
  return problems;
}

/**
 * State patch after a send attempt failed before a hash existed. Wallet rejection → user-rejected (never
 * "reverted"); a wallet-side revert/RPC error → shown as "Not sent" with the decoded reason.
 */
export function sendFailure(kind: TxView['kind'], e: unknown, rules: readonly NpcRulesView[] | null): Partial<ChainLevelState> {
  const c = classifyError(e, rules);
  if (c.type === 'user-rejected') return { phase: 'user-rejected', tx: txStub(kind, 'rejected'), failure: null };
  if (c.type === 'wrong-network') return { phase: 'wrong-network', tx: null, failure: null };
  const failure: Failure =
    c.type === 'contract'
      ? { ...c.failure, message: `Not sent: ${c.failure.message}` }
      : { ...c.failure, message: `Not sent: the wallet returned an error and no transaction hash. ${c.failure.message}` };
  return { phase: kind === 'execute' ? 'preview-failed' : 'no-run', tx: null, failure };
}

/** A rejected connect/switch is announced, not shown as an error; other errors are shown as-is. */
export function walletFailure(
  e: unknown,
  rejectedNote: string,
  phase: 'disconnected' | 'wrong-network',
): [Partial<ChainLevelState>, string | undefined] {
  const c = classifyError(e);
  const failure = c.type === 'contract' || c.type === 'rpc' ? c.failure : null;
  return [{ phase, failure }, c.type === 'user-rejected' ? rejectedNote : undefined];
}
