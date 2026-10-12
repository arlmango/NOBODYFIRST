// Browser verification of the public demo at <baseUrl>. Uses playwright-core with the installed
// Chrome (channel 'chrome'), a fresh context per scenario and no auth state.
// Usage: node scripts/public/verify-site.mjs <baseUrl> [--out <dir>] [--label <name>]
// Writes <out>/results.json and screenshots. Exit 1 on any failed check.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOTICE = 'Interactive demo · No blockchain transaction is sent.';
const DESCRIPTION =
  'Play the first level in your browser. The Solidity prototype has been tested locally; public testnet play is not available yet.';
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
];

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const baseArg = args[0];
if (!baseArg || !/^https?:\/\//.test(baseArg)) {
  console.error('usage: node scripts/public/verify-site.mjs <baseUrl> [--out <dir>] [--label <name>]');
  process.exit(2);
}
const BASE = baseArg.replace(/\/+$/, '');
const BASE_URL = new URL(BASE);
const label = opt('--label') ?? BASE_URL.host.replace(/[^A-Za-z0-9]+/g, '-');
const OUT = resolve(opt('--out') ?? join(ROOT, 'evidence', 'stage4', `screenshots-${label}`));
await mkdir(OUT, { recursive: true });

const report = {
  base: BASE,
  label,
  startedAt: new Date().toISOString(),
  checks: [],
  requests: [],
  documents: [],
  consoleMessages: [],
  pageErrors: [],
  badResponses: [],
  failedRequests: [],
  screenshots: [],
};
const seenRequests = new Set();
let failures = 0;

function check(name, ok, detail) {
  if (!ok) failures++;
  report.checks.push({ name, ok: !!ok, detail: detail ?? null });
  const extra = detail === undefined || ok ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra}`);
}

const vis = (locator) => locator.filter({ visible: true }).first();
const bodyText = (page) => page.innerText('body');

function attach(context, scope) {
  context.on('request', (r) => {
    const key = `${r.method()} ${r.resourceType()} ${r.url()}`;
    if (!seenRequests.has(key)) {
      seenRequests.add(key);
      report.requests.push({ scope, method: r.method(), type: r.resourceType(), url: r.url() });
    }
  });
  context.on('requestfailed', (r) => report.failedRequests.push({ scope, url: r.url(), error: r.failure()?.errorText }));
  context.on('response', (resp) => {
    if (resp.status() >= 400) report.badResponses.push({ scope, url: resp.url(), status: resp.status() });
  });
}

async function newPage(browser, vp, scope) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    colorScheme: 'light',
    serviceWorkers: 'block',
    acceptDownloads: false,
  });
  attach(context, scope);
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`[csp] ${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      report.consoleMessages.push({ scope, type: m.type(), text: m.text(), location: m.location()?.url ?? null });
    }
  });
  page.on('pageerror', (e) => report.pageErrors.push({ scope, message: e.message }));
  return { context, page };
}

async function gotoDoc(page, url, scope) {
  const resp = await page.goto(url, { waitUntil: 'load' });
  let redirects = 0;
  let req = resp?.request();
  while (req?.redirectedFrom()) {
    redirects++;
    req = req.redirectedFrom();
  }
  const headers = resp ? await resp.allHeaders() : {};
  const doc = {
    scope,
    url,
    status: resp?.status() ?? null,
    finalUrl: page.url(),
    redirects,
    title: await page.title(),
    csp: headers['content-security-policy'] ?? null,
  };
  report.documents.push(doc);
  check(
    `${scope}: ${url} served 200, no redirect, same host`,
    doc.status === 200 && redirects === 0 && new URL(doc.finalUrl).host === BASE_URL.host,
    doc,
  );
  // The app sets a per-route title ("Room 01 · … — NOBODY FIRST"); the root document must be exact.
  const titleOk = url === `${BASE}/` ? doc.title === 'NOBODY FIRST' : doc.title.endsWith('NOBODY FIRST');
  check(`${scope}: title is NOBODY FIRST`, titleOk, doc.title);
  check(`${scope}: CSP header on document`, !!doc.csp && doc.csp.includes("default-src 'self'"), doc.csp);
  return doc;
}

