// Browser checks for the NOBODY FIRST stage-1 design preview.
//
// Usage (after `npm run build` and with `npm run preview` serving dist on 4173):
//   node scripts/e2e/run.mjs
//   BASE_URL=http://127.0.0.1:5173 node scripts/e2e/run.mjs
//
// Needs Google Chrome installed (launched with channel 'chrome').
// Exits 1 if any check fails. Helpers and copy strings live in ./lib.mjs.

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import {
  flowMenu,
  flowResizeFocus,
  flowWideHeader,
  flowRoom2Art,
  flowRegressions,
  flowResultIcons,
  flowTerms768,
} from './flows-extra.mjs';
import { flowAssets, flowShots2x } from './flows-assets.mjs';
import { flowObserverRatio, flowRoom2Scale, flowRoom2Grow } from './flows-geometry.mjs';
import {
  BASE_URL, MISSING_A, MISSING_B, NOTICE, PROMPT, SHOTS, SIM, TOGETHER, VIEWPORTS, absent, assert, assertNoOverflow, check, checkbox, enterRoom, enterRoomButton, focusStyle,holdingOnBoard, levelHeading, norm, noticeText, openRooms, previewAndRun, previewButton, reasonText, record, resetButton, resultHeading, resultHoldings, results, reviewHeading, roomsHeading, runButton, runFlow, selectBoth, settle, storageSizes, tabUntil, trackErrors, visible,
} from './lib.mjs';

