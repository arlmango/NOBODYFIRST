import { describe, expect, it } from 'vitest';
import { createPendingStore, memoryStorage } from './pending';
import { runIdOf, toBalances } from './plan';
import { A1, B1, FakeChain, FakeWallet, flush, H, M, NONE, P1, P2, readyToSend, setup, SOLVED, START } from './testing/fakes';

// ------------------------------------------------------------------------------------------ tests

describe('boot', () => {
  it('deployment failure → deployment-error; unreachable RPC → rpc-unavailable; never demo data', async () => {
    const stale = setup({ check: { ok: false, reason: 'stale', detail: 'No contract code at the NPC B address' } });
    await stale.c.ready;
    expect(stale.s().phase).toBe('deployment-error');
    expect(stale.s().run).toBeNull();
    const down = setup({ check: { ok: false, reason: 'unreachable', detail: 'down' } });
    await down.c.ready;
    expect(down.s().phase).toBe('rpc-unavailable');
  });

  it('no provider → no-wallet; no authorised account → disconnected without eth_requestAccounts', async () => {
    const t1 = setup({ wallet: null });
    await t1.c.ready;
    expect(t1.s().phase).toBe('no-wallet');
    const w = new FakeWallet();
    w.accountsList = [];
    const t2 = setup({ wallet: w });
    await t2.c.ready;
    expect(t2.s().phase).toBe('disconnected');
    expect(w.requested).toBe(0);
    await t2.c.actions.connect();
    expect(w.requested).toBe(1);
  });

  it('wallet on another chain → wrong-network, contracts are not read for it', async () => {
    const w = new FakeWallet();
    w.chain = 1;
    const t = setup({ wallet: w });
    await t.c.ready;
    expect(t.s().phase).toBe('wrong-network');
    expect(t.s().run).toBeNull();
  });

  it('no run → no-run; solved run → already-solved restored from contracts with nothing sent', async () => {
    const t1 = setup({ run: false });
    await t1.c.ready;
    expect(t1.s().phase).toBe('no-run');
    const chain = new FakeChain();
    chain.addRun(P1, { solved: true, active: false, nonce: 1n, balances: SOLVED });
    const t2 = setup({ chain });
    await t2.c.ready;
    expect(t2.s().phase).toBe('already-solved');
    expect(t2.s().proof.finalBalances).toEqual(SOLVED);
    expect(chain.sent).toHaveLength(0);
    await t2.c.actions.preview();
    await t2.c.actions.execute();
    expect(chain.sent).toHaveLength(0);
  });
});

describe('preview', () => {
  it('incomplete selection: decoded rejection names the missing promise and there is no send path', async () => {
    const t = setup();
    await t.c.ready;
    t.c.actions.setChoice({ A: true, B: false });
    await t.c.actions.preview();
    expect(t.s().phase).toBe('preview-failed');
    expect(t.s().failure?.kind).toBe('incomplete-selection');
    expect(t.s().failure?.message).toContain("B's promise is not selected");
    await t.c.actions.execute();
    expect(t.chain.sent).toHaveLength(0);
  });

  it('a successful simulation freezes exactly what will be sent, with expectedAfter derived from the offers', async () => {
    const t = setup();
    await readyToSend(t);
    const p = t.s().preview!;
    expect(p.package.map((x) => x.offerId)).toEqual([A1, B1, NONE]);
    expect(p.expectedNonce).toBe(0n);
    expect(p.expectedSnapshotHash).toBe(H(0x51));
    expect(p.expectedAfter).toEqual(SOLVED);
  });

  it('changing the choice drops the preview', async () => {
    const t = setup();
    await readyToSend(t);
    t.c.actions.setChoice({ A: true, B: false });
    expect(t.s().phase).toBe('idle');
    expect(t.s().preview).toBeNull();
  });
});

