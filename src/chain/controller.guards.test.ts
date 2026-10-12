// Guard tests requested by review (each must fail when its guard is removed).
import { describe, expect, it } from 'vitest';
import { HttpRequestError } from 'viem';
import { createPendingStore, memoryStorage } from './pending';
import { runIdOf } from './plan';
import { A1, deferred, FakeChain, flush, H, M, NONE, P1, P2, RULES, readyToSend, setup, SOLVED } from './testing/fakes';
import type { DeploymentCheck, TxView } from './types';

const netError = () => new HttpRequestError({ url: 'http://127.0.0.1:8545', details: 'fetch failed' });
const STALE_DEPLOY: DeploymentCheck = {
  ok: false,
  reason: 'stale',
  detail: 'The local chain was restarted or redeployed since this page loaded (deploy block hash differs)',
};

function switchAccount(t: ReturnType<typeof setup>, to: typeof P2) {
  t.wallet!.accountsList = [to];
  t.wallet!.handlers!.accountsChanged([to]);
}

describe('pre-send checks inside execute()', () => {
  it('[M03] wallet account changed without an event: no send, stale-preview naming the account change', async () => {
    const t = setup();
    await readyToSend(t);
    t.wallet!.accountsList = [P2]; // silent switch
    await t.c.actions.execute();
    expect(t.chain.sent).toHaveLength(0);
    expect(t.s().phase).toBe('stale-preview');
    expect(t.s().failure?.message).toContain('wallet account changed');
    expect(t.s().failure?.message).not.toContain('nonce');
  });

  it('[M03] wallet network changed without an event: no send, message names the network, walletChainId updated', async () => {
    const t = setup();
    await readyToSend(t);
    t.wallet!.chain = 5;
    await t.c.actions.execute();
    expect(t.chain.sent).toHaveLength(0);
    expect(t.s().failure?.message).toContain('network changed');
    expect(t.s().walletChainId).toBe(5);
  });

  it('Anvil restart + redeploy with the same addresses: detected before execute, nothing sent, old state cleared', async () => {
    const t = setup();
    await readyToSend(t);
    t.chain.revalidateResult = STALE_DEPLOY;
    await t.c.actions.execute();
    expect(t.chain.sent).toHaveLength(0);
    const s = t.s();
    expect(s.phase).toBe('deployment-error');
    expect(s.deployment).toMatchObject({ ok: false, reason: 'stale' });
    expect([s.run, s.preview, s.tx, s.proof.finalBalances, s.proof.executeTx]).toEqual([null, null, null, null, null]);
  });

  it('restart detected before startRun and on recheck (recheck then re-boots)', async () => {
    const t = setup({ run: false });
    await t.c.ready;
    t.chain.revalidateResult = STALE_DEPLOY;
    await t.c.actions.startRun();
    expect(t.chain.startRuns).toHaveLength(0);
    expect(t.s().phase).toBe('deployment-error');

    const r = setup();
    await readyToSend(r);
    const run = r.c.actions.execute();
    await flush();
    r.chain.readFails = true;
    r.chain.mineExecute();
    await run;
    expect(r.s().phase).toBe('read-failed');
    r.chain.revalidateResult = STALE_DEPLOY;
    await r.c.actions.recheck();
    expect(r.s().phase).toBe('deployment-error');
    expect(r.s().run).toBeNull();
  });

  it('RPC down at the pre-send check → rpc-unavailable with an RPC failure, nothing sent', async () => {
    const t = setup();
    await readyToSend(t);
    t.chain.revalidateResult = { ok: false, reason: 'unreachable', detail: 'down' };
    await t.c.actions.execute();
    expect(t.chain.sent).toHaveLength(0);
    expect(t.s().phase).toBe('rpc-unavailable');
    expect(t.s().failure?.kind).toBe('rpc');
  });

  it('pre-send live read fails on the network → kind rpc "could not be reached", nothing sent', async () => {
    const t = setup();
    await readyToSend(t);
    t.chain.readError = netError();
    await t.c.actions.execute();
    expect(t.chain.sent).toHaveLength(0);
    expect(t.s().failure?.kind).toBe('rpc');
    expect(t.s().failure?.message).toMatch(/Nothing was sent.*could not be reached/);
  });

  it('run vanished before send → no-run (not a dead-end stale-preview)', async () => {
    const t = setup();
    await readyToSend(t);
    t.chain.runs.delete(runIdOf(P1));
    await t.c.actions.execute();
    expect(t.chain.sent).toHaveLength(0);
    expect(t.s().phase).toBe('no-run');
  });

  it('[M33] setChoice while execute re-checks the run is ignored; the frozen package is sent', async () => {
    const t = setup();
    await readyToSend(t);
    const gate = deferred<void>();
    t.chain.gates.readRun = gate;
    const run = t.c.actions.execute();
    await flush();
    t.c.actions.setChoice({ A: false, B: false });
    expect(t.s().choice).toEqual({ A: true, B: true });
    expect(t.s().preview).not.toBeNull();
    gate.resolve();
    await flush();
    t.chain.mineExecute();
    await run;
    expect(t.chain.sent[0].package.map((p) => p.offerId)).toEqual([A1, `0x${'b'.repeat(64)}`, NONE]);
    expect(t.s().phase).toBe('success');
  });
});

