// Core Local-chain scenarios: S1 happy path, S1b reload restore, S2 incomplete selection, S3 account switch.
import fs, { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP, DESKTOP, EVID, MOBILE, RECEIPTS, RPC, ZERO_ADDR, ZERO_BYTES32, Checks, castMust, castRun, decodedEventNames,
  bodyText, log, openPage, provider, readBalancesCast, readProofPanel, readReceiptCast, readRunCast, readSnapshotCast,
  runIdOf, sameAddr, sentCount, shot, shotAt, readManifest,
} from './lib.mjs';

export const LOCAL_NOTICE = 'Local blockchain · Anvil';
export const WIN_TEXT = 'Everyone kept their promise.';

export function anvilAccounts() {
  const r = castRun(['rpc', 'eth_accounts', '--rpc-url', RPC]);
  if (r.code !== 0) throw new Error(`eth_accounts exit ${r.code}`);
  return JSON.parse(r.out);
}

/** Human text the UI shows for a holding, same formatting as the app (useChainLevel.formatHolding). */
export function holdingText(balances, npcId) {
  const key = BigInt(balances[npcId * 2]);
  const coin = BigInt(balances[npcId * 2 + 1]);
  const parts = [];
  if (key > 0n) parts.push(`${key} ${key === 1n ? 'key' : 'keys'}`);
  if (coin > 0n) parts.push(`${coin} ${coin === 1n ? 'coin' : 'coins'}`);
  return parts.length ? parts.join(', ') : 'empty';
}

const LETTERS = ['A', 'B', 'C'];

async function connectAndStart(page) {
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: 'Start run' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('#promise-A').waitFor({ state: 'attached', timeout: 120000 });
}

/** Waits until the board (active run) is shown. */
async function waitBoard(page) {
  await page.locator('#promise-A').waitFor({ state: 'attached', timeout: 120000 });
}

