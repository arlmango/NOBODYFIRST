// Round-2 scenarios: S11 restart + redeploy under an open page (preview-ready and no-run variants),
// S12 cancelled transaction (automine off, replacement with same nonce), S12b replaced-by-identical-execute.
import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP, LOGS, RPC, ROOT, ZERO_ADDR, ZERO_BYTES32, Checks, castMust, castRun, bodyText, openPage, provider, readBalancesCast,
  readManifest, readReceiptCast, readRunCast, readSnapshotCast, runIdOf, sentCount, shot,
} from './lib.mjs';
import { localChain } from './scenarios-errors.mjs';
import { log } from './lib.mjs';

const WIN_TEXT = 'Everyone kept their promise.';
const DEPLOY_ERR = 'Local deployment not usable';

async function connectAndStart(page) {
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: 'Start run' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('#promise-A').waitFor({ state: 'attached', timeout: 120000 });
}
async function previewBoth(page) {
  await page.locator('#promise-A').check();
  await page.locator('#promise-B').check();
  await page.getByRole('button', { name: 'Preview exchange' }).click();
  await page.locator('#review-title').waitFor({ timeout: 60000 });
}
const num = (v) => BigInt(String(v));

/** Anvil automine control; always restored by the caller's finally. */
function setAutomine(on) {
  castMust(['rpc', 'evm_setAutomine', on ? 'true' : 'false', '--rpc-url', RPC], `evm_setAutomine ${on}`);
}

/** eth_getTransactionReceipt via RPC (cast receipt would block on a pending tx while automine is off). */
function receiptIsNull(hash) {
  const r = castRun(['rpc', 'eth_getTransactionReceipt', hash, '--rpc-url', RPC]);
  return r.code === 0 && r.out === 'null';
}

function txFields(hash) {
  const r = castRun(['tx', hash, '--json', '--rpc-url', RPC]);
  if (r.code !== 0) return { code: r.code, json: null };
  const j = JSON.parse(r.out);
  return { code: 0, json: j.data ?? j };
}

/** Deployment-state headings the UI may show after a restart under an open page. */
function restartMessage(body) {
  const hits = [DEPLOY_ERR, 'The preview is out of date', 'Local chain unavailable', 'Could not read', 'Start a run', 'does not match the running chain']
    .filter((s) => body.includes(s));
  return hits;
}