describe('generation token: late results never reach the new account', () => {
  it('[M04] account switch while the wallet is open: the old tx never appears for the new account', async () => {
    const t = setup();
    t.chain.addRun(P2);
    await readyToSend(t);
    const gate = deferred<void>();
    t.chain.gates.sendExecute = gate;
    const run = t.c.actions.execute();
    await flush();
    switchAccount(t, P2);
    await flush();
    gate.resolve();
    await run;
    await flush();
    expect(t.s().account).toBe(P2);
    expect(t.s().tx).toBeNull();
    expect(t.s().proof.executeTx).toBeNull();
    expect(t.s().phase).toBe('idle');
    expect(t.chain.waited).toHaveLength(0);
  });

  it('[M06] account switch while the receipt is being read back: no success for the new account', async () => {
    const t = setup();
    t.chain.addRun(P2);
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    const gate = deferred<void>();
    t.chain.gates.readRun = gate;
    t.chain.mineExecute();
    await flush();
    switchAccount(t, P2);
    await flush();
    gate.resolve();
    await run;
    await flush();
    expect(t.s().phase).toBe('idle');
    expect(t.s().run?.owner).toBe(P2);
  });

  it('[M09] account switch during the initial load: the first account’s run is not shown', async () => {
    const chain = new FakeChain();
    chain.addRun(P1);
    const gate = deferred<void>();
    chain.gates.readRules = gate;
    const t = setup({ chain });
    await flush();
    switchAccount(t, P2);
    await flush();
    expect(t.s().phase).toBe('no-run');
    gate.resolve();
    await flush();
    expect(t.s().account).toBe(P2);
    expect(t.s().run).toBeNull();
    expect(t.s().phase).toBe('no-run');
  });

  it('[M09] late "no run" read of the old account does not overwrite the new account’s active run', async () => {
    const chain = new FakeChain();
    chain.addRun(P2); // P1 has no run, P2 has one
    const gate = deferred<void>();
    chain.gates.readRules = gate;
    const t = setup({ chain });
    await flush();
    switchAccount(t, P2);
    await flush();
    expect(t.s().phase).toBe('idle');
    gate.resolve();
    await flush();
    expect(t.s().phase).toBe('idle');
    expect(t.s().run?.owner).toBe(P2);
  });

  it('[M10] old account’s simulation finishing after the new account chose the same promises: no preview', async () => {
    const t = setup();
    t.chain.addRun(P2);
    await t.c.ready;
    await flush();
    t.c.actions.setChoice({ A: true, B: true });
    const gate = deferred<void>();
    t.chain.gates.simulate = gate;
    const p = t.c.actions.preview();
    await flush();
    switchAccount(t, P2);
    await flush();
    t.c.actions.setChoice({ A: true, B: true }); // same choice for the new account
    gate.resolve();
    await p;
    await flush();
    expect(t.s().preview).toBeNull();
    expect(t.s().phase).toBe('idle');
  });

  it('[M10] account switch during the simulation: no preview for the new account', async () => {
    const t = setup();
    t.chain.addRun(P2);
    await t.c.ready;
    await flush();
    t.c.actions.setChoice({ A: true, B: true });
    const gate = deferred<void>();
    t.chain.gates.simulate = gate;
    const p = t.c.actions.preview();
    await flush();
    switchAccount(t, P2);
    await flush();
    gate.resolve();
    await p;
    await flush();
    expect(t.s().preview).toBeNull();
    expect(t.s().phase).toBe('idle');
    expect(t.s().run?.owner).toBe(P2);
  });

  it('[M26] choice changed during the simulation: that simulation result is discarded', async () => {
    const t = setup();
    await t.c.ready;
    t.c.actions.setChoice({ A: true, B: true });
    const gate = deferred<void>();
    t.chain.gates.simulate = gate;
    const p = t.c.actions.preview();
    await flush();
    t.c.actions.setChoice({ A: true, B: false });
    gate.resolve();
    await p;
    expect(t.s().phase).toBe('idle');
    expect(t.s().preview).toBeNull();
    expect(t.s().choice).toEqual({ A: true, B: false });
  });

  it('[M31] dispose during the deployment check: boot stops (no wallet subscription, no wallet calls)', async () => {
    const gate = deferred<void>();
    const t = setup({ deploymentGate: gate.promise });
    t.c.dispose();
    gate.resolve();
    await t.c.ready;
    await flush();
    expect(t.wallet!.handlers).toBeNull();
    expect(t.wallet!.calls).toBe(0);
  });

  it('[M29] dispose removes the wallet subscription and stops the gateway', async () => {
    const t = setup();
    await t.c.ready;
    expect(t.wallet!.handlers).not.toBeNull();
    t.c.dispose();
    expect(t.wallet!.handlers).toBeNull();
    expect(t.chain.disposed).toBe(true);
  });
});

