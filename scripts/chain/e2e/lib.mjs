// Shared helpers for the stage-3 browser E2E (Local chain mode). E2E tooling only.
// Chain reads go through the pinned cast binary (logged); browser control via playwright-core (channel chrome).
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..', '..');
export const EVID = join(ROOT, 'evidence', 'stage3');
export const LOGS = join(EVID, 'logs');
export const SHOTS = join(EVID, 'screenshots');
export const RECEIPTS = join(EVID, 'receipts');
export const CAST = join(ROOT, 'contracts', '.tools', 'bin', 'cast');
export const MANIFEST_FILE = join(ROOT, 'contracts', 'deployments', 'local-anvil.json');
export const PROVIDER_JS = join(ROOT, 'scripts', 'chain', 'test-provider.js');
export const RESULTS_FILE = join(EVID, 'e2e-results.json');
export const RPC = 'http://127.0.0.1:8545';
export const APP = 'http://127.0.0.1:4173';
export const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
export const ZERO_ADDR = `0x${'0'.repeat(40)}`;
export const DESKTOP = { width: 1440, height: 900 };
export const MOBILE = { width: 390, height: 844 };

export function ensureDirs() {
  for (const d of [LOGS, SHOTS, RECEIPTS]) mkdirSync(d, { recursive: true });
}

/** A full run (no scenario list) starts from empty run logs and an empty results file. */
export function resetRunArtifacts() {
  for (const f of ['cast-commands.log', 'S8-1-stop.log', 'S8-2-start.log', 'S8-3-deploy.log', 'S9-grep.log']) {
    writeFileSync(join(LOGS, f), '');
  }
  writeFileSync(RESULTS_FILE, `${JSON.stringify({ generatedBy: 'scripts/chain/e2e/run.mjs', scenarios: {} }, null, 2)}\n`);
}

export function log(msg) {
  process.stdout.write(`${msg}\n`);
}

/** Runs cast with the pinned binary; every command and its exit code go to logs/cast-commands.log. */
export function castRun(args) {
  const r = spawnSync(CAST, args, { encoding: 'utf8', timeout: 120000 });
  const code = r.status ?? -1;
  const out = (r.stdout ?? '').trim();
  const err = (r.stderr ?? '').trim();
  const short = (s) => (s.length > 300 ? `${s.slice(0, 300)}...(${s.length} chars)` : s);
  appendFileSync(
    join(LOGS, 'cast-commands.log'),
    `$ cast ${args.join(' ')}\n  EXIT=${code}${out ? `\n  stdout: ${short(out)}` : ''}${err ? `\n  stderr: ${short(err)}` : ''}\n`,
  );
  return { code, out, err, cmd: `cast ${args.join(' ')}` };
}

export function castMust(args, what) {
  const r = castRun(args);
  if (r.code !== 0) throw new Error(`${what}: cast exit ${r.code}: ${r.err}`);
  return r.out;
}

export function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));
}

/** Chain reads (cast) for a player account. runId = uint256(uint160(account)). */
export function runIdOf(account) {
  return BigInt(account).toString();
}

export function readRunCast(m, account) {
  const lines = castMust(
    ['call', m.coordinator, 'runOf(uint256)(address,bool,bool,uint64)', runIdOf(account), '--rpc-url', RPC],
    'runOf',
  )
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { owner: lines[0].toLowerCase(), active: lines[1] === 'true', solved: lines[2] === 'true', nonce: lines[3] };
}

export function parseBalances(text) {
  return text
    .replace(/[[\]]/g, '')
    .split(',')
    .map((s) => BigInt(s.trim().split(' ')[0]).toString());
}

export function readBalancesCast(m, account) {
  return parseBalances(
    castMust(['call', m.items, 'snapshotBalances(uint256)(uint256[6])', runIdOf(account), '--rpc-url', RPC], 'snapshotBalances'),
  );
}

export function readSnapshotCast(m, account) {
  return castMust(
    ['call', m.coordinator, 'currentSnapshotHash(uint256)(bytes32)', runIdOf(account), '--rpc-url', RPC],
    'currentSnapshotHash',
  ).toLowerCase();
}

export function readReceiptCast(hash, file) {
  const r = castRun(['receipt', hash, '--json', '--rpc-url', RPC]);
  if (r.code !== 0) return { code: r.code, json: null };
  const json = JSON.parse(r.out);
  if (file) writeFileSync(join(RECEIPTS, file), `${JSON.stringify(json, null, 2)}\n`);
  return { code: 0, json };
}

/** topic0 for the event signatures of the contracts (computed offline by cast sig-event). */
const EVENT_SIGS = [
  'RunStarted(uint256,address)',
  'InitialGranted(uint256)',
  'PermitIssued(uint256,uint8,bytes32,bytes32,bytes32)',
  'PermitConsumed(uint256,uint8,bytes32)',
  'ItemMoved(uint256,uint8,uint8,uint8,uint32)',
  'LevelSolved(uint256,address,uint64,bytes32,bytes32)',
];
let topicMap = null;
export function eventNameByTopic(topic0) {
  if (!topicMap) {
    topicMap = {};
    for (const sig of EVENT_SIGS) {
      const h = castMust(['sig-event', sig], `sig-event ${sig}`).toLowerCase();
      topicMap[h] = sig.split('(')[0];
    }
  }
  return topicMap[String(topic0).toLowerCase()] ?? `unknown(${topic0})`;
}