describe('execute', () => {
  it('double execute sends exactly once', async () => {
    const t = setup();
    await readyToSend(t);
    const first = t.c.actions.execute();
    const second = t.c.actions.execute();
    await flush();
    t.chain.mineExecute();
    await Promise.all([first, second]);
    await flush();
    expect(t.chain.sent).toHaveLength(1);
    expect(t.s().phase).toBe('success');
  });

  it('sends exactly the preview values and succeeds only after receipt + readback + LevelSolved', async () => {
    const t = setup();
    await readyToSend(t);
    const p = t.s().preview!;
    const run = t.c.actions.execute();
    await flush();
    expect(t.s().phase).toBe('executing');
    expect(t.s().tx?.status).toBe('pending');
    expect(t.pending.load(P1, 31337, t.chain.deploymentKey)?.kind).toBe('execute');
    t.chain.mineExecute();
    await run;
    expect(t.chain.sent[0]).toEqual({ account: p.account, runId: p.runId, package: p.package, expectedNonce: p.expectedNonce, expectedSnapshotHash: p.expectedSnapshotHash });
    expect(t.s().phase).toBe('success');
    expect(t.s().proof.executeTx?.events.map((e) => e.name)).toContain('LevelSolved');
    expect(t.pending.load(P1, 31337, t.chain.deploymentKey)).toBeNull();
    expect(JSON.stringify(t.storage.dump())).not.toContain('solved');
  });

  it('stale preview blocks the send when the live nonce/snapshot moved', async () => {
    const t = setup();
    await readyToSend(t);
    t.chain.addRun(P1, { nonce: 1n, snapshotHash: H(0x77) });
    await t.c.actions.execute();
    expect(t.s().phase).toBe('stale-preview');
    expect(t.s().failure?.kind).toBe('stale');
    expect(t.chain.sent).toHaveLength(0);
  });

  it('wallet rejection → user-rejected (not reverted), nothing saved, preview can be retried', async () => {
    const t = setup();
    await readyToSend(t);
    t.chain.sendError = { code: 4001, message: 'User rejected the request.' };
    await t.c.actions.execute();
    expect(t.s().phase).toBe('user-rejected');
    expect(t.s().tx?.status).toBe('rejected');
    expect(t.s().failure).toBeNull();
    expect(Object.keys(t.storage.dump())).toHaveLength(0);
    t.c.actions.dismiss();
    expect(t.s().phase).toBe('preview-ready');
  });

  it('read failure after the receipt → read-failed (never success); recheck then verifies', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    t.chain.mineExecute();
    t.chain.readFails = true;
    await run;
    expect(t.s().phase).toBe('read-failed');
    expect(t.s().failure?.kind).toBe('rpc');
    expect(t.pending.load(P1, 31337, t.chain.deploymentKey)).not.toBeNull();
    t.chain.readFails = false;
    await t.c.actions.recheck();
    expect(t.s().phase).toBe('success');
  });

  it('receipt success but ledger differs from expectedAfter → not success', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    t.chain.mineExecute({ balances: toBalances([0n, 1n, 1n, 0n, 0n, 1n]) });
    await run;
    expect(t.s().phase).toBe('read-failed');
    expect(t.s().failure?.message).toContain('balances differ');
  });

  it('receipt success without a LevelSolved event for this run → not success', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    t.chain.mineExecute({ event: false });
    await run;
    expect(t.s().phase).toBe('read-failed');
  });

  it('mined revert → reverted', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    t.chain.mineExecute({ status: 'reverted' });
    await run;
    expect(t.s().phase).toBe('reverted');
    expect(t.s().tx?.receiptStatus).toBe('reverted');
  });

  it('replaced / cancelled in the wallet → not success, the tx shows the replacement', async () => {
    const t = setup();
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    t.chain.replacement = { reason: 'cancelled', newHash: H(0xcc) };
    t.chain.receipt.resolve({ hash: H(0xcc), status: 'success', blockNumber: 9n, blockHash: H(0x99), to: M.coordinator, events: [] });
    await run;
    expect(t.s().phase).toBe('idle');
    expect(t.s().tx?.status).toBe('cancelled');
    expect(t.s().tx?.replacedBy).toBe(H(0xcc));
  });
});

