// Stage 1.3 light regression checks: observer scale (C is secondary on the level board and result, not in Room 02)
// and Room 02 portraits not shrinking between 390 and 768. Not pixel-exact; ratios with tolerance.
// Shared helpers live in ./lib.mjs.

import { assert, check, trackErrors, openRooms, enterRoom, selectBoth, previewButton, reviewHeading, runButton, resultHeading } from './lib.mjs';

async function newPage(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  return { context, page, errors };
}

// Rendered widths of the board portraits (A, B, C) at the current viewport.
async function boardWidths(page) {
  return page.evaluate(() => {
    const out = {};
    for (const who of ['A', 'B', 'C']) {
      const img = document.querySelector(`.person--${who} img.portrait`);
      out[who] = img ? img.getBoundingClientRect().width : 0;
    }
    return out;
  });
}

// Room 02 portraits: rendered width and natural width, keyed by character file.
async function roomTwoWidths(page) {
  return page.evaluate(() => {
    const out = {};
    for (const img of document.querySelectorAll('.circle__person img')) {
      out[(img.currentSrc || img.src).split('/').pop().split('-')[0].split('.')[0]] = {
        rendered: img.getBoundingClientRect().width,
        natural: img.naturalWidth,
      };
    }
    return out;
  });
}

export async function flowObserverRatio(browser) {
  for (const width of [390, 768, 1440]) {
    const { context, page, errors } = await newPage(browser, width);
    try {
      await openRooms(page);
      await enterRoom(page);
      await check(`g-observer-board-${width}`, `Observer C on the board at ${width}px: 0.70 to 0.85 of A and of B`, async () => {
        const w = await boardWidths(page);
        assert(w.A > 0 && w.B > 0 && w.C > 0, `board widths: ${JSON.stringify(w)}`);
        const rA = w.C / w.A, rB = w.C / w.B;
        assert(rA >= 0.7 && rA <= 0.85, `C/A = ${rA.toFixed(3)} (A ${w.A.toFixed(1)}, C ${w.C.toFixed(1)})`);
        assert(rB >= 0.7 && rB <= 0.85, `C/B = ${rB.toFixed(3)} (B ${w.B.toFixed(1)}, C ${w.C.toFixed(1)})`);
      });
      await check(`g-observer-result-${width}`, `Observer C on the result at ${width}px: 0.70 to 0.85 of A and of B`, async () => {
        await selectBoth(page);
        await previewButton(page).click();
        await reviewHeading(page).waitFor({ state: 'visible', timeout: 5000 });
        await runButton(page).click();
        await resultHeading(page).waitFor({ state: 'visible', timeout: 5000 });
        const w = await page.evaluate(() => {
          const out = {};
          for (const who of ['A', 'B', 'C']) {
            const img = document.querySelector(`li.result__person--${who} img.portrait`);
            out[who] = img ? img.getBoundingClientRect().width : 0;
          }
          return out;
        });
        assert(w.A > 0 && w.B > 0 && w.C > 0, `result widths: ${JSON.stringify(w)}`);
        const rA = w.C / w.A, rB = w.C / w.B;
        assert(rA >= 0.7 && rA <= 0.85, `C/A = ${rA.toFixed(3)}`);
        assert(rB >= 0.7 && rB <= 0.85, `C/B = ${rB.toFixed(3)}`);
      });
      await check(`errors-observer-${width}`, `No page or console errors in observer checks at ${width}px`, async () => {
        assert(errors.length === 0, errors.slice(0, 3).join(' | '));
      });
    } finally {
      await context.close();
    }
  }
}

// Room 02: C is not shrunk, so its width/natural ratio matches A's within 5%.
export async function flowRoom2Scale(browser) {
  const { context, page, errors } = await newPage(browser, 1440);
  try {
    await openRooms(page);
    await check('g-room2-scale', 'Room 02 at 1440px: C is not shrunk (width/natural within 5% of A)', async () => {
      const w = await roomTwoWidths(page);
      assert(w.a && w.c, `Room 02 widths: ${JSON.stringify(w)}`);
      const rA = w.a.rendered / w.a.natural, rC = w.c.rendered / w.c.natural;
      const diff = Math.abs(rC - rA) / rA;
      assert(diff <= 0.05, `scale A ${rA.toFixed(4)} vs C ${rC.toFixed(4)} (diff ${(diff * 100).toFixed(1)}%)`);
    });
    await check('errors-room2-scale', 'No page or console errors in Room 02 scale check', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Room 02 portraits at 768 are not smaller than at 390 (each >= 0.95x).
export async function flowRoom2Grow(browser) {
  const w390 = await (async () => {
    const { context, page } = await newPage(browser, 390);
    try { await openRooms(page); return await roomTwoWidths(page); } finally { await context.close(); }
  })();
  const { context, page, errors } = await newPage(browser, 768);
  try {
    await openRooms(page);
    const w768 = await roomTwoWidths(page);
    await check('g-room2-768-vs-390', 'Room 02 portraits at 768px are at least 0.95x their width at 390px (A, B, C)', async () => {
      for (const k of ['a', 'b', 'c']) {
        assert(w390[k] && w768[k], `missing ${k}`);
        const ratio = w768[k].rendered / w390[k].rendered;
        assert(ratio >= 0.95, `${k}: 768 ${w768[k].rendered.toFixed(1)} / 390 ${w390[k].rendered.toFixed(1)} = ${ratio.toFixed(3)}`);
      }
    });
    await check('errors-room2-grow', 'No page or console errors in Room 02 size check', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