describe('success criteria', () => {
  it('[M13] receipt + balances + LevelSolved but run not solved → not success', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    t.chain.mineExecute({ solved: false });
    await run;
    expect(t.s().phase).toBe('read-failed');
    expect(t.s().failure?.message).toContain('not marked solved');
  });

  it('[M15] LevelSolved from another contract, or for another run, is not accepted', async () => {
    for (const opts of [{ eventAddress: M.npcA }, { eventRunId: runIdOf(P2) }]) {
      const t = setup();
      await readyToSend(t);
      const run = t.c.actions.execute();
      await flush();
      t.chain.mineExecute(opts);
      await run;
      expect(t.s().phase).toBe('read-failed');
      expect(t.s().failure?.message).toContain('LevelSolved');
    }
  });

  it('read-failed distinguishes "could not read" (rpc) from "read but disagrees"; dismiss re-reads the contracts', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    t.chain.mineExecute({ event: false });
    await run;
    expect(t.s().failure?.kind).toBe('unknown-contract-error');
    expect(t.s().failure?.message).toContain('disagree');
    t.c.actions.dismiss();
    await flush();
    expect(t.s().phase).toBe('already-solved');
    expect(t.s().failure).toBeNull();
  });

  it('dismiss from stale-preview re-reads the contracts and returns to idle with the live run', async () => {
    const t = setup();
    await readyToSend(t);
    t.chain.addRun(P1, { nonce: 3n, snapshotHash: H(0x77) });
    await t.c.actions.execute();
    expect(t.s().phase).toBe('stale-preview');
    t.chain.addRun(P1, { nonce: 4n, snapshotHash: H(0x78) }); // moved on again before dismiss
    t.c.actions.dismiss();
    await flush();
    expect(t.s().phase).toBe('idle');
    expect(t.s().run?.nonce).toBe(4n);
  });

  it('dismiss from read-failed (could not read) re-reads the contracts and resolves the pending tx', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    const hash = t.s().tx!.hash!;
    t.chain.readFails = true;
    t.chain.mineExecute();
    await run;
    expect(t.s().failure?.kind).toBe('rpc');
    t.chain.readFails = false;
    t.chain.minedReceipts.set(hash, { hash, status: 'success', blockNumber: 9n, blockHash: H(0x99), to: M.coordinator, events: [] });
    t.c.actions.dismiss();
    await flush();
    expect(t.s().phase).toBe('already-solved');
    expect(t.s().run?.solved).toBe(true);
    expect(t.pending.load(P1, 31337, t.chain.deploymentKey)).toBeNull();
  });
});

