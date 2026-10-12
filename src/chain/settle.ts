// Settling a sent transaction: wait for the receipt (replacement-aware), then read the contracts back.
// Success only when the receipt succeeded AND the readback agrees (see unmetSuccessChecks).
// A replaced/cancelled tx keeps its own (original) hash; the mined replacement's data goes into
// TxView.replacement — the two are never mixed.

import { argsOf, lower, phaseFromRun, txStub, unmetSuccessChecks } from './controller-helpers';
import { classifyError } from './errors';
import type { PendingStore } from './pending';
import { runIdOf } from './plan';
import type { ChainGateway, ReceiptResult, Replacement } from './ports';
import { replacementView, txViewFromReceipt } from './txview';
import type { Address, ChainLevelState, Failure, Hex, NpcRulesView, PreviewPlan, RunView, TxView } from './types';

export interface VerifyCtx {
  kind: 'startRun' | 'execute';
  hash: Hex;
  /** The frozen preview that was sent; null when resumed from a pending record after reload. */
  plan: PreviewPlan | null;
}

export interface SettleDeps {
  gateway: ChainGateway;
  pending: PendingStore;
  account: Address;
  rules: readonly NpcRulesView[] | null;
  /** False once the generation changed (account/network switch) or the controller was disposed. */
  isCurrent(): boolean;
  getTx(): TxView | null;
  set(patch: Partial<ChainLevelState>, announcement?: string): void;
  /** Remembers what `recheck()` should verify again (null = nothing; recheck then re-reads contracts). */
  setVerify(ctx: VerifyCtx | null): void;
  /** The wallet re-priced the tx (same call, new hash): the pending record must follow the new hash. */
  onRepriced(oldHash: Hex, newHash: Hex): void;
}

const msg = (e: unknown) => (e as Error)?.message ?? String(e);

/** 'cancelled' unless the mined replacement is a call to the coordinator that emitted events of ours. */
export function replacementReason(rep: Replacement, receipt: ReceiptResult, coordinator: Address): 'replaced' | 'cancelled' {
  if (rep.reason === 'cancelled') return 'cancelled';
  if (!receipt.to || lower(receipt.to) !== lower(coordinator) || receipt.events.length === 0) return 'cancelled';
  return 'replaced';
}

export async function settleTx(d: SettleDeps, v: VerifyCtx): Promise<void> {
  const gw = d.gateway;
  let follow: VerifyCtx = v; // the hash we are waiting for (moves on a re-price)
  let replaced: Replacement | null = null;
  let receipt: ReceiptResult;
  const clearAll = (...hashes: Hex[]) => {
    for (const h of new Set([v.hash, follow.hash, ...hashes])) d.pending.clear(d.account, gw.manifest.chainId, gw.deploymentKey, h);
  };
  try {
    receipt = await gw.waitForReceipt(v.hash, (r) => {
      replaced = r;
      if (!d.isCurrent()) return;
      if (r.reason === 'repriced') {
        d.onRepriced(follow.hash, r.newHash);
        follow = { ...follow, hash: r.newHash };
      }
      const tx = d.getTx();
      if (tx) d.set({ tx: { ...tx, replacedBy: r.newHash } });
    });
  } catch (e) {
    if (!d.isCurrent()) return;
    d.setVerify(follow);
    const tx = d.getTx();
    d.set({
      phase: 'read-failed',
      tx: tx ? { ...tx, status: 'unknown' } : null,
      failure: { kind: 'rpc', message: `Transaction ${follow.hash} was sent, but its receipt could not be read: ${msg(e)}` },
    });
    return;
  }
  if (!d.isCurrent()) return;
  const rep = replaced as Replacement | null;

  if (rep && rep.reason !== 'repriced') {
    const reason = replacementReason(rep, receipt, gw.manifest.coordinator);
    clearAll(receipt.hash);
    const tx: TxView = { ...txStub(v.kind, reason, v.hash), replacedBy: receipt.hash, replacement: replacementView(reason, receipt, v.hash) };
    d.set({ tx, preview: null });
    const note =
      reason === 'cancelled'
        ? `Your transaction ${v.hash} was cancelled in the wallet (replaced by ${receipt.hash}); nothing from it was executed.`
        : `Your transaction ${v.hash} was replaced in the wallet by ${receipt.hash}; the state shown is read from the contracts.`;
    return readBack(d, null, null, note);
  }
  const tx: TxView =
    rep?.reason === 'repriced'
      ? { ...txViewFromReceipt(v.kind, receipt), replacedBy: receipt.hash, replacement: replacementView('repriced', receipt, v.hash) }
      : txViewFromReceipt(v.kind, receipt);
  if (receipt.status === 'reverted') {
    clearAll(receipt.hash);
    let failure: Failure = {
      kind: 'unknown-contract-error',
      message: 'The transaction was mined but reverted. Nothing changed; the reason could not be reproduced.',
    };
    if (v.kind === 'execute' && v.plan && receipt.blockNumber > 0n) {
      // Replay the same call on the parent block to name the reason (best effort; the receipt is the fact).
      try {
        await gw.simulateExecute(argsOf(v.plan), receipt.blockNumber - 1n);
      } catch (e) {
        const c = classifyError(e, d.rules);
        if (c.type === 'contract') failure = c.failure;
      }
      if (!d.isCurrent()) return;
    }
    d.set({ tx, phase: 'reverted', failure });
    return;
  }
  d.set({ tx, phase: v.kind === 'execute' ? 'verifying' : 'starting-run' });
  return readBack(d, { ...follow, hash: receipt.hash }, receipt);
}

