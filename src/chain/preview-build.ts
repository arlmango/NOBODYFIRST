// Builds and simulates a preview: one consistent run read, the package from on-chain offer ids, transfers
// from npc.outgoing(), expectedAfter, then eth_call of the very same execute(). No state changes here.

import { classifyError, RPC_UNREACHABLE } from './errors';
import { buildPackage, deriveExpectedAfter, LocalStockError, runIdOf, transfersFromOutgoing } from './plan';
import type { ChainGateway, ExecuteArgs } from './ports';
import type { Address, Balances, Choice, Failure, NpcRulesView, PreviewPlan, RunView } from './types';

export type PreviewOutcome =
  | { type: 'ready'; run: RunView; plan: PreviewPlan }
  | { type: 'no-active-run'; run: RunView | null }
  | { type: 'failed'; run: RunView | null; phase: 'preview-failed' | 'stale-preview'; failure: Failure }
  | { type: 'outdated' }; // generation changed while awaiting: discard

const msg = (e: unknown) => (e as Error)?.message ?? String(e);

/** Chain call failed: contract revert (decoded) or transport/RPC failure — never a local bug. */
function chainFailure(e: unknown, rules: readonly NpcRulesView[], run: RunView | null): PreviewOutcome {
  const c = classifyError(e, rules);
  if (c.type === 'contract') {
    return { type: 'failed', run, phase: c.failure.kind === 'stale' ? 'stale-preview' : 'preview-failed', failure: c.failure };
  }
  if (c.type === 'rpc') return { type: 'failed', run, phase: 'preview-failed', failure: c.failure };
  return { type: 'failed', run, phase: 'preview-failed', failure: { kind: 'rpc', message: `${RPC_UNREACHABLE}: ${c.message}` } };
}

/** Package/transfer construction failed locally (e.g. an NPC offer that does not fit) — not an RPC error. */
function localFailure(e: unknown, run: RunView): PreviewOutcome {
  return {
    type: 'failed',
    run,
    phase: 'preview-failed',
    failure: {
      kind: 'unknown-contract-error',
      message: `The package could not be built from the NPCs' on-chain offers: ${msg(e)}. Nothing was simulated or sent.`,
    },
  };
}

export async function computePreview(
  gw: ChainGateway,
  account: Address,
  rules: readonly NpcRulesView[],
  choice: Choice,
  isCurrent: () => boolean,
): Promise<PreviewOutcome> {
  const runId = runIdOf(account);
  let run: RunView | null;
  try {
    run = await gw.readRun(runId);
  } catch (e) {
    return isCurrent() ? chainFailure(e, rules, null) : { type: 'outdated' };
  }
  if (!isCurrent()) return { type: 'outdated' };
  if (!run || run.solved || !run.active) return { type: 'no-active-run', run };

  let pkg;
  try {
    pkg = buildPackage(choice, rules);
  } catch (e) {
    return localFailure(e, run);
  }
  let outs;
  try {
    outs = await Promise.all(pkg.map((s) => gw.readOutgoing(s.npcId, s.offerId).then((r) => ({ npcId: s.npcId, ...r }))));
  } catch (e) {
    return isCurrent() ? chainFailure(e, rules, run) : { type: 'outdated' };
  }
  if (!isCurrent()) return { type: 'outdated' };
  let transfers;
  let expectedAfter: Balances | null = null;
  try {
    transfers = transfersFromOutgoing(outs);
    expectedAfter = deriveExpectedAfter(run.balances, transfers);
  } catch (e) {
    if (!(e instanceof LocalStockError) || !transfers) return localFailure(e, run);
  }
  const args: ExecuteArgs = { account, runId, package: pkg, expectedNonce: run.nonce, expectedSnapshotHash: run.snapshotHash };
  try {
    await gw.simulateExecute(args);
  } catch (e) {
    return isCurrent() ? chainFailure(e, rules, run) : { type: 'outdated' };
  }
  if (!isCurrent()) return { type: 'outdated' };
  if (!expectedAfter) {
    const failure: Failure = {
      kind: 'unknown-contract-error',
      message: 'The simulation passed, but the local stock check disagrees. Nothing will be sent.',
    };
    return { type: 'failed', run, phase: 'preview-failed', failure };
  }
  const plan: PreviewPlan = {
    ...args,
    before: run.balances,
    transfers,
    expectedAfter,
    simulated: true,
    chainId: gw.manifest.chainId,
    deploymentKey: gw.deploymentKey,
  };
  return { type: 'ready', run, plan };
}