async function layoutChecks(page, scope) {
  const ov = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(`${scope}: no horizontal overflow`, ov.scrollWidth <= ov.clientWidth + 1, ov);
  const imgs = await page.evaluate(async () => {
    const list = [...document.images];
    await Promise.all(
      list.map((img) =>
        img.complete
          ? null
          : new Promise((res) => {
              img.addEventListener('load', res);
              img.addEventListener('error', res);
              setTimeout(res, 5000);
            }),
      ),
    );
    return list.map((i) => ({ src: (i.currentSrc || i.src).slice(0, 160), ok: i.complete && i.naturalWidth > 0 }));
  });
  const bad = imgs.filter((i) => !i.ok);
  check(`${scope}: all ${imgs.length} images loaded`, bad.length === 0, bad);
}

async function shot(page, vp, name) {
  const path = join(OUT, `${vp.name}-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push(path);
}

async function journey(browser, vp) {
  const scope = `journey@${vp.name}`;
  const { context, page } = await newPage(browser, vp, scope);
  try {
    await gotoDoc(page, `${BASE}/`, scope);
    await vis(page.getByText('Enter room')).waitFor({ state: 'visible' });
    let text = await bodyText(page);
    check(`${scope} rooms: exact notice`, text.includes(NOTICE));
    check(`${scope} rooms: description paragraph`, text.includes(DESCRIPTION));
    const coming = (text.match(/Coming soon/g) ?? []).length;
    check(`${scope} rooms: rooms 02 and 03 'Coming soon'`, coming >= 2, coming);
    check(`${scope} rooms: no 'Complete Room'`, !/Complete Room/.test(text));
    check(`${scope} rooms: no 'Connect wallet'`, !/Connect wallet/i.test(text));
    const localLinks =
      (await page.locator('a[href*="local"]').count()) + (await page.getByRole('link', { name: /local chain/i }).count());
    check(`${scope} rooms: no ModeSwitch / 'Local chain' link`, localLinks === 0, localLinks);
    await shot(page, vp, 'rooms');
    await layoutChecks(page, `${scope} rooms`);

    await vis(page.getByText('Enter room')).click();
    const boxes = page.getByRole('checkbox', { name: /Select promise/ });
    await vis(boxes).waitFor({ state: 'visible' });
    check(`${scope} level: opened at #/room/1`, page.url().includes('#/room/1'), page.url());
    const boxCount = await boxes.count();
    check(`${scope} level: two 'Select promise' checkboxes`, boxCount >= 2, boxCount);
    await shot(page, vp, 'level');
    await layoutChecks(page, `${scope} level`);

    for (let i = 0; i < boxCount; i++) await boxes.nth(i).check();
    let checked = 0;
    for (let i = 0; i < boxCount; i++) if (await boxes.nth(i).isChecked()) checked++;
    check(`${scope} level: both promises selected`, checked === boxCount && boxCount >= 2, { checked, boxCount });

    await vis(page.getByRole('button', { name: /Preview exchange/ })).click();
    await vis(page.getByRole('button', { name: /Run demo exchange/ })).waitFor({ state: 'visible' });
    await shot(page, vp, 'review');
    await layoutChecks(page, `${scope} review`);

    await vis(page.getByRole('button', { name: /Run demo exchange/ })).click();
    await vis(page.getByText('Everyone kept their promise.')).waitFor({ state: 'visible' });
    text = await bodyText(page);
    check(`${scope} result: simulated disclaimer`, text.includes('Simulated result. No blockchain transaction was sent.'));
    check(`${scope} result: 'Everyone kept their promise.'`, text.includes('Everyone kept their promise.'));
    check(`${scope} result: no 'Preview Room 02'`, !text.includes('Preview Room 02'));
    const nextButtons =
      (await page.getByRole('button', { name: /next/i }).filter({ visible: true }).count()) +
      (await page.getByRole('link', { name: /next/i }).filter({ visible: true }).count());
    check(`${scope} result: no next-level control`, nextButtons === 0, nextButtons);
    await shot(page, vp, 'result');
    await layoutChecks(page, `${scope} result`);

    // In the demo, 'Back to rooms' is a link on the result view (not on the board).
    const back = vis(page.getByText('Back to rooms'));
    check(`${scope} 'Back to rooms' visible on result`, (await back.count()) > 0);
    await back.click();
    await vis(page.getByText('Enter room')).waitFor({ state: 'visible' });
    check(`${scope} back to rooms`, !page.url().includes('#/room/1'), page.url());

    // Re-enter level 1: a fresh board. Select one promise, then Reset demo returns to the initial board.
    await vis(page.getByText('Enter room')).click();
    const boxes2 = page.getByRole('checkbox', { name: /Select promise/ });
    await vis(boxes2).waitFor({ state: 'visible' });
    await boxes2.first().check();
    await vis(page.getByRole('button', { name: /Reset demo/ })).click();
    await vis(page.getByRole('button', { name: /Preview exchange/ })).waitFor({ state: 'visible' });
    let checkedAfterReset = 0;
    for (let i = 0; i < (await boxes2.count()); i++) if (await boxes2.nth(i).isChecked()) checkedAfterReset++;
    check(`${scope} reset: initial board (no promise selected)`, checkedAfterReset === 0, checkedAfterReset);
    check(`${scope} reset: no result shown`, !(await bodyText(page)).includes('Everyone kept their promise.'));

    // Return to rooms through the header brand link for the reload step.
    await page.locator('a.site-header__brand').first().click();
    await vis(page.getByText('Enter room')).waitFor({ state: 'visible' });
    check(`${scope} header brand returns to rooms`, true);

    // Reload on #/room/1: the page must keep working; state resets by design.
    await page.goto(`${BASE}/#/room/1`);
    await vis(boxes).waitFor({ state: 'visible' });
    await page.reload({ waitUntil: 'load' });
    await vis(boxes).waitFor({ state: 'visible' });
    check(`${scope} reload on #/room/1 renders level`, true);
    await layoutChecks(page, `${scope} reload`);
  } catch (err) {
    check(`${scope} journey completed`, false, String(err?.message ?? err).split('\n')[0]);
  } finally {
    await context.close();
  }
}