describe('replacement evidence', () => {
  it('cancelled: original hash kept, its receipt fields empty, the mined tx goes into `replacement`', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    const original = t.s().tx!.hash!;
    t.chain.replacement = { reason: 'cancelled', newHash: H(0xcc) };
    t.chain.receipt.resolve({ hash: H(0xcc), status: 'success', blockNumber: 9n, blockHash: H(0x99), to: P1, events: [] });
    await run;
    const tx = t.s().tx!;
    expect(tx).toMatchObject({ hash: original, status: 'cancelled', blockNumber: null, blockHash: null, receiptStatus: null, events: [], replacedBy: H(0xcc) });
    expect(tx.replacement).toMatchObject({ hash: H(0xcc), blockNumber: 9n, blockHash: H(0x99), receiptStatus: 'success', reason: 'cancelled' });
    expect(tx.replacement?.originalHash).toBe(tx.hash);
    expect(t.s().announcement).toContain('cancelled');
    expect(t.s().announcement).toContain(original);
    expect(t.s().phase).toBe('idle');
    expect(t.pending.load(P1, 31337, t.chain.deploymentKey)).toBeNull();
  });

  it('wallet says "replaced" but the replacement is not our call → reported as cancelled', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    t.chain.replacement = { reason: 'replaced', newHash: H(0xcd) };
    t.chain.receipt.resolve({ hash: H(0xcd), status: 'success', blockNumber: 9n, blockHash: H(0x99), to: M.items, events: [] });
    await run;
    expect(t.s().tx?.status).toBe('cancelled');
    expect(t.s().tx?.replacement?.reason).toBe('cancelled');
  });

  it('replaced by our same call that executed: phase from contracts (already-solved), evidence in `replacement`', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    const original = t.s().tx!.hash!;
    t.chain.runs.set(runIdOf(P1), { ...t.chain.runs.get(runIdOf(P1))!, solved: true, active: false, nonce: 1n, balances: SOLVED });
    t.chain.replacement = { reason: 'replaced', newHash: H(0xdd) };
    const ev = { name: 'LevelSolved', address: M.coordinator, args: { runId: runIdOf(P1).toString() }, logIndex: 1 };
    t.chain.receipt.resolve({ hash: H(0xdd), status: 'success', blockNumber: 10n, blockHash: H(0x98), to: M.coordinator, events: [ev] });
    await run;
    expect(t.s().tx).toMatchObject({ hash: original, status: 'replaced', receiptStatus: null, events: [] });
    expect(t.s().tx?.replacement?.events.map((e) => e.name)).toEqual(['LevelSolved']);
    expect(t.s().phase).toBe('already-solved');
    expect(t.s().announcement).toContain(H(0xdd));
  });

  it('repriced then receipt wait fails: pending record and recheck follow the new hash', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    t.chain.replacement = { reason: 'repriced', newHash: H(0xee) };
    t.chain.receipt.reject(new Error('timed out'));
    await run;
    expect(t.s().phase).toBe('read-failed');
    expect(t.pending.load(P1, 31337, t.chain.deploymentKey)?.hash).toBe(H(0xee));
    t.chain.replacement = null;
    t.chain.rearm();
    const again = t.c.actions.recheck();
    await flush();
    expect(t.chain.waited.at(-1)).toBe(H(0xee));
    t.chain.runs.set(runIdOf(P1), { ...t.chain.runs.get(runIdOf(P1))!, solved: true, active: false, nonce: 1n, balances: SOLVED });
    const ev = { name: 'LevelSolved', address: M.coordinator, args: { runId: runIdOf(P1).toString() }, logIndex: 1 };
    t.chain.receipt.resolve({ hash: H(0xee), status: 'success', blockNumber: 11n, blockHash: H(0x97), to: M.coordinator, events: [ev] });
    await again;
    expect(t.s().phase).toBe('success');
    expect(t.pending.load(P1, 31337, t.chain.deploymentKey)).toBeNull();
  });
});

describe('failed sends and error classes', () => {
  it('non-rejection send failure leaves no "awaiting-wallet" in state or proof', async () => {
    const t = setup();
    await readyToSend(t);
    t.chain.sendError = netError();
    await t.c.actions.execute();
    expect(t.s().phase).toBe('preview-failed');
    expect(t.s().tx).toBeNull();
    expect(t.s().proof.executeTx).toBeNull();
    expect(t.s().failure?.message.startsWith('Not sent')).toBe(true);

    const r = setup({ run: false });
    await r.c.ready;
    r.chain.sendError = netError();
    await r.c.actions.startRun();
    expect(r.s().proof.startRunTx).toBeNull();
    expect(r.s().phase).toBe('no-run');
  });

  it('wrong network reported by the wallet at send time updates walletChainId', async () => {
    const t = setup();
    await readyToSend(t);
    t.chain.sendError = { name: 'ChainMismatchError', message: 'chain mismatch' };
    t.wallet!.chain = 31337;
    const p = t.c.actions.execute();
    t.wallet!.chain = 7; // wallet moved while the request was open
    await p;
    await flush();
    expect(t.s().phase).toBe('wrong-network');
    expect(t.s().walletChainId).toBe(7);
  });

  it('RPC failure during preview → kind rpc; local construction failure is NOT labelled rpc', async () => {
    const t = setup();
    await t.c.ready;
    t.c.actions.setChoice({ A: true, B: true });
    t.chain.outgoingError = netError();
    await t.c.actions.preview();
    expect(t.s().failure?.kind).toBe('rpc');
    expect(t.s().failure?.message).toContain('could not be reached');

    const chain = new FakeChain();
    chain.addRun(P1);
    chain.rules = [{ ...RULES[0], offerId: NONE }, RULES[1], RULES[2]];
    const l = setup({ chain });
    await l.c.ready;
    l.c.actions.setChoice({ A: true, B: false });
    await l.c.actions.preview();
    expect(l.s().phase).toBe('preview-failed');
    expect(l.s().failure?.kind).not.toBe('rpc');
    expect(l.s().failure?.message).toContain('could not be built');
  });
});