async function flowMouse(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  try {
    await check('i-rooms', 'Design preview notice on rooms', async () => {
      await openRooms(page);
      await visible(noticeText(page));
    });

    await check('a', 'Enter room opens Level 1 at #/room/1', async () => {
      await enterRoom(page);
      assert(new URL(page.url()).hash === '#/room/1', `hash is ${new URL(page.url()).hash}`);
      await visible(page.getByText('LEVEL 01', { exact: true }));
    });

    await check('i-level', 'Design preview notice on Level 1', async () => {
      await visible(noticeText(page));
    });

    await check('b', 'Empty selection explains and blocks preview', async () => {
      await visible(reasonText(page, PROMPT));
      const button = previewButton(page);
      assert((await button.getAttribute('aria-disabled')) === 'true', 'Preview is not aria-disabled');
      // force: Playwright waits on aria-disabled elements; the point is that the click does nothing.
      await button.click({ force: true });
      await page.waitForTimeout(200);
      await absent(reviewHeading(page));
      await absent(runButton(page));
      await absent(resultHeading(page));
    });

    await check('c-a-only', 'Only A selected: names the missing promise from B', async () => {
      await checkbox(page, 'A').check();
      await visible(reasonText(page, MISSING_A));
    });

    await check('c-b-only', 'Only B selected: names the missing promise from A', async () => {
      await checkbox(page, 'A').uncheck();
      await checkbox(page, 'B').check();
      await visible(reasonText(page, MISSING_B));
      await checkbox(page, 'B').uncheck();
    });

    await check('a-run-guard', 'Run demo exchange is not rendered before Preview', async () => {
      await absent(runButton(page));
      await checkbox(page, 'A').check();
      await checkbox(page, 'B').check();
      await absent(runButton(page));
      await absent(reviewHeading(page));
    });

    await check('d-select', 'Both selected: complete state, preview enabled', async () => {
      await visible(reasonText(page, TOGETHER));
      assert((await previewButton(page).getAttribute('aria-disabled')) === null, 'Preview still aria-disabled');
    });

    await check('d-preview', 'Preview shows the review section with transfers', async () => {
      await previewButton(page).click();
      await visible(reviewHeading(page));
      const transfers = (await page.locator('.review__transfers li').allTextContents()).map(norm);
      assert(transfers.includes('A → B: 1 key'), `transfers: ${transfers.join(' | ')}`);
      assert(transfers.includes('B → A: 1 coin'), `transfers: ${transfers.join(' | ')}`);
    });

    await check('d-run', 'Run shows result: A has 1 coin, B has 1 key, C unchanged', async () => {
      await runButton(page).click();
      await visible(resultHeading(page));
      await visible(page.locator('section.result').getByText(SIM, { exact: true }));
      const a = await resultHoldings(page, 'A');
      const b = await resultHoldings(page, 'B');
      const c = await resultHoldings(page, 'C');
      assert(a.after === '1 coin', `A after is "${a.after}"`);
      assert(b.after === '1 key', `B after is "${b.after}"`);
      assert(c.before === 'empty' && c.after === 'empty', `C is "${c.before}" -> "${c.after}"`);
      assert(c.text.includes('Unchanged.'), 'C is not marked Unchanged.');
      await absent(levelHeading(page));
      await absent(page.getByText('LEVEL 01', { exact: true }));
      await visible(page.getByText('Room 01 — You First', { exact: true }));
      await visible(page.getByText('Transaction details', { exact: true }));
      await visible(page.getByText('Unavailable in design preview', { exact: true }));
      await absent(page.getByText('Preview Room 02'));
    });

    await check('f-storage', 'localStorage and sessionStorage are empty after a full exchange', async () => {
      const sizes = await storageSizes(page);
      assert(sizes.local === 0 && sizes.session === 0, `localStorage=${sizes.local} sessionStorage=${sizes.session}`);
    });

    await check('i-result', 'Design preview notice on result', async () => {
      await visible(noticeText(page));
    });

    await check('h', 'Back to rooms returns to the rooms view', async () => {
      await page.getByRole('link', { name: 'Back to rooms' }).click();
      await visible(roomsHeading(page));
      assert(new URL(page.url()).hash === '#/', `hash is ${new URL(page.url()).hash}`);
    });

    await check('errors-mouse', 'No page errors or console errors in mouse flow', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Flow 2: keyboard only. Covers e.
async function flowKeyboard(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  try {
    await check('e', 'Keyboard-only path completes the exchange with visible focus', async () => {
      await openRooms(page);
      const stops = [];
      const step = async (label, target) => {
        await tabUntil(page, target, label);
        stops.push({ label, ...(await focusStyle(page)) });
      };

      await step('Enter room', { text: 'Enter room' });
      await page.keyboard.press('Enter');
      await visible(levelHeading(page));

      await step('A: Select promise', { id: 'promise-A' });
      await page.keyboard.press('Space');
      await step('B: Select promise', { id: 'promise-B' });
      await page.keyboard.press('Space');
      await visible(reasonText(page, TOGETHER));

      await step('Preview exchange', { text: 'Preview exchange' });
      await page.keyboard.press('Enter');
      await visible(reviewHeading(page));

      await step('Run demo exchange', { text: 'Run demo exchange' });
      await page.keyboard.press('Enter');
      await visible(resultHeading(page));

      const unfocused = stops.filter((s) => !s.ok);
      assert(
        unfocused.length === 0,
        `no visible focus ring (:focus-visible + outline) on: ${unfocused.map((s) => `${s.label} [${s.id}]`).join(', ')}`,
      );
    });

    await check('errors-keyboard', 'No page errors or console errors in keyboard flow', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Flow 3b: guards on the review state, and reset while the review is open.
async function flowGuards(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  try {
    await openRooms(page);
    await enterRoom(page);

    await check('g-uncheck', 'Unchecking a promise after Preview hides review and Run, and names the missing promise', async () => {
      await selectBoth(page);
      await previewButton(page).click();
      await visible(reviewHeading(page));
      await checkbox(page, 'B').uncheck();
      await absent(reviewHeading(page));
      await absent(runButton(page));
      await visible(reasonText(page, MISSING_A));
    });

    await check('g-reset-review', 'Reset while the review is open returns to the initial board', async () => {
      await checkbox(page, 'B').check();
      await previewButton(page).click();
      await visible(reviewHeading(page));
      await resetButton(page).click();
      await absent(reviewHeading(page));
      await absent(runButton(page));
      await visible(reasonText(page, PROMPT));
      assert(!(await checkbox(page, 'A').isChecked()), 'A still checked');
      assert(!(await checkbox(page, 'B').isChecked()), 'B still checked');
      assert((await holdingOnBoard(page, 'A')) === 'Has 1 key', `A board: "${await holdingOnBoard(page, 'A')}"`);
      assert((await holdingOnBoard(page, 'B')) === 'Has 1 coin', `B board: "${await holdingOnBoard(page, 'B')}"`);
    });

    await check('errors-guards', 'No page errors or console errors in guards flow', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Flow 3c: browser history, reload, and reduced motion on the result.
async function flowHistory(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  try {
    await openRooms(page);
    await enterRoom(page);
    await previewAndRun(page);

    await check('d-back', 'Browser Back from the result goes to rooms', async () => {
      await page.goBack();
      await visible(roomsHeading(page));
    });

    await check('d-forward', 'Browser Forward gives a fresh Level 1 with no result', async () => {
      await page.goForward();
      await visible(levelHeading(page));
      await visible(reasonText(page, PROMPT));
      await absent(resultHeading(page));
      assert((await holdingOnBoard(page, 'A')) === 'Has 1 key', `A board: "${await holdingOnBoard(page, 'A')}"`);
    });

    await check('e-reload', 'Reload resets the demo: initial board, no result', async () => {
      await previewAndRun(page);
      await page.reload({ waitUntil: 'load' });
      await visible(levelHeading(page));
      await absent(resultHeading(page));
      await visible(reasonText(page, PROMPT));
      assert((await holdingOnBoard(page, 'A')) === 'Has 1 key', `A board: "${await holdingOnBoard(page, 'A')}"`);
      assert((await holdingOnBoard(page, 'B')) === 'Has 1 coin', `B board: "${await holdingOnBoard(page, 'B')}"`);
    });

    await check('errors-history', 'No page errors or console errors in history flow', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Flow 3d: prefers-reduced-motion: reduce, no running animations on the result.
async function flowReducedMotion(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  try {
    await check('g-reduced-motion', 'With prefers-reduced-motion: reduce, no animations run on the result', async () => {
      await openRooms(page);
      await enterRoom(page);
      await previewAndRun(page);
      const media = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
      assert(media, 'reduced-motion emulation not applied');
      await page.waitForTimeout(400);
      const count = await page.evaluate(() => document.getAnimations().length);
      assert(count === 0, `${count} animation(s) still present after load`);
    });

    await check('errors-reduced-motion', 'No page errors or console errors in reduced-motion flow', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Flow 3: real mouse double-click on Run, and keyboard Enter x3 on Run.
// Checks: exactly one result region, hash unchanged, focus on the result heading, no errors.
async function flowDoubleClick(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  try {
    await openRooms(page);
    await enterRoom(page);
    await selectBoth(page);
    await previewButton(page).click();
    await visible(reviewHeading(page));

    await check(`f-dblclick-focus-hash-${width}`, `Mouse double-click on Run at ${width}px: one result, hash kept, focus on result heading`, async () => {
      await runButton(page).dblclick();
      await visible(resultHeading(page));
      const regions = await page.locator('section.result').count();
      assert(regions === 1, `result regions: ${regions}`);
      const hash = new URL(page.url()).hash;
      assert(hash === '#/room/1', `hash is "${hash}"`);
      const focused = await page.evaluate(() => document.activeElement?.id ?? '');
      assert(focused === 'result-title', `focused element id is "${focused}", expected result-title`);
    });

    await check(`errors-dblclick-${width}`, `No page or console errors after double-click at ${width}px`, async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Flow 3e: keyboard only. Tab to Run, then press Enter three times.
async function flowRunKeyboard(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  try {
    await openRooms(page);
    await enterRoom(page);
    await selectBoth(page);
    await previewButton(page).click();
    await visible(reviewHeading(page));

    await check('f-enter-x3-focus', 'Keyboard: Enter three times on Run gives one result, focus on result heading', async () => {
      await tabUntil(page, { text: 'Run demo exchange' }, 'Run demo exchange');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await visible(resultHeading(page));
      const regions = await page.locator('section.result').count();
      assert(regions === 1, `result regions: ${regions}`);
      const focused = await page.evaluate(() => document.activeElement?.id ?? '');
      assert(focused === 'result-title', `focused element id is "${focused}", expected result-title`);
    });

    await check('errors-enter-x3', 'No page or console errors after Enter x3', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Flow 4: Reset demo returns to the initial state. Covers g.
async function flowReset(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  try {
    await openRooms(page);
    await enterRoom(page);

    await check('g-select', 'Reset demo clears a partial selection', async () => {
      await checkbox(page, 'A').check();
      await resetButton(page).click();
      await visible(reasonText(page, PROMPT));
      assert(!(await checkbox(page, 'A').isChecked()), 'A is still checked after reset');
    });

    await previewAndRun(page);

    await check('g-result', 'Reset demo from the result returns to the initial state', async () => {
      await resetButton(page).click();
      await visible(reasonText(page, PROMPT));
      await absent(resultHeading(page));
      assert(!(await checkbox(page, 'A').isChecked()), 'A still checked');
      assert(!(await checkbox(page, 'B').isChecked()), 'B still checked');
      assert((await holdingOnBoard(page, 'A')) === 'Has 1 key', `A board: "${await holdingOnBoard(page, 'A')}"`);
      assert((await holdingOnBoard(page, 'B')) === 'Has 1 coin', `B board: "${await holdingOnBoard(page, 'B')}"`);
    });

    await check('errors-reset', 'No page errors or console errors in reset flow', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Flow 5: layout at 390, 768 and 1440. Covers j and screenshots.
async function flowResponsive(browser) {
  for (const width of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    trackErrors(page, errors);
    try {
      await check(`j-rooms-${width}`, `Rooms: no horizontal overflow at ${width}px`, async () => {
        await openRooms(page);
        await settle(page);
        await page.screenshot({ path: resolve(SHOTS, `rooms-${width}.png`), fullPage: true });
        await assertNoOverflow(page);
      });

      await check(`j-level-${width}`, `Level 1 empty: no horizontal overflow at ${width}px`, async () => {
        await enterRoom(page);
        await settle(page);
        await page.screenshot({ path: resolve(SHOTS, `level-one-${width}.png`), fullPage: true });
        await assertNoOverflow(page);
      });

      await check(`j-review-${width}`, `Review state: no horizontal overflow at ${width}px`, async () => {
        await selectBoth(page);
        await previewButton(page).click();
        await visible(reviewHeading(page));
        await settle(page);
        await page.screenshot({ path: resolve(SHOTS, `level-one-review-${width}.png`), fullPage: true });
        await assertNoOverflow(page);
      });

      await check(`j-result-${width}`, `Result: no horizontal overflow at ${width}px`, async () => {
        await runButton(page).click();
        await visible(resultHeading(page));
        await settle(page);
        await page.screenshot({ path: resolve(SHOTS, `level-one-result-${width}.png`), fullPage: true });
        await assertNoOverflow(page);
      });

      await check(`errors-responsive-${width}`, `No page errors at ${width}px`, async () => {
        assert(errors.length === 0, errors.slice(0, 3).join(' | '));
      });
    } finally {
      await context.close();
    }
  }
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    await runFlow('mouse', () => flowMouse(browser));
    await runFlow('keyboard', () => flowKeyboard(browser));
    await runFlow('guards', () => flowGuards(browser));
    await runFlow('history', () => flowHistory(browser));
    await runFlow('reduced-motion', () => flowReducedMotion(browser));
    await runFlow('double-click-1440', () => flowDoubleClick(browser, 1440));
    await runFlow('double-click-390', () => flowDoubleClick(browser, 390));
    await runFlow('run-keyboard', () => flowRunKeyboard(browser));
    await runFlow('reset', () => flowReset(browser));
    await runFlow('responsive', () => flowResponsive(browser));
    await runFlow('menu', () => flowMenu(browser));
    await runFlow('wide-header', () => flowWideHeader(browser));
    await runFlow('resize-focus', () => flowResizeFocus(browser));
    await runFlow('room2-art', () => flowRoom2Art(browser));
    await runFlow('regressions', () => flowRegressions(browser));
    await runFlow('result-icons', () => flowResultIcons(browser));
    await runFlow('terms-768', () => flowTerms768(browser));
    await runFlow('assets', () => flowAssets(browser));
    await runFlow('shots-2x', () => flowShots2x(browser));
    await runFlow('observer', () => flowObserverRatio(browser));
    await runFlow('room2-scale', () => flowRoom2Scale(browser));
    await runFlow('room2-grow', () => flowRoom2Grow(browser));
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (err) {
  record('fatal', 'Browser run started', false, err instanceof Error ? err.message.split('\n')[0] : String(err));
}

const failed = results.filter((r) => !r.pass);
const summary = {
  baseUrl: BASE_URL,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed.map(({ id, name, detail }) => ({ id, name, detail })),
};
console.log(`\n${summary.passed}/${summary.total} checks passed`);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