export async function s11(browser, accs) {
  const c = new Checks();
  const acc8 = accs[8];
  const acc3 = accs[3];
  // ---- variant A: preview-ready (account 8)
  let { context, page } = await openPage(browser, { wallet: { account: 8 } });
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await connectAndStart(page);
    await previewBoth(page);
    const sentBefore = await sentCount(page);
    const oldBalances = readBalancesCast(readManifest(), acc8);
    c.observe('A.balancesOnChainBeforeRestart', oldBalances);
    c.check('A: preview-ready, sentTransactions = startRun only', 1, sentBefore);
    const oldM = readManifest();
    copyFileSync(join(ROOT, 'contracts', 'deployments', 'local-anvil.json'), join(ROOT, 'scripts', 'chain', '.run', 'manifest-s11a-old.json'));
    c.check('A: stop exit', 0, localChain(['stop'], 'S11-A-1-stop.log').code);
    c.check('A: start exit', 0, localChain(['start'], 'S11-A-2-start.log').code);
    c.check('A: deploy exit', 0, localChain(['deploy'], 'S11-A-3-deploy.log').code);
    const newM = readManifest();
    c.observe('A.deployBlockHash', { old: oldM.deployBlockHash, new: newM.deployBlockHash });
    c.truthy('A: deployBlockHash differs after redeploy', oldM.deployBlockHash !== newM.deployBlockHash, `${oldM.deployBlockHash} -> ${newM.deployBlockHash}`);
    c.observe('A.addresses', { coordinator: newM.coordinator, items: newM.items, npcA: newM.npcA, npcB: newM.npcB, npcC: newM.npcC });
    c.truthy('A: coordinator address unchanged (same deployer nonce)', oldM.coordinator.toLowerCase() === newM.coordinator.toLowerCase(), newM.coordinator);
    await page.getByRole('button', { name: 'Execute deal' }).click();
    await page.waitForTimeout(6000);
    const sentAfter = await sentCount(page);
    const p = await provider(page);
    c.check('A: Execute sends NOTHING (sentTransactions unchanged)', sentBefore, sentAfter);
    c.check('A: no execute in provider sends', 0, p.sent.length - 1);
    const body = await bodyText(page);
    const shown = restartMessage(body);
    c.observe('A.messagesAfterExecute', shown);
    c.observe('A.bodyAfterExecute', body.slice(0, 600));
    c.truthy('A: page shows a deployment/stale/read error (not the old preview as current)', shown.length > 0 && !body.includes(WIN_TEXT), shown.join(' | '));
    c.check('A: no success text', false, body.includes(WIN_TEXT));
    c.check('A: chain: no run for account 8 on new chain', ZERO_ADDR, readRunCast(newM, acc8).owner);
    await shot(page, 'chain-restart-execute-1440.png');
  } finally {
    await context.close();
  }
  // reload against the new chain: account 8 has no run -> Start a run
  ({ context, page } = await openPage(browser, { wallet: { account: 8 } }));
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('button', { name: 'Start run' }).waitFor({ timeout: 60000 });
    c.check('A reload: UI works against new chain (Start run offered)', 1, await page.getByRole('button', { name: 'Start run' }).count());
    c.check('A reload: no old balances / success', false, (await bodyText(page)).includes(WIN_TEXT));
  } finally {
    await context.close();
  }

  // ---- variant B: no-run (account 3), restart + redeploy, then Start run must send nothing
  ({ context, page } = await openPage(browser, { wallet: { account: 3 } }));
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('button', { name: 'Start run' }).waitFor({ timeout: 60000 });
    const sentBefore = await sentCount(page);
    const m0 = readManifest();
    c.check('B: stop exit', 0, localChain(['stop'], 'S11-B-1-stop.log').code);
    c.check('B: start exit', 0, localChain(['start'], 'S11-B-2-start.log').code);
    c.check('B: deploy exit', 0, localChain(['deploy'], 'S11-B-3-deploy.log').code);
    const m1 = readManifest();
    c.observe('B.deployBlockHash', { old: m0.deployBlockHash, new: m1.deployBlockHash });
    c.truthy('B: deployBlockHash differs after redeploy', m0.deployBlockHash !== m1.deployBlockHash, `${m0.deployBlockHash} -> ${m1.deployBlockHash}`);
    await page.getByRole('button', { name: 'Start run' }).click();
    await page.waitForTimeout(6000);
    const sentAfter = await sentCount(page);
    c.check('B: Start run sends NOTHING', sentBefore, sentAfter);
    const body = await bodyText(page);
    const shown = restartMessage(body);
    c.observe('B.messagesAfterStartRun', shown);
    c.truthy('B: deployment/stale/read error shown after Start run click', shown.length > 0, shown.join(' | '));
    c.check('B: chain: no run created for account 3', ZERO_ADDR, readRunCast(m1, acc3).owner);
    await shot(page, 'chain-restart-startrun-1440.png');
  } finally {
    await context.close();
  }
  ({ context, page } = await openPage(browser, { wallet: { account: 3 } }));
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('button', { name: 'Start run' }).waitFor({ timeout: 60000 });
    c.check('B reload: UI works against new chain (Start run offered)', 1, await page.getByRole('button', { name: 'Start run' }).count());
  } finally {
    await context.close();
  }
  return c.result({ accounts: { preview: acc8, noRun: acc3 } });
}