describe('account / network change (generation token)', () => {
  it('account change during execute: old result ignored, operation marked invalidated, new account loaded', async () => {
    const t = setup();
    t.chain.addRun(P2);
    await readyToSend(t);
    const run = t.c.actions.execute();
    await flush();
    expect(t.s().phase).toBe('executing');
    t.wallet!.accountsList = [P2];
    t.wallet!.handlers!.accountsChanged([P2]);
    await flush();
    t.chain.mineExecute();
    await run;
    await flush();
    expect(t.s().account).toBe(P2);
    expect(t.s().invalidatedOperation).toBe(true);
    expect(t.s().phase).toBe('idle');
    expect(t.s().run?.owner).toBe(P2);
    expect(t.s().tx).toBeNull();
  });

  it('account change between preview and send: preview is dropped, nothing is sent', async () => {
    const t = setup();
    t.chain.addRun(P2);
    await readyToSend(t);
    t.wallet!.accountsList = [P2];
    t.wallet!.handlers!.accountsChanged([P2]);
    await flush();
    await t.c.actions.execute();
    expect(t.chain.sent).toHaveLength(0);
    expect(t.s().preview).toBeNull();
  });

  it('network change → wrong-network, no stale run shown', async () => {
    const t = setup();
    await t.c.ready;
    await flush();
    t.wallet!.chain = 1;
    t.wallet!.handlers!.chainChanged(1);
    await flush();
    expect(t.s().phase).toBe('wrong-network');
    expect(t.s().run).toBeNull();
  });
});

describe('reload with a pending record', () => {
  it('resolves an in-flight execute hash from the chain without sending anything', async () => {
    const storage = memoryStorage();
    const chain = new FakeChain();
    chain.addRun(P1);
    createPendingStore(storage).save({ hash: H(0x200), kind: 'execute', account: P1, chainId: 31337, deploymentKey: chain.deploymentKey, savedAt: 'x' });
    const t = setup({ chain, storage });
    await t.c.ready;
    await flush();
    expect(t.s().phase).toBe('executing');
    expect(t.s().tx?.hash).toBe(H(0x200));
    chain.runs.set(runIdOf(P1), { ...chain.runs.get(runIdOf(P1))!, solved: true, active: false, nonce: 1n, balances: SOLVED });
    chain.receipt.resolve({ hash: H(0x200), status: 'success', blockNumber: 3n, blockHash: H(3), to: M.coordinator, events: [{ name: 'LevelSolved', address: M.coordinator, args: { runId: runIdOf(P1).toString() }, logIndex: 0 }] });
    await flush();
    expect(t.s().phase).toBe('already-solved');
    expect(chain.sent).toHaveLength(0);
    expect(t.pending.load(P1, 31337, chain.deploymentKey)).toBeNull();
  });

  it('a hash the node does not know is dropped; state comes from the contracts', async () => {
    const storage = memoryStorage();
    const chain = new FakeChain();
    chain.addRun(P1);
    chain.pendingKnown = false;
    createPendingStore(storage).save({ hash: H(0x201), kind: 'execute', account: P1, chainId: 31337, deploymentKey: chain.deploymentKey, savedAt: 'x' });
    const t = setup({ chain, storage });
    await t.c.ready;
    await flush();
    expect(t.s().phase).toBe('idle');
    expect(Object.keys(storage.dump())).toHaveLength(0);
  });
});

describe('startRun', () => {
  it('no-run → start (user click) → receipt → re-read → idle; rejection → user-rejected then back to no-run', async () => {
    const t = setup({ run: false });
    await t.c.ready;
    t.chain.sendError = { code: 4001 };
    await t.c.actions.startRun();
    expect(t.s().phase).toBe('user-rejected');
    t.c.actions.dismiss();
    expect(t.s().phase).toBe('no-run');
    t.chain.sendError = null;
    const p = t.c.actions.startRun();
    await flush();
    expect(t.s().phase).toBe('starting-run');
    t.chain.addRun(P1);
    t.chain.receipt.resolve({ hash: H(0x100), status: 'success', blockNumber: 2n, blockHash: H(2), to: M.coordinator, events: [] });
    await p;
    expect(t.chain.startRuns).toEqual([P1]);
    expect(t.s().phase).toBe('idle');
    expect(t.s().run?.balances).toEqual(START);
  });
});
