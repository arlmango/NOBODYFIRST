// ChainLevelController: the Local chain state machine. All state comes from the contracts; the only
// persisted item is a PendingRecord. Guards: single-flight op, generation token (account/network
// change, deployment loss, dispose), deployment re-validation + stale-preview re-read right before every
// send, success only after receipt + readback + LevelSolved.

import {
  argsOf,
  initialState,
  lower,
  NO_CHOICE,
  phaseFromRun,
  proofOf,
  RUN_PHASES,
  sendFailure,
  txStub,
  walletFailure,
  type TxHistory,
} from './controller-helpers';
import { classifyError, isNetworkError, RPC_UNREACHABLE } from './errors';
import { announcementFor, STALE } from './messages';
import { runIdOf } from './plan';
import type { ChainGateway, ControllerEnv } from './ports';
import { computePreview } from './preview-build';
import { lookupTx, settleTx, type VerifyCtx } from './settle';
import { txViewFromReceipt } from './txview';
import type { Address, ChainLevelController, ChainLevelState, Choice, DeploymentCheck, Failure, RunView, TxView } from './types';

type OpKind = 'startRun' | 'preview' | 'execute' | 'recheck' | 'connect' | 'switch';
interface Op {
  readonly kind: OpKind;
}

export interface InternalController extends ChainLevelController {
  /** Resolves when the initial boot finished (tests). */
  readonly ready: Promise<void>;
}

const msg = (e: unknown) => (e as Error)?.message ?? String(e);