/**
 * Re-reads the run after a receipt. A failed read is 'read-failed' (kind rpc, recheck can fix it); a read
 * that disagrees is 'read-failed' (kind unknown-contract-error) — never success.
 * `v` null = after a replacement: only the contract state is restored.
 */
async function readBack(d: SettleDeps, v: VerifyCtx | null, receipt: ReceiptResult | null, note?: string): Promise<void> {
  const gw = d.gateway;
  let run: RunView | null;
  try {
    run = await gw.readRun(runIdOf(d.account));
  } catch (e) {
    if (!d.isCurrent()) return;
    d.setVerify(v);
    d.set({
      phase: 'read-failed',
      failure: { kind: 'rpc', message: `The transaction has a receipt, but the contracts could not be read back: ${msg(e)}` },
    });
    return;
  }
  if (!d.isCurrent()) return;
  d.setVerify(null);
  if (!receipt || !v) {
    d.set({ run, phase: phaseFromRun(run), failure: null }, note);
    return;
  }
  const clear = () => d.pending.clear(d.account, gw.manifest.chainId, gw.deploymentKey, v.hash);
  if (v.kind === 'startRun') {
    clear();
    d.set({ run, phase: phaseFromRun(run), failure: null });
    return;
  }
  const problems = unmetSuccessChecks({ run, plan: v.plan, receipt, coordinator: gw.manifest.coordinator, account: d.account });
  if (problems.length === 0) {
    clear();
    d.set({ run, phase: 'success', failure: null });
  } else if (!v.plan && run?.solved) {
    // Resumed after reload without the preview: the contracts are the only source of truth.
    clear();
    d.set({ run, phase: 'already-solved', failure: null });
  } else {
    d.setVerify(v);
    d.set({
      run,
      phase: 'read-failed',
      failure: {
        kind: 'unknown-contract-error',
        message: `The transaction was confirmed and the contracts were read, but they disagree with the expected result: ${problems.join('; ')}.`,
      },
    });
  }
}

/** Pending-record lookup after reload: mined receipt, or whether the node still knows the tx. */
export async function lookupTx(gw: ChainGateway, hash: Hex): Promise<{ receipt: ReceiptResult | null; known: boolean }> {
  try {
    const receipt = await gw.getReceipt(hash);
    return { receipt, known: receipt ? true : await gw.hasTransaction(hash) };
  } catch {
    return { receipt: null, known: true }; // cannot tell: keep the record, show contract state
  }
}
