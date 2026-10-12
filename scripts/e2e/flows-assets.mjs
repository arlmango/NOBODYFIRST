// Stage 1.2 asset checks: no paper filter or blend, source sizes, DPR-2 sufficiency,
// one source per character and item, same-origin network only; plus the 2x screenshots.
// Shared helpers live in ./lib.mjs.

import { resolve } from 'node:path';
import {
  BASE_URL,
  SHOTS,
  assert,
  check,
  settle,
  trackErrors,
  openRooms,
  enterRoom,
  selectBoth,
  previewButton,
  reviewHeading,
  runButton,
  resultHeading,
} from './lib.mjs';

// Expected natural widths of the committed files (src/assets/**).
const EXPECTED_WIDTH = { a: 490, b: 522, c: 472, key: 288, coin: 234 };

async function newPage(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  return { context, page, errors };
}

async function waitImages(page) {
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 5000 });
}

// Records every visible portrait and item on the current screen.
async function report(page, label, rec) {
  const items = await page.evaluate(() => {
    const paperFilter = Boolean(document.querySelector('#paper-lift'));
    return [...document.querySelectorAll('img.portrait, img.item-icon')].map((img) => {
      const r = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      return {
        kind: img.classList.contains('portrait') ? 'portrait' : 'item',
        file: (img.currentSrc || img.src).split('/').pop(),
        natural: img.naturalWidth,
        rendered: r.width,
        blend: cs.mixBlendMode,
        filter: cs.filter,
        paperFilter,
      };
    });
  });
  const visible = items.filter((i) => i.rendered > 0);
  assert(visible.length > 0, `${label}: no visible portraits or items`);
  rec.push(...visible.map((i) => ({ ...i, label })));
}

// Character or item key from a built file name, e.g. "a-BLf8GTJR.png" -> "a", "key-CDR8ZKBy.png" -> "key".
const keyOf = (file) => file.split('-')[0].split('.')[0];

export async function flowAssets(browser) {
  const rec = [];
  const origins = new Set();
  const base = new URL(BASE_URL).origin;
  let errorsAll = [];
  for (const width of [390, 768, 1440]) {
    const { context, page, errors } = await newPage(browser, width);
    page.on('request', (r) => origins.add(new URL(r.url()).origin));
    errorsAll = errorsAll.concat(errors);
    try {
      await openRooms(page);
      await waitImages(page);
      await report(page, `rooms-${width}`, rec);
      await enterRoom(page);
      await waitImages(page);
      await report(page, `board-${width}`, rec);
    } finally {
      await context.close();
    }
  }

  // Result screens: reached by the same flow in fresh pages (review then run).
  for (const width of [390, 768, 1440]) {
    const { context, page, errors } = await newPage(browser, width);
    page.on('request', (r) => origins.add(new URL(r.url()).origin));
    errorsAll = errorsAll.concat(errors);
    try {
      await openRooms(page);
      await enterRoom(page);
      await selectBoth(page);
      await previewButton(page).click();
      await reviewHeading(page).waitFor({ state: 'visible', timeout: 5000 });
      await runButton(page).click();
      await resultHeading(page).waitFor({ state: 'visible', timeout: 5000 });
      await waitImages(page);
      await report(page, `result-${width}`, rec);
    } finally {
      await context.close();
    }
  }

  const portraits = rec.filter((i) => i.kind === 'portrait');
  const items = rec.filter((i) => i.kind === 'item');
  const ratios = rec.map((i) => i.natural / i.rendered);
  const minRatio = Math.min(...ratios);
  console.log(`INFO assets: ${rec.length} screen items recorded; min natural/rendered ratio ${minRatio.toFixed(2)}`);

  await check('a-assets-no-paper-filter', 'No paper-lift filter in the DOM and no mix-blend-mode or filter on portraits and items', async () => {
    assert(rec.every((i) => !i.paperFilter), 'a #paper-lift element is present');
    const bad = rec.filter((i) => i.blend !== 'normal' || i.filter !== 'none');
    assert(bad.length === 0, `blend/filter set on: ${bad.map((i) => `${i.label} ${i.file} (${i.blend}, ${i.filter})`).slice(0, 3).join(' | ')}`);
  });

  await check('a-assets-natural-width', 'Every portrait and item has its expected natural width (no other source)', async () => {
    const bad = rec.filter((i) => i.natural !== EXPECTED_WIDTH[keyOf(i.file)]);
    assert(bad.length === 0, `wrong natural width: ${bad.map((i) => `${i.label} ${i.file}=${i.natural}`).slice(0, 4).join(' | ')}`);
  });

  await check('a-assets-dpr2', 'natural/rendered width is at least 2 for every portrait and item at 390, 768 and 1440', async () => {
    const low = rec.filter((i) => i.natural / i.rendered < 2);
    assert(low.length === 0, `below 2: ${low.map((i) => `${i.label} ${i.file} ${(i.natural / i.rendered).toFixed(2)}`).slice(0, 4).join(' | ')}`);
  });

  await check('a-assets-one-source', 'One permanent source per character (3 portrait files) and per item (2 item files)', async () => {
    const pSet = new Set(portraits.map((i) => i.file));
    const iSet = new Set(items.map((i) => i.file));
    assert(pSet.size === 3, `distinct portrait files: ${[...pSet].join(', ')}`);
    assert(iSet.size === 2, `distinct item files: ${[...iSet].join(', ')}`);
  });

  await check('a-assets-same-origin', 'All network requests during the asset flows are same-origin', async () => {
    const foreign = [...origins].filter((o) => o !== base && !o.startsWith('data:'));
    assert(foreign.length === 0, `foreign origins: ${foreign.join(', ')}`);
  });

  await check('errors-assets', 'No page or console errors in the asset flows', async () => {
    assert(errorsAll.length === 0, errorsAll.slice(0, 3).join(' | '));
  });
}

// 2x screenshots of the viewport (not full page) at 1440.
export async function flowShots2x(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await check('shots-2x-rooms', 'Rooms at 1440px, deviceScaleFactor 2: viewport screenshot saved', async () => {
      await openRooms(page);
      await waitImages(page);
      await settle(page);
      await page.screenshot({ path: resolve(SHOTS, 'rooms-1440-2x.png') });
    });
    await check('shots-2x-result', 'Result at 1440px, deviceScaleFactor 2: viewport screenshot saved', async () => {
      await enterRoom(page);
      await selectBoth(page);
      await previewButton(page).click();
      await reviewHeading(page).waitFor({ state: 'visible', timeout: 5000 });
      await runButton(page).click();
      await resultHeading(page).waitFor({ state: 'visible', timeout: 5000 });
      await waitImages(page);
      await settle(page);
      await page.screenshot({ path: resolve(SHOTS, 'level-one-result-1440-2x.png') });
    });
  } finally {
    await context.close();
  }
}