export async function s1(browser, acc1) {
  const c = new Checks();
  const M = readManifest();
  const acct = acc1;
  const { context, page } = await openPage(browser, { wallet: { account: 1 } });
  try {
    c.observe('account', acct);
    // Rooms page in Local chain mode: new note; no 'not implemented' wording
    await page.goto(`${APP}/#/local`);
    await page.getByText('This build talks to a local test chain (Anvil). Nothing here is public or real money.').first().waitFor({ timeout: 30000 });
    const roomsBody = await bodyText(page);
    c.check('#/local rooms: new note present', true, roomsBody.includes('This build talks to a local test chain (Anvil). Nothing here is public or real money.'));
    c.check('#/local rooms: no "Blockchain execution is not implemented yet"', false, roomsBody.includes('Blockchain execution is not implemented yet'));
    await page.goto(`${APP}/#/local/room/1`);
    const notice = page.getByText(LOCAL_NOTICE, { exact: true }).first();
    await notice.waitFor({ timeout: 30000 });
    c.check('mode notice exact text', LOCAL_NOTICE, (await notice.textContent()).trim());
    c.check('no run before start (cast owner)', ZERO_ADDR, readRunCast(M, acct).owner);
    const nonce0 = Number(castMust(['nonce', acct, '--rpc-url', RPC], 'nonce0'));
    await connectAndStart(page);
    const p1 = await provider(page);
    c.check('sentTransactions after Start run = 1 (startRun)', 1, p1.sent.length);
    const startHash = p1.sent[0];
    c.observe('startRunTx', startHash);
    const sr = readReceiptCast(startHash, 'startRun.json');
    c.check('startRun receipt status', '0x1', sr.json?.status ?? 'missing');
    const nonce1 = Number(castMust(['nonce', acct, '--rpc-url', RPC], 'nonce1'));
    c.observe('accountNonce', { before: nonce0, afterStartRun: nonce1 });
    c.check('account nonce after startRun = before + 1 (chain)', nonce0 + 1, nonce1);
    const runStart = readRunCast(M, acct);
    c.check('runOf after startRun (owner,active,solved)', { owner: acct.toLowerCase(), active: true, solved: false }, { owner: runStart.owner, active: runStart.active, solved: runStart.solved });
    const before = readBalancesCast(M, acct);
    c.check('BEFORE balances (cast) [A.KEY,A.COIN,B.KEY,B.COIN,C.KEY,C.COIN]', ['1', '0', '0', '1', '0', '0'], before);
    c.observe('balancesBefore', before);

    await page.locator('#promise-A').check();
    await page.locator('#promise-B').check();
    c.check('before Preview: body lacks success text', false, (await bodyText(page)).includes(WIN_TEXT));
    await page.getByRole('button', { name: 'Preview exchange' }).click();
    await page.locator('#review-title').waitFor({ timeout: 60000 });
    c.check('Preview ready shows Execute deal', 1, await page.getByRole('button', { name: 'Execute deal' }).count());
    const reviewNote = await page.locator('.review__note, .review__sim').allInnerTexts();
    c.observe('reviewNotes', reviewNote);
    c.check('review note text (one transaction, all reverted)', true, reviewNote.join(' ').includes('One transaction: if any check fails, all of it is reverted.'));
    const transfers = await page.locator('.review__transfers li').allInnerTexts();
    c.observe('previewTransfers', transfers);
    c.check('preview transfers (UI)', ['A → B: 1 key', 'B → A: 1 coin'], transfers);
    await page.setViewportSize(MOBILE);
    await shotAt(page, 'chain-game-390.png', page.getByRole('button', { name: 'Execute deal' }));
    await page.setViewportSize(DESKTOP);
    await shotAt(page, 'chain-game-1440.png', page.getByRole('button', { name: 'Execute deal' }));

    // real double click on Execute: the UI must forward exactly one execute
    await page.getByRole('button', { name: 'Execute deal' }).dblclick();
    await page.getByText(WIN_TEXT).first().waitFor({ timeout: 120000 });
    const p2 = await provider(page);
    c.check('sentTransactions after double click = 2 (startRun + execute)', 2, p2.sent.length);
    const execHash = p2.sent[1];
    c.observe('executeTx', execHash);
    globalThis.__s1ExecHash = execHash;
    const er = readReceiptCast(execHash, 'execute.json');
    c.check('execute receipt status', '0x1', er.json?.status ?? 'missing');
    const after = readBalancesCast(M, acct);
    c.check('AFTER balances (cast)', ['0', '1', '1', '0', '0', '0'], after);
    c.observe('balancesAfter', after);
    const nonce2 = Number(castMust(['nonce', acct, '--rpc-url', RPC], 'nonce2'));
    c.observe('accountNonce', { before: nonce0, afterStartRun: nonce1, afterExecute: nonce2 });
    c.check('account nonce after execute = before + 2 (startRun + one execute, chain)', nonce0 + 2, nonce2);
    c.check('account nonce across the execute only = +1 (double click sent one tx)', 1, nonce2 - nonce1);
    const runEnd = readRunCast(M, acct);
    c.check('runOf after execute (owner,active,solved,nonce)', { owner: acct.toLowerCase(), active: false, solved: true, nonce: '1' }, { owner: runEnd.owner, active: runEnd.active, solved: runEnd.solved, nonce: runEnd.nonce });
    const execEvents = decodedEventNames(er.json);
    const startEvents = decodedEventNames(sr.json);
    c.observe('startRunEvents(receipt)', startEvents);
    c.observe('executeEvents(receipt)', execEvents);

    // proof panel vs chain
    const pp = await readProofPanel(page);
    c.observe('proofPanel', pp);
    const top = pp.top;
    c.check('proof Mode', 'Local chain', top['Mode']);
    c.check('proof Chain ID', '31337', top['Chain ID']);
    c.truthy('proof Coordinator == manifest', sameAddr(top['Coordinator'], M.coordinator), `${top['Coordinator']}`);
    c.truthy('proof Item ledger == manifest', sameAddr(top['Item ledger'], M.items), `${top['Item ledger']}`);
    c.truthy('proof NPC A == manifest', sameAddr(top['NPC A'], M.npcA));
    c.truthy('proof NPC B == manifest', sameAddr(top['NPC B'], M.npcB));
    c.truthy('proof NPC C == manifest', sameAddr(top['NPC C'], M.npcC));
    c.truthy('proof Player == account', sameAddr(top['Player'], acct), `${top['Player']}`);
    c.check('proof Run ID == uint160(account)', runIdOf(acct), top['Run ID']);
    const startSec = pp.sections['Start run transaction'].rows;
    const execSec = pp.sections['Execute transaction'].rows;
    c.truthy('proof startRun hash == sent[0]', sameAddr(startSec['Hash'], startHash), startSec['Hash']);
    c.truthy('proof execute hash == sent[1]', sameAddr(execSec['Hash'], execHash), execSec['Hash']);
    c.check('proof startRun block', BigInt(sr.json.blockNumber).toString(), startSec['Block']);
    c.check('proof execute block', BigInt(er.json.blockNumber).toString(), execSec['Block']);
    c.check('proof execute receipt status', 'success', execSec['Receipt status']);
    c.check('proof startRun events', startEvents.map(String), pp.sections['Start run transaction'].events.map((t) => t.split('(')[0]));
    c.check('proof execute events', execEvents, pp.sections['Execute transaction'].events.map((t) => t.split('(')[0]));
    const finalRows = pp.sections['Final balances (read from the ledger)'].rows;
    const expectFinal = { A: holdingText(after, 0), B: holdingText(after, 1), C: holdingText(after, 2) };
    c.check('proof final balances == cast', expectFinal, { A: finalRows.A, B: finalRows.B, C: finalRows.C });
    const body = await bodyText(page);
    c.check('success text present after confirmation', true, body.includes(WIN_TEXT));
    c.check('no "Reset demo" in local mode', false, body.includes('Reset demo'));
    c.check('no "Preview Room 02" in local mode', false, body.includes('Preview Room 02'));
    c.check('repeat-attempt sentence shown', true, body.includes('A repeat attempt is not supported in this version.'));
    await shot(page, 'chain-result-1440.png');
    await page.setViewportSize(MOBILE);
    await shot(page, 'chain-result-390.png');
    await page.setViewportSize(DESKTOP);
    const tx = await provider(page);
    c.check('total sentTransactions after success', 2, tx.sent.length);

    writeFileSync(join(EVID, 'state-before-after.md'), beforeAfterTable({ acct, M, before, after, startHash, execHash, runStart, runEnd, startEvents, execEvents, sr, er }));
    return c.result({ account: acct, startRunTx: startHash, executeTx: execHash });
  } finally {
    await context.close();
  }
}