export function createController(env: ControllerEnv): InternalController {
  let gen = 0;
  let op: Op | null = null;
  let disposed = false;
  let gateway: ChainGateway | null = null;
  let unsubscribeWallet: (() => void) | null = null;
  let verifyCtx: VerifyCtx | null = null;
  let history: TxHistory = { startRun: null, execute: null };
  const listeners = new Set<() => void>();
  const now = env.now ?? (() => new Date().toISOString());

  let state: ChainLevelState = initialState();


  function set(patch: Partial<ChainLevelState>, announcement?: string): void {
    if (disposed) return;
    const next: ChainLevelState = { ...state, ...patch };
    if (patch.tx) history = { ...history, [patch.tx.kind]: patch.tx };
    const phaseChanged = next.phase !== state.phase;
    next.announcement = announcement ?? (phaseChanged ? announcementFor(next.phase) : state.announcement);
    next.proof = proofOf(next, history);
    state = next;
    for (const l of [...listeners]) l();
  }

  const current = (g: number) => !disposed && g === gen;

  function begin(kind: OpKind): Op | null {
    if (op || disposed) return null;
    op = { kind };
    if (state.invalidatedOperation) set({ invalidatedOperation: false });
    return op;
  }
  function end(o: Op): void {
    if (op === o) op = null;
  }

  /** Account/network change: stale async results are ignored from now on. */
  function invalidate(): void {
    gen++;
    const hadOp = op !== null && op.kind !== 'connect' && op.kind !== 'switch';
    op = null;
    verifyCtx = null;
    history = { startRun: null, execute: null };
    set({ run: null, preview: null, failure: null, tx: null, choice: NO_CHOICE, invalidatedOperation: hadOp || state.invalidatedOperation });
  }

  const manifest = () => (state.deployment?.ok ? state.deployment.manifest : null);
  const rpcFailure = (message: string): Failure => ({ kind: 'rpc', message });

  /** The verified deployment no longer matches the chain: drop everything read from it. */
  function deploymentLost(check: Extract<DeploymentCheck, { ok: false }>): void {
    gen++;
    verifyCtx = null;
    history = { startRun: null, execute: null };
    const unreachable = check.reason === 'unreachable';
    if (!unreachable) gateway = null;
    set({
      ...(unreachable ? {} : { deployment: check }),
      phase: unreachable ? 'rpc-unavailable' : 'deployment-error',
      run: null,
      preview: null,
      tx: null,
      failure: unreachable ? rpcFailure(`${RPC_UNREACHABLE}. ${check.detail}`) : null,
    });
  }

  /** Cheap live re-validation (manifest key, chainId, deploy block hash, coordinator code). */
  async function deploymentStillValid(g: number, gw: ChainGateway): Promise<boolean> {
    let check: DeploymentCheck;
    try {
      check = await gw.revalidate();
    } catch (e) {
      check = { ok: false, reason: isNetworkError(e) ? 'unreachable' : 'stale', detail: msg(e) };
    }
    if (!current(g)) return false;
    if (check.ok) return true;
    deploymentLost(check);
    return false;
  }

  /** The run was solved by another tx (seen at preview / pre-send): restore its proof from the logs; never send. */
  async function solvedElsewhere(g: number, gw: ChainGateway, run: RunView): Promise<void> {
    const h = await gw.readRunHistory(run.runId).catch(() => null);
    if (!current(g)) return;
    if (h) history = { startRun: h.startRun ?? history.startRun, execute: h.execute ?? history.execute };
    const failure: Failure = { kind: 'already-solved', message: STALE.solvedElsewhere(history.execute?.hash) };
    set({ run, preview: null, phase: 'already-solved', tx: history.execute, failure });
  }

  // ------------------------------------------------------------------ boot / sync / load

  async function boot(): Promise<void> {
    const g = gen;
    set({ phase: 'booting', failure: null });
    let result;
    try {
      result = await env.loadDeployment();
    } catch (e) {
      if (!current(g)) return;
      set({ phase: 'deployment-error', deployment: { ok: false, reason: 'invalid', detail: `Deployment check failed: ${msg(e)}` } });
      return;
    }
    if (!current(g)) return;
    gateway = result.gateway;
    if (!result.check.ok) {
      set({ deployment: result.check, phase: result.check.reason === 'unreachable' ? 'rpc-unavailable' : 'deployment-error' });
      return;
    }
    set({ deployment: result.check });
    if (!env.wallet) return set({ phase: 'no-wallet' });
    if (!unsubscribeWallet) unsubscribeWallet = env.wallet.subscribe({ accountsChanged, chainChanged, disconnect });
    await syncWallet(g);
  }

  async function syncWallet(g: number): Promise<void> {
    const wallet = env.wallet;
    const m = manifest();
    if (!wallet || !m) return;
    let accounts: Address[];
    let chainId: number;
    try {
      [accounts, chainId] = await Promise.all([wallet.accounts(), wallet.chainId()]);
    } catch (e) {
      if (!current(g)) return;
      set({ phase: 'disconnected', account: null, failure: rpcFailure(`The wallet did not answer: ${msg(e)}`) });
      return;
    }
    if (!current(g)) return;
    const account = accounts[0] ?? null;
    set({ account, walletChainId: chainId });
    if (!account) return set({ phase: 'disconnected' });
    if (chainId !== m.chainId) return set({ phase: 'wrong-network' });
    await loadRun(g);
  }

  async function loadRun(g: number): Promise<void> {
    const gw = gateway;
    const account = state.account;
    if (!gw || !account) return;
    set({ phase: 'loading', preview: null });
    const runId = runIdOf(account);
    let run: RunView | null;
    try {
      const [rules, r] = await Promise.all([gw.readRules(), gw.readRun(runId)]);
      if (!current(g)) return;
      run = r;
      set({ rules });
    } catch (e) {
      if (!current(g)) return;
      set({ phase: 'rpc-unavailable', run: null, failure: rpcFailure(`Reading the run from the contracts failed: ${msg(e)}`) });
      return;
    }
    if (run) {
      try {
        const h = await gw.readRunHistory(runId);
        if (!current(g)) return;
        history = { startRun: h.startRun ?? history.startRun, execute: h.execute ?? history.execute };
      } catch {
        // Proof panel shows "Not available" for tx details; state itself came from the contracts.
      }
    }
    const chainId = gw.manifest.chainId;
    env.pending.pruneOtherDeployments(account, chainId, gw.deploymentKey);
    const pending = env.pending.load(account, chainId, gw.deploymentKey);
    if (pending) {
      const { receipt, known } = await lookupTx(gw, pending.hash);
      if (!current(g)) return;
      if (receipt || !known) env.pending.clear(account, chainId, gw.deploymentKey, pending.hash);
      if (receipt) set({ tx: txViewFromReceipt(pending.kind, receipt) });
      if (!receipt && known) {
        // Still in flight: wait for it (no new send), then restore from the contracts.
        const o = begin('recheck');
        if (o) {
          set({ run, phase: pending.kind === 'startRun' ? 'starting-run' : 'executing', tx: txStub(pending.kind, 'pending', pending.hash) });
          void settle(g, o, { kind: pending.kind, hash: pending.hash, plan: null });
          return;
        }
      }
    }
    set({ run, phase: phaseFromRun(run), failure: null });
  }

  // ------------------------------------------------------------------ wallet events

  function accountsChanged(accounts: Address[]): void {
    const next = accounts[0] ?? null;
    if (lower(next) === lower(state.account)) return;
    invalidate();
    set({ account: next });
    if (!next) return set({ phase: 'disconnected' });
    void syncWallet(gen);
  }

  function chainChanged(chainId: number): void {
    if (chainId === state.walletChainId) return;
    invalidate();
    set({ walletChainId: chainId });
    void syncWallet(gen);
  }

  function disconnect(): void {
    invalidate();
    set({ account: null, phase: 'disconnected' });
  }

  // ------------------------------------------------------------------ send helpers

  async function settle(g: number, o: Op, v: VerifyCtx): Promise<void> {
    const gw = gateway;
    const account = state.account;
    try {
      if (!gw || !account) return;
      await settleTx(
        {
          gateway: gw,
          pending: env.pending,
          account,
          rules: state.rules,
          isCurrent: () => current(g),
          getTx: () => state.tx,
          set,
          setVerify: (ctx) => {
            if (current(g)) verifyCtx = ctx;
          },
          onRepriced: (oldHash, newHash) => {
            const chainId = gw.manifest.chainId;
            env.pending.clear(account, chainId, gw.deploymentKey, oldHash);
            env.pending.save({ hash: newHash, kind: v.kind, account, chainId, deploymentKey: gw.deploymentKey, savedAt: now() });
          },
        },
        v,
      );
    } finally {
      end(o);
    }
  }

  /** A send that produced no hash: never leave 'awaiting-wallet' in the tx history / proof. */
  function sendFailed(g: number, kind: TxView['kind'], e: unknown): void {
    if (!current(g)) return;
    const patch = sendFailure(kind, e, state.rules);
    if (!patch.tx) history = { ...history, [kind]: null };
    set(patch);
    if (patch.phase === 'wrong-network') env.wallet?.chainId().then((id) => current(g) && set({ walletChainId: id }), () => undefined);
  }

  // ------------------------------------------------------------------ actions

  async function connect(): Promise<void> {
    const wallet = env.wallet;
    if (!wallet || !manifest() || state.phase !== 'disconnected') return;
    const o = begin('connect');
    if (!o) return;
    const g = gen;
    try {
      const accounts = await wallet.requestAccounts();
      if (!current(g)) return;
      if (!accounts[0]) return set({ phase: 'disconnected' });
      end(o);
      await syncWallet(g);
    } catch (e) {
      if (!current(g)) return;
      set(...walletFailure(e, 'Connection request rejected in the wallet.', 'disconnected'));
    } finally {
      end(o);
    }
  }

  async function switchNetwork(): Promise<void> {
    const wallet = env.wallet;
    const m = manifest();
    if (!wallet || !m || state.phase !== 'wrong-network') return;
    const o = begin('switch');
    if (!o) return;
    const g = gen;
    try {
      await wallet.switchChain(m);
      if (!current(g)) return;
      end(o);
      await syncWallet(g);
    } catch (e) {
      if (!current(g)) return;
      set(...walletFailure(e, 'Network switch rejected in the wallet.', 'wrong-network'));
    } finally {
      end(o);
    }
  }

  async function startRun(): Promise<void> {
    const gw = gateway;
    const account = state.account;
    if (state.phase !== 'no-run' || !gw || !account) return;
    const o = begin('startRun');
    if (!o) return;
    const g = gen;
    try {
      if (!(await deploymentStillValid(g, gw))) return;
      set({ phase: 'starting-run', failure: null, tx: txStub('startRun', 'awaiting-wallet') });
      const hash = await gw.sendStartRun(account).catch((e: unknown) => void sendFailed(g, 'startRun', e));
      if (!hash) return;
      env.pending.save({ hash, kind: 'startRun', account, chainId: gw.manifest.chainId, deploymentKey: gw.deploymentKey, savedAt: now() });
      if (!current(g)) return;
      set({ tx: { ...(state.tx as TxView), hash, status: 'pending' } });
      await settle(g, o, { kind: 'startRun', hash, plan: null });
    } finally {
      end(o);
    }
  }

  function setChoice(next: Choice): void {
    const choice: Choice = { A: !!next.A, B: !!next.B };
    if (op && op.kind !== 'preview') return; // the package is frozen while sending/verifying
    if (state.phase === 'previewing') return set({ choice }); // the in-flight preview is discarded on return
    if (!RUN_PHASES.has(state.phase) || !state.run?.active || state.run.solved) return;
    set({ choice, preview: null, failure: null, phase: 'idle' });
  }

  async function preview(): Promise<void> {
    const gw = gateway;
    const account = state.account;
    const rules = state.rules;
    if (!RUN_PHASES.has(state.phase) || !gw || !account || !rules || !state.run?.active) return;
    const o = begin('preview');
    if (!o) return;
    const g = gen;
    const choice = state.choice;
    set({ phase: 'previewing', preview: null, failure: null });
    try {
      const r = await computePreview(gw, account, rules, choice, () => current(g));
      if (r.type === 'outdated') return; // generation changed while reading/simulating
      if (state.choice.A !== choice.A || state.choice.B !== choice.B) return set({ phase: 'idle' }); // choice moved on
      if (r.type === 'no-active-run') return r.run?.solved ? await solvedElsewhere(g, gw, r.run) : set({ run: r.run, phase: phaseFromRun(r.run) });
      if (r.type === 'failed') return set({ ...(r.run ? { run: r.run } : {}), phase: r.phase, failure: r.failure });
      set({ run: r.run, preview: r.plan, phase: 'preview-ready' });
    } finally {
      end(o);
    }
  }

  async function execute(): Promise<void> {
    const p = state.preview;
    const gw = gateway;
    const wallet = env.wallet;
    if (state.phase !== 'preview-ready' || !p || !gw || !wallet) return;
    const o = begin('execute'); // synchronous: a second click in the same tick is a no-op
    if (!o) return;
    const g = gen;
    const stale = (message: string, extra: Partial<ChainLevelState> = {}) =>
      set({ phase: 'stale-preview', preview: null, failure: { kind: 'stale', message }, ...extra });
    try {
      // Right before sending: same wallet account + network, same live deployment, same live run.
      let accounts: Address[];
      let chainId: number;
      try {
        [accounts, chainId] = await Promise.all([wallet.accounts(), wallet.chainId()]);
      } catch (e) {
        if (!current(g)) return;
        return set({ phase: 'preview-failed', failure: rpcFailure(`The wallet did not answer; nothing was sent. ${msg(e)}`) });
      }
      if (!current(g)) return;
      if (lower(accounts[0]) !== lower(p.account)) return stale(STALE.account(accounts[0]));
      if (chainId !== p.chainId) return stale(STALE.network(chainId, p.chainId), { walletChainId: chainId });
      if (gw.deploymentKey !== p.deploymentKey) return stale(STALE.deployment);
      if (!(await deploymentStillValid(g, gw))) return;
      let live: RunView | null;
      try {
        live = await gw.readRun(p.runId);
      } catch (e) {
        if (!current(g)) return;
        const c = classifyError(e, state.rules);
        const failure = c.type === 'rpc' || c.type === 'contract' ? c.failure : rpcFailure(msg(e));
        return set({ phase: 'preview-failed', failure: { ...failure, message: `Nothing was sent. ${failure.message}` } });
      }
      if (!current(g)) return;
      if (!live) return set({ run: null, preview: null, phase: 'no-run', failure: { kind: 'stale', message: STALE.gone } });
      if (live.nonce !== p.expectedNonce || lower(live.snapshotHash) !== lower(p.expectedSnapshotHash)) {
        return live.solved ? await solvedElsewhere(g, gw, live) : stale(STALE.run, { run: live });
      }
      set({ phase: 'executing', failure: null, tx: txStub('execute', 'awaiting-wallet') });
      const hash = await gw.sendExecute(argsOf(p)).catch((e: unknown) => void sendFailed(g, 'execute', e)); // frozen preview values
      if (!hash) return;
      // Saved even if the account changed meanwhile: reloading as that account resolves it from the chain.
      env.pending.save({ hash, kind: 'execute', account: p.account, chainId: p.chainId, deploymentKey: p.deploymentKey, savedAt: now() });
      if (!current(g)) return;
      set({ tx: { ...(state.tx as TxView), hash, status: 'pending' } });
      await settle(g, o, { kind: 'execute', hash, plan: p });
    } finally {
      end(o);
    }
  }

  async function recheck(): Promise<void> {
    if (op) return;
    const g = gen;
    const gw = gateway;
    if (!gw || ['deployment-error', 'rpc-unavailable', 'booting'].includes(state.phase)) return boot();
    const o = begin('recheck');
    if (!o) return;
    try {
      if (!(await deploymentStillValid(g, gw))) return;
      if (state.phase === 'read-failed' && verifyCtx) {
        const ctx = verifyCtx;
        set({ phase: ctx.kind === 'execute' ? 'verifying' : 'starting-run', failure: null });
        return await settle(g, o, ctx);
      }
    } finally {
      end(o);
    }
    if (current(g) && env.wallet) return syncWallet(g);
  }

  /** Leaves a failure state. Where the shown state may be outdated, re-reads the contracts. */
  function dismiss(): void {
    if (op) return;
    const was = state.phase;
    if (state.invalidatedOperation) set({ invalidatedOperation: false });
    if (was === 'user-rejected' && state.preview && state.tx?.kind === 'execute') {
      return set({ phase: 'preview-ready', failure: null, tx: null });
    }
    if (was === 'user-rejected' || was === 'preview-failed') {
      return set({ phase: state.account ? phaseFromRun(state.run) : 'disconnected', failure: null, preview: null });
    }
    if (was === 'stale-preview' || was === 'reverted' || was === 'read-failed') {
      verifyCtx = null;
      set({ failure: null, preview: null });
      if (gateway && state.account) void loadRun(gen);
      else set({ phase: state.account ? phaseFromRun(state.run) : 'disconnected' });
    }
  }

  const ready = boot();

  return {
    ready,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions: { connect, switchNetwork, startRun, setChoice, preview, execute, recheck, dismiss },
    dispose() {
      disposed = true;
      gen++;
      op = null;
      gateway?.dispose();
      unsubscribeWallet?.();
      unsubscribeWallet = null;
      listeners.clear();
    },
  };
}
