// S9 production bundle scan and S10 demo mode regression (no blockchain requests).
import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP, LOGS, ROOT, Checks, bodyText, log, openPage, readManifest, shot } from './lib.mjs';

function grepCount(pattern, dir) {
  const r = spawnSync('grep', ['-rIlF', '--', pattern, dir], { encoding: 'utf8' });
  const hits = (r.stdout ?? '').trim() ? (r.stdout ?? '').trim().split('\n') : [];
  appendFileSync(join(LOGS, 'S9-grep.log'), `$ grep -rIlF -- ${JSON.stringify(pattern)} ${dir}\nEXIT=${r.status}\n${hits.join('\n')}\n`);
  return hits;
}

export async function s9() {
  const c = new Checks();
  const M = readManifest();
  const dist = join(ROOT, 'dist');
  const patterns = [
    '__nfTestProvider', '__NF_TEST', 'test-provider', 'ac0974bec39a17e3', 'mnemonic',
    M.coordinator, M.items, M.npcA, M.npcB, M.npcC, M.deployer, M.coordinator.toLowerCase(), M.items.toLowerCase(), M.npcA.toLowerCase(),
    M.npcB.toLowerCase(), M.npcC.toLowerCase(), M.deployTxHash, M.deployBlockHash,
  ];
  const results = {};
  for (const p of patterns) {
    const hits = grepCount(p, dist);
    results[p] = hits.map((h) => h.replace(`${ROOT}/`, ''));
    c.check(`dist does not contain ${p.length > 20 ? `${p.slice(0, 12)}…(${p.length} chars)` : p}`, 0, hits.length);
  }
  c.observe('distHits', results);
  // the error-message path is the only expected mention
  const pathHits = grepCount('local-anvil.json', dist);
  c.observe('localAnvilJsonMentionsInDist', pathHits.map((h) => h.replace(`${ROOT}/`, '')));
  log(`  info: "local-anvil.json" mentioned in ${pathHits.length} dist file(s) (error message text, see report)`);
  const srcTest = spawnSync('grep', ['-rIlE', 'test-provider|__nfTestProvider|__NF_TEST', join(ROOT, 'src')], { encoding: 'utf8' });
  c.check('src/ does not reference the test provider', '', (srcTest.stdout ?? '').trim());
  const srcAbiAddr = spawnSync('grep', ['-rIlE', '0x603e1bd79259ebcbaaed0c83eec09ca0b89a5bcc', join(ROOT, 'src')], { encoding: 'utf8' });
  c.check('src/ contains no manifest coordinator address', '', (srcAbiAddr.stdout ?? '').trim());
  return c.result({ note: 'Scan of dist/ built by `npx vite build` (EXIT recorded in logs).' });
}

export async function s10(browser) {
  const c = new Checks();
  const { context, page, requests } = await openPage(browser, { wallet: null, trackRequests: true });
  try {
    await page.goto(`${APP}/#/`);
    await page.getByText('Blockchain execution is not implemented yet').first().waitFor({ timeout: 30000 });
    c.check('demo rooms #/: "Blockchain execution is not implemented yet" present', true, (await bodyText(page)).includes('Blockchain execution is not implemented yet'));
    await page.goto(`${APP}/#/room/1`);
    const notice = page.getByText('Design preview · No blockchain connected', { exact: true }).first();
    await notice.waitFor({ timeout: 30000 });
    c.check('demo notice exact text', 'Design preview · No blockchain connected', (await notice.textContent()).trim());
    c.check('demo: no Local chain provider present', 'undefined', await page.evaluate(() => typeof window.ethereum));
    await page.locator('#promise-A').check();
    await page.locator('#promise-B').check();
    await page.getByRole('button', { name: 'Preview exchange' }).click();
    await page.getByRole('button', { name: 'Run demo exchange' }).waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Run demo exchange' }).click();
    await page.locator('p.result__disclaimer', { hasText: 'Simulated result. No blockchain transaction was sent.' }).waitFor({ timeout: 30000 });
    const body = await bodyText(page);
    c.check('demo result text', true, body.includes('Simulated result. No blockchain transaction was sent.'));
    c.check('demo result: Everyone kept their promise.', true, body.includes('Everyone kept their promise.'));
    const modeLink = page.getByRole('link', { name: 'Local chain' });
    c.check('mode switch offers Local chain link', 1, await modeLink.count());
    c.check('Local chain link target', '#/local/room/1', await modeLink.first().getAttribute('href'));
    await shot(page, 'demo-result-1440.png');
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.getByRole('button', { name: 'Preview exchange' }).waitFor({ timeout: 30000 });
    c.check('Reset demo returns to the selection (no simulated result)', false, (await bodyText(page)).includes('Simulated result.'));
    const chainReq = requests.filter((u) => u.includes('127.0.0.1:8545'));
    c.check('no requests to 127.0.0.1:8545 during demo flow', 0, chainReq.length);
    c.observe('requestCount', requests.length);
    c.observe('requestsSample', requests.filter((u) => !u.includes('/assets/')).slice(0, 12));
    return c.result({ demoRequests: requests.length, rpcRequests: chainReq.length });
  } finally {
    await context.close();
  }
}