async function direct(browser, vp) {
  const cases = [
    {
      name: 'direct #/room/1',
      url: `${BASE}/#/room/1`,
      ready: (page) => vis(page.getByRole('checkbox', { name: /Select promise/ })),
    },
    {
      name: 'direct #/local/room/1',
      url: `${BASE}/#/local/room/1`,
      ready: (page) => vis(page.getByText('Local chain mode is not part of the public demo.')),
    },
    {
      name: 'direct #/local',
      url: `${BASE}/#/local`,
      ready: (page) => page.locator('#root > *').first(),
    },
    {
      name: 'plain path /room/1',
      url: `${BASE}/room/1`,
      ready: (page) => vis(page.getByText('Enter room')),
    },
    {
      name: 'unknown path',
      url: `${BASE}/does-not-exist`,
      ready: (page) => vis(page.getByText('Enter room')),
    },
  ];
  for (const c of cases) {
    const scope = `${c.name}@${vp.name}`;
    const { context, page } = await newPage(browser, vp, scope);
    try {
      await gotoDoc(page, c.url, scope);
      await c.ready(page).waitFor({ state: 'attached' });
      const text = await bodyText(page);
      check(`${scope}: app rendered`, text.trim().length > 0);
      if (c.name === 'direct #/local/room/1') {
        check(`${scope}: explanation text`, text.includes('Local chain mode is not part of the public demo.'));
      }
      if (c.name === 'unknown path' || c.name === 'plain path /room/1') {
        check(`${scope}: not an error page`, !/\b404\b|page not found/i.test(text));
      }
      await layoutChecks(page, scope);
    } catch (err) {
      check(`${scope} completed`, false, String(err?.message ?? err).split('\n')[0]);
    } finally {
      await context.close();
    }
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const vp of VIEWPORTS) {
    await journey(browser, vp);
    await direct(browser, vp);
  }
} finally {
  await browser.close();
}

// Whole-run checks.
const external = [];
const localHits = [];
for (const r of report.requests) {
  const u = new URL(r.url);
  if (u.protocol === 'data:' || u.protocol === 'blob:') continue;
  if (u.origin !== BASE_URL.origin) external.push(`${r.type} ${r.url}`);
  if (u.port === '8545' || (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && u.origin !== BASE_URL.origin)) {
    localHits.push(`${r.type} ${r.url}`);
  }
}
check(`requests: ${report.requests.length} unique, all same-origin`, external.length === 0, external);
check('requests: none to localhost / 127.0.0.1 / :8545 other than the served origin', localHits.length === 0, localHits);
check('console: no errors or warnings (incl. CSP reports)', report.consoleMessages.length === 0, report.consoleMessages);
check('page errors: none', report.pageErrors.length === 0, report.pageErrors);
check('responses: none >= 400', report.badResponses.length === 0, report.badResponses);
check('requests: none failed', report.failedRequests.length === 0, report.failedRequests);

report.finishedAt = new Date().toISOString();
report.failures = failures;
report.exit = failures ? 1 : 0;
await writeFile(join(OUT, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n${report.checks.length - failures}/${report.checks.length} checks passed; results: ${join(OUT, 'results.json')}`);
console.log(`EXIT ${report.exit}`);
process.exitCode = report.exit;