export function decodedEventNames(receiptJson) {
  return (receiptJson.logs ?? []).map((l) => eventNameByTopic(l.topics[0]));
}

// ---------- results ----------
export function loadResults() {
  if (!existsSync(RESULTS_FILE)) return {};
  return JSON.parse(readFileSync(RESULTS_FILE, 'utf8')).scenarios ?? {};
}

export function saveResult(id, entry) {
  const all = loadResults();
  all[id] = { ...entry, recordedAt: new Date().toISOString() };
  writeFileSync(RESULTS_FILE, `${JSON.stringify({ generatedBy: 'scripts/chain/e2e/run.mjs', scenarios: all }, null, 2)}\n`);
}

/** Collects checks; status is PASS only when every check passed. */
export class Checks {
  constructor() {
    this.items = [];
    this.observed = {};
  }
  check(name, expected, actual) {
    const e = typeof expected === 'string' ? expected : JSON.stringify(expected);
    const a = typeof actual === 'string' ? actual : JSON.stringify(actual);
    const ok = e === a;
    this.items.push({ name, ok, expected: e, actual: a });
    log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}: expected ${e} | actual ${a}`);
    return ok;
  }
  truthy(name, cond, detail = '') {
    this.items.push({ name, ok: Boolean(cond), expected: 'true', actual: String(Boolean(cond)), detail });
    log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ` (${detail})` : ''}`);
    return Boolean(cond);
  }
  observe(key, value) {
    this.observed[key] = value;
  }
  status() {
    return this.items.every((c) => c.ok) ? 'PASS' : 'FAIL';
  }
  result(extra = {}) {
    return { status: this.status(), checks: this.items, observed: this.observed, ...extra };
  }
}

// ---------- browser ----------
export async function launchBrowser() {
  return chromium.launch({ channel: 'chrome', headless: true });
}

/** Account pinning: wraps request() so every call waits until the test provider switched to `index`. */
export function accountInitScript(index) {
  return `(function () {
  var p = window.ethereum;
  if (!p || !window.__nfTestProvider) { window.__NF_TEST_INIT_ERROR = 'provider missing'; return; }
  var ready = window.__nfTestProvider.setAccountIndex(${index}).catch(function (e) {
    window.__NF_TEST_INIT_ERROR = String((e && e.message) || e);
  });
  var orig = p.request.bind(p);
  p.request = function (args) { return ready.then(function () { return orig(args); }); };
})();`;
}

/**
 * New context + page for one scenario. Provider only when `wallet` is true.
 * wallet: { account?: number, preauth?: boolean }
 */
export async function openPage(browser, { wallet = null, viewport = DESKTOP, trackRequests = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const requests = [];
  if (wallet) {
    await context.addInitScript(`window.__NF_TEST_RPC = ${JSON.stringify(RPC)};${wallet.preauth ? ' window.__NF_TEST_PREAUTH = true;' : ''}`);
    await context.addInitScript({ path: PROVIDER_JS });
    if (wallet.account !== undefined) await context.addInitScript(accountInitScript(wallet.account));
  }
  const page = await context.newPage();
  if (trackRequests) page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => requests.push(`PAGEERROR ${e.message}`));
  return { context, page, requests };
}

export async function provider(page) {
  return page.evaluate(() => {
    const h = window.__nfTestProvider;
    return {
      sent: [...h.sentTransactions],
      requests: [...h.requestLog],
      state: h.getState(),
      initError: window.__NF_TEST_INIT_ERROR ?? null,
    };
  });
}

export async function sentCount(page) {
  return (await provider(page)).sent.length;
}

/** Viewport capture after scrolling `target` into view; CSS animations disabled (no fullPage duplication). */
export async function shotAt(page, name, target) {
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, name), animations: 'disabled' });
  log(`  screenshot ${name} (viewport at target)`);
  return name;
}

export async function shot(page, name) {
  const path = join(SHOTS, name);
  await page.screenshot({ path, fullPage: true });
  log(`  screenshot ${name}`);
  return name;
}

/** Visible text of the main content (for "must not contain" checks). */
export async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

/** Proof panel values, grouped as shown on screen. */
export async function readProofPanel(page) {
  return page.evaluate(() => {
    document.querySelectorAll('details.proof').forEach((d) => (d.open = true));
    const rowsOf = (el) => {
      const out = {};
      el.querySelectorAll(':scope > dl > .proof__row, :scope > .proof__row').forEach((row) => {
        out[row.querySelector('dt').textContent.trim()] = row.querySelector('dd').textContent.trim();
      });
      return out;
    };
    const top = document.querySelector('details.proof .proof__body > dl.proof__list');
    const sections = {};
    document.querySelectorAll('details.proof section.proof__section').forEach((sec) => {
      const title = sec.querySelector('h3').textContent.trim();
      const events = [...sec.querySelectorAll('ol.proof__events li code')].map((c) => c.textContent.trim());
      sections[title] = { rows: rowsOf(sec), events };
    });
    return { top: top ? rowsOf(top) : {}, sections };
  });
}

export function sameAddr(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}
