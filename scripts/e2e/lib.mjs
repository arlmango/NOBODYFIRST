// Shared helpers, copy and locators for scripts/e2e/run.mjs. No test flows here.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const here = dirname(fileURLToPath(import.meta.url));
export const SHOTS = resolve(here, '../../docs/screenshots');
export const VIEWPORTS = [390, 768, 1440];

// Copy taken from src/components/DemoNotice.tsx, src/demo/format.ts, src/screens/LevelOne.tsx.
export const NOTICE = 'Design preview · No blockchain connected';
export const PROMPT = 'Select both promises to preview the exchange.';
export const MISSING_A = "B has not promised 1 coin to A, so A's key would not move.";
export const MISSING_B = "A has not promised 1 key to B, so B's coin would not move.";
export const TOGETHER = 'Both transfers happen together, or neither happens.';
export const SIM = 'Simulated result. No blockchain transaction was sent.';

export const results = [];

export function record(id, name, pass, detail = '') {
  results.push({ id, name, pass: Boolean(pass), detail });
  const suffix = !pass && detail ? ` - ${detail}` : '';
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${name}${suffix}`);
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function check(id, name, fn) {
  try {
    await fn();
    record(id, name, true);
  } catch (err) {
    record(id, name, false, err instanceof Error ? err.message.split('\n')[0] : String(err));
  }
}

// A flow that throws is reported as a single FAIL; its inner checks are reported separately.
export async function runFlow(name, fn) {
  try {
    await fn();
  } catch (err) {
    record(`flow:${name}`, `Flow "${name}" ran to completion`, false, err instanceof Error ? err.message.split('\n')[0] : String(err));
  }
}

export const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

export function trackErrors(page, errors) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    // Ignore favicon 404s only; any other failed resource or console error counts.
    if (msg.type() === 'error' && !(msg.location().url ?? '').includes('favicon')) {
      errors.push(`console: ${msg.text()}`);
    }
  });
}

export async function visible(locator) {
  await locator.first().waitFor({ state: 'visible', timeout: 5000 });
}

export async function absent(locator) {
  const count = await locator.count();
  assert(count === 0, `expected no matches, found ${count}`);
}

// Wait for CSS animations (the 180ms level-reveal fade) so screenshots are not taken mid-fade.
export async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
}

export async function assertNoOverflow(page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  assert(sw <= cw, `horizontal overflow: scrollWidth ${sw} > clientWidth ${cw}`);
}

// Locators. Roles and accessible names come from the real components.
export const roomsHeading = (page) => page.getByRole('heading', { level: 1, name: 'Three rooms. One rule.' });
export const levelHeading = (page) => page.getByRole('heading', { level: 1, name: 'You First' });
export const enterRoomButton = (page) => page.getByRole('button', { name: 'Enter room' });
export const checkbox = (page, person) => page.getByRole('checkbox', { name: `${person}: Select promise` });
export const previewButton = (page) => page.getByRole('button', { name: 'Preview exchange' });
export const runButton = (page) => page.getByRole('button', { name: 'Run demo exchange' });
export const resetButton = (page) => page.getByRole('button', { name: 'Reset demo' });
export const reviewHeading = (page) => page.getByRole('heading', { name: 'Review your exchange' });
// The result screen's single h1 (ExchangeResult.tsx). The level h1 "You First" is not rendered there.
export const resultHeading = (page) => page.getByRole('heading', { level: 1, name: 'Everyone kept their promise.' });
export const reasonText = (page, text) => page.locator('#exchange-reason').getByText(text, { exact: true });
export const noticeText = (page) => page.getByText(NOTICE, { exact: true });

export async function openRooms(page) {
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await visible(roomsHeading(page));
}

export async function enterRoom(page) {
  await enterRoomButton(page).click();
  await visible(levelHeading(page));
}

export async function selectBoth(page) {
  await checkbox(page, 'A').check();
  await checkbox(page, 'B').check();
}

export async function previewAndRun(page) {
  await selectBoth(page);
  await previewButton(page).click();
  await visible(reviewHeading(page));
  await runButton(page).click();
  await visible(resultHeading(page));
}

export async function resultHoldings(page, person) {
  const li = page.locator('li.result__person', {
    has: page.getByRole('heading', { name: new RegExp(`^${person}(\\s|$)`) }),
  });
  const holdings = li.locator('.holding');
  return {
    before: norm(await holdings.nth(0).textContent()),
    after: norm(await holdings.nth(1).textContent()),
    text: norm(await li.textContent()),
  };
}

// localStorage / sessionStorage entry counts (-1 if storage access throws).
export async function storageSizes(page) {
  return page.evaluate(() => {
    try {
      return { local: localStorage.length, session: sessionStorage.length };
    } catch (err) {
      return { local: -1, session: -1, error: String(err) };
    }
  });
}

export async function holdingOnBoard(page, person) {
  return norm(await page.locator(`.person--${person} .person__has`).textContent());
}

// Keyboard helpers: press Tab until the focused element matches, then report focus styling.
export async function tabUntil(page, target, label, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((spec) => {
      const el = document.activeElement;
      if (!el) return false;
      if (spec.id) return el.id === spec.id;
      return (el.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(spec.text);
    }, target);
    if (hit) return label;
  }
  throw new Error(`Tab order never reached "${label}" within ${max} presses`);
}

export async function focusStyle(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { ok: false, id: 'body' };
    const cs = getComputedStyle(el);
    const focusVisible = el.matches(':focus-visible');
    const outlined = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    return { ok: focusVisible && outlined, id: el.id || el.tagName.toLowerCase(), focusVisible, outlined };
  });
}