it('boot prunes pending records of other deployments for the same account', async () => {
  const storage = memoryStorage();
  const store = createPendingStore(storage);
  store.save({ hash: H(0x300), kind: 'execute', account: P1, chainId: 31337, deploymentKey: 'old@0x01', savedAt: 'x' });
  store.save({ hash: H(0x301), kind: 'execute', account: P2, chainId: 31337, deploymentKey: 'old@0x01', savedAt: 'x' });
  const t = setup({ storage });
  await t.c.ready;
  expect(store.load(P1, 31337, 'old@0x01')).toBeNull();
  expect(store.load(P2, 31337, 'old@0x01')).not.toBeNull();
});

const solvedElsewhereTx = (hash: ReturnType<typeof H>): TxView => ({
  kind: 'execute',
  hash,
  status: 'confirmed',
  blockNumber: 12n,
  blockHash: H(0x9a),
  receiptStatus: 'success',
  events: [{ name: 'LevelSolved', address: M.coordinator, args: { runId: runIdOf(P1).toString() }, logIndex: 2 }],
  replacedBy: null,
  replacement: null,
});
const solveExternally = (chain: FakeChain) =>
  chain.runs.set(runIdOf(P1), { ...chain.runs.get(runIdOf(P1))!, solved: true, active: false, nonce: 1n, balances: SOLVED, snapshotHash: H(0x53) });

describe('run solved by another transaction (N1)', () => {
  it('[M40] solved between preview and send: already-solved, nothing sent, reason + execute proof from the logs', async () => {
    const t = setup();
    await readyToSend(t);
    solveExternally(t.chain);
    t.chain.runHistory = { startRun: null, execute: solvedElsewhereTx(H(0xab)) };
    await t.c.actions.execute();
    const s = t.s();
    expect(t.chain.sent).toHaveLength(0);
    expect(s.phase).toBe('already-solved');
    expect(s.preview).toBeNull();
    expect(s.failure?.kind).toBe('already-solved');
    expect(s.failure?.message).toContain('solved by another transaction');
    expect(s.failure?.message).toContain(H(0xab));
    expect(s.proof.executeTx?.hash).toBe(H(0xab));
    expect(s.tx?.events.map((e) => e.name)).toEqual(['LevelSolved']);
    expect(s.proof.finalBalances).toEqual(SOLVED);
    await t.c.actions.execute(); // the stale preview's execute is unavailable
    expect(t.chain.sent).toHaveLength(0);
  });

  it('solved before the preview: preview goes to already-solved with the reason; hash not available when no log', async () => {
    const t = setup();
    await t.c.ready;
    t.c.actions.setChoice({ A: true, B: true });
    solveExternally(t.chain);
    await t.c.actions.preview();
    expect(t.s().phase).toBe('already-solved');
    expect(t.s().failure?.message).toContain('hash not available');
    expect(t.chain.sent).toHaveLength(0);
  });
});

it('repriced and mined: TxView shows the mined hash, replacement.originalHash keeps the sent hash (N2)', async () => {
  const t = setup();
  await readyToSend(t);
  const run = t.c.actions.execute();
  await flush();
  const sentHash = t.s().tx!.hash!;
  solveExternally(t.chain);
  t.chain.replacement = { reason: 'repriced', newHash: H(0xef) };
  const ev = { name: 'LevelSolved', address: M.coordinator, args: { runId: runIdOf(P1).toString() }, logIndex: 1 };
  t.chain.receipt.resolve({ hash: H(0xef), status: 'success', blockNumber: 11n, blockHash: H(0x97), to: M.coordinator, events: [ev] });
  await run;
  expect(t.s().phase).toBe('success');
  expect(t.s().tx?.hash).toBe(H(0xef));
  expect(t.s().tx?.replacement).toMatchObject({ reason: 'repriced', hash: H(0xef), originalHash: sentHash });
  expect(sentHash).not.toBe(H(0xef));
});