function beforeAfterTable({ acct, M, before, after, startHash, execHash, runStart, runEnd, startEvents, execEvents, sr, er }) {
  const row = (n, b, a) => `| ${n} | ${holdingText(b, n)} | ${holdingText(a, n)} |`;
  return `# Stage 3 · Local chain · state before / after (S1)

Account (player): \`${acct}\` · runId: \`${runIdOf(acct)}\` · chain 31337 · coordinator \`${M.coordinator}\` · items \`${M.items}\`

Balances are read with \`cast call items 'snapshotBalances(uint256)(uint256[6])'\` (raw: \`[A.KEY, A.COIN, B.KEY, B.COIN, C.KEY, C.COIN]\`).

| Item | Before | After |
|---|---|---|
| raw | \`[${before.join(', ')}]\` | \`[${after.join(', ')}]\` |

| Person | Before | After (ledger) |
|---|---|---|
${row(0, before, after).replace('| 0 |', '| A |')}
${row(1, before, after).replace('| 1 |', '| B |')}
${row(2, before, after).replace('| 2 |', '| C |')}

Run state (\`coordinator.runOf\`): before start \`${ZERO_ADDR}\` (no run); after startRun owner \`${runStart.owner}\`, active \`${runStart.active}\`, solved \`${runStart.solved}\`; after execute owner \`${runEnd.owner}\`, active \`${runEnd.active}\`, solved \`${runEnd.solved}\`, nonce \`${runEnd.nonce}\`.

Transactions: startRun \`${startHash}\` (block ${BigInt(sr.json.blockNumber)}, status ${sr.json.status}, events ${startEvents.join(', ')}); execute \`${execHash}\` (block ${BigInt(er.json.blockNumber)}, status ${er.json.status}, events ${execEvents.join(', ')}).
`;
}