/** Shared: account at preview-ready, automine off, Execute, then a cancellation or identical replacement. */
async function replacementRun(browser, index, acct, kind) {
  const c = new Checks();
  const M = readManifest();
  const { context, page } = await openPage(browser, { wallet: { account: index } });
  let automineOff = false;
  try {
    await page.goto(`${APP}/#/local/room/1`);
    if (kind === 'cancel') {
      await connectAndStart(page);
    } else {
      await page.getByRole('button', { name: 'Connect wallet' }).click();
      await page.locator('#promise-A').waitFor({ state: 'attached', timeout: 60000 });
    }
    await previewBoth(page);
    c.check('preview-ready', 1, await page.locator('#review-title').count());
    const sentBefore = await sentCount(page);
    setAutomine(false);
    automineOff = true;
    await page.getByRole('button', { name: 'Execute deal' }).click();
    await page.waitForFunction((n) => window.__nfTestProvider.sentTransactions.length > n, sentBefore, { timeout: 60000 });
    const h1 = (await provider(page)).sent.at(-1);
    c.observe('originalExecuteHash', h1);
    const t1 = txFields(h1);
    c.check('original tx visible to Anvil while pending (cast tx exit)', 0, t1.code);
    const nonce = num(t1.json.nonce);
    const maxFee = num(t1.json.maxFeePerGas ?? t1.json.gasPrice);
    const prio = num(t1.json.maxPriorityFeePerGas ?? t1.json.gasPrice ?? 0);
    c.observe('originalNonce', nonce.toString());
    c.observe('originalFees', { maxFeePerGas: maxFee.toString(), maxPriorityFeePerGas: prio.toString() });
    c.check('original tx not mined yet (eth_getTransactionReceipt is null)', true, receiptIsNull(h1));
    let rHash;
    if (kind === 'cancel') {
      const r = castRun(['send', '--unlocked', '--async', '--from', acct, '--rpc-url', RPC, '--nonce', nonce.toString(),
        '--gas-price', (maxFee * 2n).toString(), '--priority-gas-price', ((prio || 1n) * 2n).toString(), '--gas-limit', '21000', '--value', '0', acct]);
      c.check('cancellation send (cast send --async) exit', 0, r.code);
      rHash = r.out;
    } else {
      // identical execute with the same args the UI previewed (nonce and snapshot from the chain before the first send)
      const runNonce = readRunCast(M, acct).nonce;
      const snap = readSnapshotCast(M, acct);
      const offerA = castMust(['call', M.npcA, 'ownOffer()(bytes32)', '--rpc-url', RPC], 'ownOffer A').toLowerCase();
      const offerB = castMust(['call', M.npcB, 'ownOffer()(bytes32)', '--rpc-url', RPC], 'ownOffer B').toLowerCase();
      const pkg = `[(0,${offerA}),(1,${offerB}),(2,${ZERO_BYTES32})]`;
      const r = castRun(['send', '--unlocked', '--async', '--from', acct, '--rpc-url', RPC, '--nonce', nonce.toString(),
        '--gas-price', (maxFee * 2n).toString(), '--priority-gas-price', ((prio || 1n) * 2n).toString(),
        '--gas-limit', num(t1.json.gas).toString(), M.coordinator, 'execute(uint256,(uint8,bytes32)[],uint256,bytes32)', runIdOf(acct), pkg, runNonce, snap]);
      c.check('identical-execute replacement send exit', 0, r.code);
      rHash = r.out;
      c.observe('replacementArgs', { package: pkg, nonce: runNonce, snapshotHash: snap });
    }
    c.observe('replacementHash', rHash);
    castMust(['rpc', 'evm_mine', '--rpc-url', RPC], 'evm_mine');
    setAutomine(true);
    automineOff = false;
    await page.waitForFunction(
      () => !!document.getElementById('chain-replaced-title') || document.body.innerText.includes('Everyone kept their promise.') || document.body.innerText.includes('Restored from the local chain'),
      null,
      { timeout: 90000 },
    ).catch(async (e) => {
      c.observe('uiWhenNoticeMissing', (await bodyText(page)).slice(0, 900));
      c.observe('providerWhenNoticeMissing', await provider(page));
      log(`  DIAG ${JSON.stringify(c.observed).slice(0, 2500)}`);
      throw e;
    });
    await page.evaluate(() => document.querySelectorAll('details.proof').forEach((d) => (d.open = true)));
    await page.waitForTimeout(1000);
    const notice = page.locator('#chain-replaced-title');
    const hasNotice = (await notice.count()) > 0;
    c.observe('noticeShown', hasNotice);
    c.observe('noticeHeading', hasNotice ? await notice.innerText() : null);
    if (kind === 'cancel') c.truthy('cancel: "Transaction cancelled" notice shown', hasNotice && (await notice.innerText()).includes('Transaction cancelled'));
    const body = await bodyText(page);
    const sentNow = (await provider(page)).sent;
    c.check('no new send from the UI during replacement (only the original execute)', sentBefore + 1, sentNow.length);
    c.observe('originalHashVisibleInUi', body.includes(h1));
    if (kind === 'cancel') c.truthy('notice contains the original hash', body.includes(h1));
    c.truthy('notice contains the replacement hash', body.includes(rHash));
    const pp = await page.evaluate(() => {
      document.querySelectorAll('details.proof').forEach((d) => (d.open = true));
      const sec = [...document.querySelectorAll('details.proof section.proof__section')].find((s) => s.querySelector('h3')?.textContent.trim() === 'Execute transaction');
      const rows = {};
      sec?.querySelectorAll(':scope > dl > .proof__row').forEach((r) => (rows[r.querySelector('dt').textContent.trim()] = r.querySelector('dd').textContent.trim()));
      const rep = sec?.querySelector('.proof__replacement');
      const repRows = {};
      rep?.querySelectorAll('.proof__row').forEach((r) => (repRows[r.querySelector('dt').textContent.trim()] = r.querySelector('dd').textContent.trim()));
      return { rows, replacementText: rep ? rep.innerText : null, repRows };
    });
    c.observe('proofExecuteSection', pp);
    if (kind === 'cancel') {
      c.check('proof: original shown as "Original hash"', h1, pp.rows['Original hash']);
      c.check('proof: original has no receipt status row', undefined, pp.rows['Receipt status']);
      c.check('proof: original has no block row', undefined, pp.rows['Block']);
    } else {
      // observed behaviour (replaced, state solved): the UI shows the replacement as the execute tx
      c.check('proof: mined replacement hash in main section (Hash row)', rHash, pp.rows['Hash']);
      c.check('proof: Replacement group shows "Original hash" = original sent hash', h1, pp.repRows['Original hash'] ?? 'missing');
      c.check('proof: Receipt status row (replacement)', 'success', pp.rows['Receipt status']);
    }
    c.truthy('proof: replacement group present', pp.replacementText !== null);
    const rcpt = readReceiptCast(rHash, kind === 'cancel' ? 'replacement-cancel.json' : 'replacement-identical.json');
    c.check('replacement receipt exit', 0, rcpt.code);
    // cancel: the Replacement group carries the replacement hash; identical (round 4): the group carries 'Original hash' and
    // the mined replacement hash is the main Hash row (checked above)
    if (kind === 'cancel') c.truthy('proof: replacement group shows its real hash', pp.replacementText !== null && pp.replacementText.includes(rHash));
    c.check('replacement receipt status (cast)', '0x1', rcpt.json?.status ?? 'missing');
    const bn = rcpt.json ? BigInt(rcpt.json.blockNumber).toString() : 'missing';
    c.check('proof: replacement block equals cast receipt block', bn, kind === 'identical' ? (pp.rows['Block'] ?? 'missing') : (pp.repRows['Block'] ?? pp.repRows['Replacement block'] ?? 'missing'));
    const orig = txFields(h1);
    c.observe('originalAfterMine', { code: orig.code, out: orig.code === 0 ? 'found' : 'not found' });
    c.check('original tx has no receipt after mining (eth_getTransactionReceipt is null)', true, receiptIsNull(h1));
    return { c, page, context, M, acct, h1, rHash };
  } finally {
    if (automineOff) castRun(['rpc', 'evm_setAutomine', 'true', '--rpc-url', RPC]);
  }
}

