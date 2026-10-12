// Error-path scenarios: S4 wrong network, S5 wallet rejection, S6 RPC failure, S7 stale preview, S8 deployment staleness.
import { copyFileSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  APP, DESKTOP, LOGS, MANIFEST_FILE, ROOT, RPC, ZERO_ADDR, ZERO_BYTES32, Checks, castMust, castRun, bodyText, log, openPage,
  provider, readBalancesCast, readManifest, readProofPanel, readReceiptCast, readRunCast, readSnapshotCast, runIdOf, sentCount, shot, shotAt,
} from './lib.mjs';

const WIN_TEXT = 'Everyone kept their promise.';
const BACKUP = join(ROOT, 'scripts', 'chain', '.run', 'manifest-backup-s8.json');

async function connect(page) {
  await page.getByRole('button', { name: 'Connect wallet' }).click();
}
async function connectAndStart(page) {
  await connect(page);
  await page.getByRole('button', { name: 'Start run' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('#promise-A').waitFor({ state: 'attached', timeout: 120000 });
}
async function selectBoth(page) {
  await page.locator('#promise-A').check();
  await page.locator('#promise-B').check();
  await page.getByRole('button', { name: 'Preview exchange' }).click();
  await page.locator('#review-title').waitFor({ timeout: 60000 });
}

/** Runs the local-chain.mjs CLI, logs the command and exit code, returns the parsed last JSON line. */
export function localChain(args, logName) {
  const r = spawnSync('node', ['scripts/chain/local-chain.mjs', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
  const code = r.status ?? -1;
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const lines = (r.stdout ?? '').trim().split('\n');
  appendFileSync(join(LOGS, logName), `$ node scripts/chain/local-chain.mjs ${args.join(' ')}\nEXIT=${code}\n${out.trim()}\n`);
  let json = null;
  try { json = JSON.parse(lines[lines.length - 1]); } catch { json = null; }
  return { code, json };
}

export async function s4(browser, acc8) {
  const c = new Checks();
  const M = readManifest();
  const { context, page } = await openPage(browser, { wallet: { account: 8 } });
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await connect(page);
    await page.getByRole('button', { name: 'Start run' }).waitFor({ timeout: 60000 });
    await page.evaluate(() => window.__nfTestProvider.setChainId(1));
    await page.getByRole('heading', { name: 'Wrong network' }).waitFor({ timeout: 30000 });
    let body = await bodyText(page);
    c.check('wrong network heading shown', 1, await page.getByRole('heading', { name: 'Wrong network' }).count());
    c.truthy('wrong network text shows chain 1', body.includes('Your wallet is on chain ID 1.'));
    c.check('wrong network: no Start run / Execute deal / Preview', 0, (await page.getByRole('button', { name: 'Start run' }).count()) + (await page.getByRole('button', { name: 'Execute deal' }).count()) + (await page.getByRole('button', { name: 'Preview exchange' }).count()));
    c.check('wrong network: Switch network offered', 1, await page.getByRole('button', { name: 'Switch network' }).count());
    c.check('wrong network: provider sent nothing', 0, (await provider(page)).sent.length);
    await shot(page, 'chain-wrong-network-1440.png');
    await page.getByRole('button', { name: 'Switch network' }).click();
    await page.getByRole('button', { name: 'Start run' }).waitFor({ timeout: 60000 });
    const st = await page.evaluate(() => window.__nfTestProvider.getState());
    c.check('after Switch network: chain override cleared', null, st.chainOverride);
    c.check('after Switch network: Wrong network gone', 0, await page.getByRole('heading', { name: 'Wrong network' }).count());
    c.check('after Switch network: Start run offered again', 1, await page.getByRole('button', { name: 'Start run' }).count());
    c.check('chain still 31337 (cast eth_chainId)', '31337', String(parseInt(castMust(['rpc', 'eth_chainId', '--rpc-url', RPC], 'eth_chainId').replace(/["'\s]/g, '').replace('0x', ''), 16)));
    c.check('no run created on wrong network', ZERO_ADDR, readRunCast(M, acc8).owner);
    return c.result({ account: acc8, wrongChainId: 1, manifestChainId: M.chainId });
  } finally {
    await context.close();
  }
}

export async function s5(browser, acc6) {
  const c = new Checks();
  const M = readManifest();
  const { context, page } = await openPage(browser, { wallet: { account: 6 } });
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await connectAndStart(page);
    await selectBoth(page);
    const sentBefore = await sentCount(page);
    c.check('preview-ready before rejection: sent = startRun only', 1, sentBefore);
    await page.evaluate(() => window.__nfTestProvider.rejectNext('eth_sendTransaction'));
    await page.getByRole('button', { name: 'Execute deal' }).click();
    await page.getByText('Request declined. Nothing was sent.').waitFor({ timeout: 60000 });
    const status = await page.locator('section.chain-status').innerText();
    c.observe('declinedStatusText', status);
    c.truthy('declined text shown exactly', status.includes('Request declined. Nothing was sent.'));
    c.check('declined heading is "Wallet request"', 1, await page.getByRole('heading', { name: 'Wallet request' }).count());
    c.truthy('declined status does not use the word revert', !/revert/i.test(status));
    const p = await provider(page);
    c.check('sentTransactions unchanged after decline', sentBefore, p.sent.length);
    c.truthy('eth_sendTransaction was attempted and declined', p.requests.filter((m) => m === 'eth_sendTransaction').length >= 1, `requests=${p.requests.filter((m) => m === 'eth_sendTransaction').length}`);
    const run = readRunCast(M, acc6);
    c.check('chain: run still unsolved after decline', false, run.solved);
    c.check('chain: balances unchanged after decline', ['1', '0', '0', '1', '0', '0'], readBalancesCast(M, acc6));
    await shot(page, 'chain-declined-1440.png');
    // optional: a repeat Execute after returning to review succeeds
    await page.getByRole('button', { name: 'Back to review' }).click();
    await page.getByRole('button', { name: 'Execute deal' }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Execute deal' }).click();
    await page.getByText(WIN_TEXT).first().waitFor({ timeout: 120000 });
    c.check('optional repeat Execute after decline: confirmed', 2, (await provider(page)).sent.length);
    c.check('chain after repeat: solved', true, readRunCast(M, acc6).solved);
    return c.result({ account: acc6, optionalRepeatExecute: 'confirmed' });
  } finally {
    await context.close();
  }
}

export async function s6(browser, acc9) {
  const c = new Checks();
  const M = readManifest();
  const { context, page } = await openPage(browser, { wallet: { account: 9, preauth: true } });
  const failed = [];
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
  try {
    await page.goto(`${APP}/#/local/room/1`);
    // preauth: the wallet is already authorised, so no Connect click. Account 9 may already hold a run from an
    // earlier attempt of this scenario (harness failure, see report); start only when none exists.
    await page.locator('#promise-A, button:has-text("Start run")').first().waitFor({ timeout: 60000 });
    if (await page.getByRole('button', { name: 'Start run' }).count()) await page.getByRole('button', { name: 'Start run' }).click();
    await page.locator('#promise-A').waitFor({ state: 'attached', timeout: 120000 });
    await selectBoth(page);
    c.observe('substitution', 'Playwright page.route aborts every browser request to http://127.0.0.1:8545/** (direct RPC: wallet forwarding and viem reads)');
    await page.route('http://127.0.0.1:8545/**', (route) => route.abort());
    await page.getByRole('button', { name: 'Preview exchange' }).click();
    await page.waitForTimeout(4000);
    // Round 4: an RPC failure is shown as "Local chain unreachable", never as a contract rejection
    await page.getByRole('heading', { name: 'Local chain unreachable' }).waitFor({ timeout: 30000 });
    const unreachableBody = await bodyText(page);
    c.check('abort+preview: title "Local chain unreachable"', 1, await page.getByRole('heading', { name: 'Local chain unreachable' }).count());
    c.check('abort+preview: no "This exchange would not work"', false, unreachableBody.includes('This exchange would not work'));
    c.check('abort+preview: no "Change your selection"', false, unreachableBody.includes('Change your selection'));
    c.check('abort+preview: "Nothing was sent. The local chain could not be reached"', true, unreachableBody.includes('Nothing was sent. The local chain could not be reached'));
    const afterPreview = await bodyText(page);
    const statusNow = await page.locator('section.chain-status').allInnerTexts().catch(() => []);
    c.observe('afterAbortPreviewStatus', statusNow);
    c.check('abort+preview: no success text', false, afterPreview.includes(WIN_TEXT));
    c.check('abort+preview: no demo result', false, afterPreview.includes('Simulated result'));
    c.check('abort+preview: no Execute deal available', 0, await page.getByRole('button', { name: 'Execute deal' }).count());
    await shot(page, 'chain-rpc-failure-preview-1440.png');
    // reload while the RPC is down: must show the read error, not demo balances
    await page.reload();
    await page.getByRole('heading', { name: 'Local chain unavailable' }).waitFor({ timeout: 60000 });
    const down = await bodyText(page);
    c.check('reload with RPC down: rpc-unavailable heading', 1, await page.getByRole('heading', { name: 'Local chain unavailable' }).count());
    c.check('reload with RPC down: Retry offered', 1, await page.getByRole('button', { name: 'Retry' }).count());
    c.check('reload with RPC down: no board / balances / success', 0, (await page.locator('#promise-A').count()) + (down.includes(WIN_TEXT) ? 1 : 0) + (down.includes('Simulated result') ? 1 : 0));
    c.observe('requestFailedCount', failed.length);
    c.observe('requestFailedSample', failed.slice(0, 3));
    await shot(page, 'chain-rpc-failure-1440.png');
    await page.unroute('http://127.0.0.1:8545/**');
    // The account pin ran during the outage and could not reach Anvil (harness): pin the player again now that RPC is back.
    const pinned = await page.evaluate(() => window.__nfTestProvider.setAccountIndex(9).then(() => window.__nfTestProvider.getState()));
    c.observe('providerStateAfterRepin', pinned);
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.locator('#promise-A').waitFor({ state: 'attached', timeout: 60000 });
    c.check('after unroute + Retry: board back (run active)', 1, await page.locator('#promise-A').count());
    c.check('after Retry: run still active on chain', true, readRunCast(M, acc9).active);
    c.check('after Retry: balances from chain', ['1', '0', '0', '1', '0', '0'], readBalancesCast(M, acc9));
    c.check('after Retry: no send in this page session (sentTransactions = 0)', 0, await sentCount(page));
    return c.result({ account: acc9, substitution: 'page.route abort of http://127.0.0.1:8545/** (browser requests to the direct RPC)', failedRequests: failed.length });
  } finally {
    await context.close();
  }
}

// S7 stale preview. Substitution: the SAME execute() is sent outside the UI (cast send, real tx, same account),
// so the run becomes solved on chain while the UI still holds the preview.
// Expected (decided by the orchestrator after the fix round, not a defect): the controller re-reads the run before
// sending; because the run is now solved it goes to already-solved and shows the restored result. A preview cannot be
// re-used on a solved run. So: no UI send, no "confirmed by this session" result, Execute no longer offered, the page
// shows the result restored from the chain, and the restored proof names the EXTERNAL tx hash.
// S7b (stale WITHOUT a solved run) is NOT run: level 1 has one action per run, so the snapshot/nonce cannot change
// without solving the run; a different account's run does not change this account's snapshot.
// S7 stale preview. Substitution: the SAME execute() is sent outside the UI (cast send, real tx, same account),
// so the run becomes solved on chain while the UI still holds the preview.
// Expected (orchestrator decision): the controller re-reads the run before sending. The run is already solved, so it
// goes to already-solved and shows the restored result with the notice "Your previewed exchange was not sent. This run
// was solved by another transaction (<hash>)." The UI sends nothing, and the Proof panel's Execute transaction row shows
// the REAL hash of the external tx (checked against cast). S7b (stale without a solved run) is NOT run: level 1 has one
// action per run, so the snapshot and nonce cannot change without solving the run.
export async function s7(browser, acc7) {
  const c = new Checks();
  const M = readManifest();
  const { context, page } = await openPage(browser, { wallet: { account: 7 } });
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await connectAndStart(page);
    await selectBoth(page);
    const sentBefore = await sentCount(page);
    const nonce = readRunCast(M, acc7).nonce;
    const snap = readSnapshotCast(M, acc7);
    const offerA = castMust(['call', M.npcA, 'ownOffer()(bytes32)', '--rpc-url', RPC], 'ownOffer A').toLowerCase();
    const offerB = castMust(['call', M.npcB, 'ownOffer()(bytes32)', '--rpc-url', RPC], 'ownOffer B').toLowerCase();
    const pkg = `[(0,${offerA}),(1,${offerB}),(2,${ZERO_BYTES32})]`;
    c.observe('externalArgs', { runId: runIdOf(acc7), package: pkg, nonce, snapshotHash: snap });
    const send = castRun(['send', '--unlocked', '--from', acc7, '--rpc-url', RPC, '--json', M.coordinator, 'execute(uint256,(uint8,bytes32)[],uint256,bytes32)', runIdOf(acc7), pkg, nonce, snap]);
    c.check('external cast send exit', 0, send.code);
    const ext = JSON.parse(send.out || '{}');
    const extHash = (ext.data ?? ext).transactionHash ?? null;
    c.observe('externalTxHash', extHash);
    const rc = readReceiptCast(extHash, 'external-execute.json');
    c.check('external execute receipt status (cast)', '0x1', rc.json?.status ?? 'missing');
    c.check('chain: run solved by the external tx', true, readRunCast(M, acc7).solved);
    c.check('UI still shows the preview before the click (review visible)', 1, await page.locator('#review-title').count());
    await page.getByRole('button', { name: 'Execute deal' }).click();
    await page.waitForFunction(() => document.body.innerText.includes('solved by another transaction'), null, { timeout: 60000 });
    await page.waitForTimeout(500);
    const body = await bodyText(page);
    c.check('UI sent NOTHING (sentTransactions unchanged)', sentBefore, await sentCount(page));
    c.check('notice: "Your previewed exchange was not sent"', true, body.includes('Your previewed exchange was not sent'));
    c.check('notice: "solved by another transaction" with the external hash', true, body.includes(`solved by another transaction (${extHash})`));
    c.check('restored result shown ("Restored from the local chain")', true, body.includes('Restored from the local chain'));
    c.check('not shown as confirmed by this session', false, body.includes('Confirmed on the local chain.'));
    c.check('Execute deal no longer offered', 0, await page.getByRole('button', { name: 'Execute deal' }).count());
    const pp = await readProofPanel(page);
    c.observe('proofPanelRestored', pp);
    const execHash = pp.sections['Execute transaction']?.rows['Hash'] ?? null;
    c.check('Proof Execute transaction row = REAL external tx hash (cast)', extHash, execHash);
    c.check('chain: run solved, not active', { solved: true, active: false }, (({ solved, active }) => ({ solved, active }))(readRunCast(M, acc7)));
    await shotAt(page, 'chain-stale-preview-1440.png', page.getByText('Your previewed exchange was not sent'));
    return c.result({ account: acc7, substitution: 'real execute() sent with cast send --unlocked from the same account before the UI click', externalTxHash: extHash, expectedPath: 'already-solved: notice + restored result, no UI send' });
  } finally {
    await context.close();
  }
}

export async function s8(browser, accs) {
  const c = new Checks();
  const acc1 = accs[1];
  const oldM = readManifest();
  copyFileSync(MANIFEST_FILE, BACKUP);
  // 1. stop Anvil: stop deletes the manifest
  const stop = localChain(['stop'], 'S8-1-stop.log');
  c.check('stop exit', 0, stop.code);
  c.check('stop removed manifest', true, !existsSync(MANIFEST_FILE));
  let ctx = await openPage(browser, { wallet: { account: 1, preauth: true } });
  try {
    await ctx.page.goto(`${APP}/#/local/room/1`);
    await ctx.page.getByRole('heading', { name: 'Local deployment not usable' }).waitFor({ timeout: 60000 });
    let body = await bodyText(ctx.page);
    c.check('anvil stopped: deployment-error heading', 1, await ctx.page.getByRole('heading', { name: 'Local deployment not usable' }).count());
    c.truthy('anvil stopped: message names missing deployment file', body.includes('No local deployment found'));
    c.truthy('anvil stopped: command to run shown', body.includes('node scripts/chain/local-chain.mjs start && node scripts/chain/local-chain.mjs deploy'));
    c.check('anvil stopped: no old run data', false, body.includes(WIN_TEXT) || body.includes('Start run'));
    await shot(ctx.page, 'chain-deployment-missing-1440.png');
  } finally {
    await ctx.context.close();
  }
  // 2. start WITHOUT deploy (start deletes the manifest); then put back the previous manifest copy as a stale file
  const start = localChain(['start'], 'S8-2-start.log');
  c.check('start (no deploy) exit', 0, start.code);
  copyFileSync(BACKUP, MANIFEST_FILE);
  c.observe('substitution', 'restored the previous (pre-restart) manifest copy to simulate a stale deployment file after restart');
  ctx = await openPage(browser, { wallet: { account: 1, preauth: true } });
  try {
    await ctx.page.goto(`${APP}/#/local/room/1`);
    await ctx.page.getByRole('heading', { name: 'Local deployment not usable' }).waitFor({ timeout: 60000 });
    const body = await bodyText(ctx.page);
    const detail = await ctx.page.locator('.chain-status__body').innerText();
    c.observe('staleDetail', detail);
    c.truthy('stale: message says deployment does not match running chain', body.includes('does not match the running chain'));
    c.check('stale: no old run data (no success, no board)', 0, (body.includes(WIN_TEXT) ? 1 : 0) + (await ctx.page.locator('#promise-A').count()));
  } finally {
    await ctx.context.close();
  }
  // 3. deploy again: fresh chain, page works, the old solved run must not appear
  const dep = localChain(['deploy'], 'S8-3-deploy.log');
  c.check('deploy exit', 0, dep.code);
  const newM = readManifest();
  c.truthy('new deployment has a different deployBlockHash', newM.deployBlockHash !== oldM.deployBlockHash, `${oldM.deployBlockHash} -> ${newM.deployBlockHash}`);
  c.observe('deploymentBefore', { deployBlockHash: oldM.deployBlockHash, deployTxHash: oldM.deployTxHash });
  c.observe('deploymentAfter', { deployBlockHash: newM.deployBlockHash, deployTxHash: newM.deployTxHash, coordinator: newM.coordinator });
  c.check('fresh chain: runOf(account 1) owner is zero (old solved run gone)', ZERO_ADDR, readRunCast(newM, acc1).owner);
  ctx = await openPage(browser, { wallet: { account: 1, preauth: true } });
  try {
    await ctx.page.goto(`${APP}/#/local/room/1`);
    await ctx.page.getByRole('heading', { name: 'Start a run' }).waitFor({ timeout: 60000 });
    const body = await bodyText(ctx.page);
    c.check('after deploy: Start a run offered (no old solved result)', 1, await ctx.page.getByRole('button', { name: 'Start run' }).count());
    c.check('after deploy: no success text', false, body.includes(WIN_TEXT));
  } finally {
    await ctx.context.close();
  }
  return c.result({ oldDeployBlockHash: oldM.deployBlockHash, newDeployBlockHash: newM.deployBlockHash, newCoordinator: newM.coordinator });
}