export async function s1b(browser, acc1) {
  const c = new Checks();
  const M = readManifest();
  const { context, page } = await openPage(browser, { wallet: { account: 1, preauth: true } });
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await page.getByText(WIN_TEXT).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(2000);
    const p = await provider(page);
    c.check('sentTransactions after reload = 0 (no auto re-execution)', 0, p.sent.length);
    c.check('no "Start run" button after reload', 0, await page.getByRole('button', { name: 'Start run' }).count());
    c.check('restored layout text', true, (await bodyText(page)).includes('Restored from the local chain. This run was solved earlier.'));
    const ls = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        out[k] = localStorage.getItem(k);
      }
      return out;
    });
    c.observe('localStorageKeys', Object.keys(ls));
    const solvedFlags = Object.entries(ls).filter(([k, v]) => /solved/i.test(k) || /"solved"\s*:\s*true|solved=true/i.test(String(v)));
    c.check('localStorage has no solved flag', 0, solvedFlags.length);
    c.check('localStorage holds no run result (no "Everyone" text)', 0, Object.values(ls).filter((v) => String(v).includes('kept')).length);
    const pp = await readProofPanel(page);
    const restoredExec = pp.sections['Execute transaction'].rows['Hash'];
    c.observe('restoredExecuteHash', restoredExec);
    const s1Exec = JSON.parse(fs.readFileSync(join(RECEIPTS, 'execute.json'), 'utf8')).transactionHash;
    c.truthy('restored proof: execute hash == S1 execute receipt (from ledger logs)', String(restoredExec).toLowerCase() === s1Exec.toLowerCase(), String(restoredExec));
    c.observe('proofPanelRestored', pp);
    c.check('restored chain reads still solved', true, readRunCast(M, acc1).solved);
    await shot(page, 'chain-reload-restored-1440.png');
    await page.setViewportSize(MOBILE);
    await shot(page, 'chain-reload-restored-390.png');
    await page.setViewportSize(DESKTOP);
    return c.result({ account: acc1 });
  } finally {
    await context.close();
  }
}