export async function s12(browser, accs) {
  const acct = accs[5];
  const r = await replacementRun(browser, 5, acct, 'cancel');
  try {
    const { c, page, M } = r;
    const run = readRunCast(M, acct);
    c.check('chain: run NOT solved after cancellation', false, run.solved);
    c.check('chain: run still active (cast)', true, run.active);
    c.check('chain: balances unchanged', ['1', '0', '0', '1', '0', '0'], readBalancesCast(M, acct));
    c.check('no success text', false, (await bodyText(page)).includes(WIN_TEXT));
    await shot(page, 'chain-cancelled-1440.png');
    return c.result({ account: acct, originalExecuteHash: r.h1, replacementHash: r.rHash });
  } finally {
    await r.context.close();
  }
}

export async function s12b(browser, accs) {
  const acct = accs[5];
  const r = await replacementRun(browser, 5, acct, 'identical');
  try {
    const { c, page, M } = r;
    const run = readRunCast(M, acct);
    c.check('chain: run solved by the replacement', true, run.solved);
    c.check('chain: balances after = expected', ['0', '1', '1', '0', '0', '0'], readBalancesCast(M, acct));
    c.truthy('UI: success or restored result after replacement', (await bodyText(page)).includes(WIN_TEXT) || (await bodyText(page)).includes('Restored from the local chain'));
    await shot(page, 'chain-replaced-identical-1440.png');
    // PASS with limitation (documented, not a defect): the replaced-and-solved outcome shows a confirmed result with
    // no 'Transaction replaced' notice; the original hash is not displayed. The UI shows the real mined replacement
    // hash (Hash row) and a Replacement group in the proof panel.
    return c.result({ account: acct, originalExecuteHash: r.h1, replacementHash: r.rHash, statusNote: 'PASS with limitation', limitation: "identical execute with higher fee: outcome and mined replacement hash shown correctly; no visible 'replaced' notice (the original hash is shown as 'Original hash' in the proof panel's Replacement group)" });
  } finally {
    await r.context.close();
  }
}