export async function s2(browser, acc2) {
  const c = new Checks();
  const M = readManifest();
  const { context, page } = await openPage(browser, { wallet: { account: 2 } });
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await connectAndStart(page);
    c.check('startRun only after Start run', 1, await sentCount(page));
    c.observe('account', acc2);
    // only A
    await page.locator('#promise-A').check();
    await page.getByRole('button', { name: 'Preview exchange' }).click();
    await page.getByText('This exchange would not work').waitFor({ timeout: 60000 });
    const onlyA = await page.locator('section.chain-status').innerText();
    c.observe('onlyA_status', onlyA);
    c.truthy('only A: explanation names a promise', /\bB\b|promise|NPC B|B's/i.test(onlyA), onlyA.replace(/\n/g, ' | ').slice(0, 240));
    c.check('only A: no Execute deal', 0, await page.getByRole('button', { name: 'Execute deal' }).count());
    c.check('only A: sentTransactions only startRun', 1, await sentCount(page));
    c.check('only A: no execute tx in provider', 1, (await provider(page)).sent.length);
    await shot(page, 'chain-incomplete-A-1440.png');
    // only B
    await page.locator('#promise-A').uncheck();
    await page.locator('#promise-B').check();
    await page.getByRole('button', { name: 'Preview exchange' }).click();
    await page.getByText('This exchange would not work').waitFor({ timeout: 60000 });
    const onlyB = await page.locator('section.chain-status').innerText();
    c.observe('onlyB_status', onlyB);
    c.truthy('only B: explanation names a promise', /\bA\b|promise|NPC A|A's/i.test(onlyB), onlyB.replace(/\n/g, ' | ').slice(0, 240));
    c.check('only B: no Execute deal', 0, await page.getByRole('button', { name: 'Execute deal' }).count());
    c.check('only B: sentTransactions only startRun', 1, await sentCount(page));
    c.truthy('chain: run still unsolved', !readRunCast(M, acc2).solved, `runOf solved=${readRunCast(M, acc2).solved}`);
    return c.result({ account: acc2, onlyA: onlyA, onlyB: onlyB });
  } finally {
    await context.close();
  }
}

export async function s3(browser, accs) {
  const c = new Checks();
  const M = readManifest();
  const [a1, a3, a4, a5] = [accs[1], accs[3], accs[4], accs[5]];
  // Part 1: solved account 1 -> account 3 -> back to account 1
  let { context, page } = await openPage(browser, { wallet: { account: 1, preauth: true } });
  try {
    await page.goto(`${APP}/#/local/room/1`);
    await page.getByText(WIN_TEXT).first().waitFor({ timeout: 60000 });
    c.check('account 1 solved shown', 1, await page.getByText(WIN_TEXT).count());
    await page.evaluate(() => window.__nfTestProvider.setAccountIndex(3));
    await page.getByRole('button', { name: 'Start run' }).waitFor({ timeout: 60000 });
    c.check('after switch to account 3: no success text', 0, (await bodyText(page)).includes(WIN_TEXT) ? 1 : 0);
    c.check('after switch to account 3: Start run offered', 1, await page.getByRole('button', { name: 'Start run' }).count());
    c.check('account 3 has no run (cast owner)', ZERO_ADDR, readRunCast(M, a3).owner);
    await shot(page, 'chain-switch-account3-1440.png');
    await page.evaluate(() => window.__nfTestProvider.setAccountIndex(1));
    await page.getByText(WIN_TEXT).first().waitFor({ timeout: 60000 });
    c.check('switch back to account 1: solved result again', 1, await page.getByText(WIN_TEXT).count());
    c.check('switch back: still no send', 0, (await provider(page)).sent.length);
  } finally {
    await context.close();
  }

  // Part 2a: account 4 starts a run and previews; switching to account 5 must not send it
  let { context: ctx4, page: p4 } = await openPage(browser, { wallet: { account: 4 } });
  try {
    await p4.goto(`${APP}/#/local/room/1`);
    await connectAndStart(p4);
    await p4.locator("#promise-A").check();
    await p4.locator("#promise-B").check();
    await p4.getByRole("button", { name: "Preview exchange" }).click();
    await p4.locator("#review-title").waitFor({ timeout: 60000 });
    const sentBefore = (await provider(p4)).sent.length;
    c.check("preview-ready for account 4: sentTransactions = startRun only", 1, sentBefore);
    await p4.evaluate(() => window.__nfTestProvider.setAccountIndex(5));
    await p4.getByRole("button", { name: "Start run" }).waitFor({ timeout: 60000 });
    c.check("account 5 switch: no execute sent for account 4 preview", sentBefore, (await provider(p4)).sent.length);
    c.check("account 5: Execute deal not available", 0, await p4.getByRole("button", { name: "Execute deal" }).count());
    c.check("account 5: no run (cast owner)", ZERO_ADDR, readRunCast(M, a5).owner);
    c.check("account 4 still unsolved on chain", false, readRunCast(M, a4).solved);
    await shot(p4, "chain-switch-preview-1440.png");
  } finally {
    await ctx4.close();
  }

  // Part 2b (best effort): execute is pending (automine off) while the account changes, then a block is mined
  let ctxM, pm;
  ({ context: ctxM, page: pm } = await openPage(browser, { wallet: { account: 4 } }));
  let automineOff = false;
  try {
    await pm.goto(`${APP}/#/local/room/1`);
    await pm.getByRole("button", { name: "Connect wallet" }).click();
    await pm.locator("#promise-A").waitFor({ timeout: 60000 });
    await pm.locator("#promise-A").check();
    await pm.locator("#promise-B").check();
    await pm.getByRole("button", { name: "Preview exchange" }).click();
    await pm.locator("#review-title").waitFor({ timeout: 60000 });
    castMust(["rpc", "evm_setAutomine", "false", "--rpc-url", RPC], "evm_setAutomine false");
    automineOff = true;
    const before2b = (await provider(pm)).sent.length;
    await pm.getByRole("button", { name: "Execute deal" }).click();
    await pm.waitForFunction((n) => window.__nfTestProvider.sentTransactions.length > n, before2b, { timeout: 60000 }).catch(() => {});
    const sentPending = (await provider(pm)).sent.length;
    c.truthy("mid-op: execute sent for account 4 while automine is off", sentPending === before2b + 1, `sent ${before2b} -> ${sentPending}`);
    await pm.evaluate(() => window.__nfTestProvider.setAccountIndex(5));
    await pm.getByRole("button", { name: "Start run" }).waitFor({ timeout: 60000 });
    castMust(["rpc", "evm_mine", "--rpc-url", RPC], "evm_mine");
    await pm.waitForTimeout(3000);
    const body = await bodyText(pm);
    c.truthy("mid-op: invalidated-operation notice shown", body.includes("Your wallet account or network changed during the last operation"), body.includes("changed during the last") ? "shown" : "absent");
    c.check("mid-op: account 5 shows no success", false, body.includes(WIN_TEXT));
    c.check("mid-op: account 5 has no run on chain", ZERO_ADDR, readRunCast(M, a5).owner);
    c.observe("account4AfterMine", readRunCast(M, a4));
    await shot(pm, "chain-switch-midop-1440.png");
  } finally {
    if (automineOff) castRun(["rpc", "evm_setAutomine", "true", "--rpc-url", RPC]);
    await ctxM.close();
  }
  return c.result({ accounts: { a1, a3, a4, a5 }, note: "Part 2b is best-effort (automine off, block mined manually)." });
}
