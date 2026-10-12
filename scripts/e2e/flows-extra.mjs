// Stage 1.1 flows: mobile Menu disclosure, resize focus, wide header, and regression checks
// for copy, fonts, result icon sizes, the .terms width at 768px, and the Room 02 art.
// Shared helpers live in ./lib.mjs.

import { resolve } from 'node:path';
import {
  SHOTS,
  assert,
  check,
  settle,
  trackErrors,
  visible,
  openRooms,
  enterRoom,
  selectBoth,
  checkbox,
  previewButton,
  levelHeading,
  reviewHeading,
  runButton,
  resultHeading,
} from './lib.mjs';

const menuButton = (page) => page.getByRole('button', { name: 'Menu', exact: true });
const panel = (page) => page.locator('.site-menu__panel');
const panelLink = (page, name) => panel(page).getByRole('link', { name });
const closeButton = (page) => panel(page).getByRole('button', { name: 'Close', exact: true });
const SANS_RE = /system-ui/;

async function activeText(page) {
  return page.evaluate(() => (document.activeElement?.textContent ?? '').replace(/\s+/g, ' ').trim());
}

async function openMenu(page) {
  if ((await menuButton(page).getAttribute('aria-expanded')) !== 'true') await menuButton(page).click();
}

async function newPage(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  trackErrors(page, errors);
  return { context, page, errors };
}

// Mobile header (390px): Menu disclosure.
export async function flowMenu(browser) {
  const { context, page, errors } = await newPage(browser, 390);
  try {
    await openRooms(page);

    await check('m-closed', 'Menu button at 390px is closed (aria-expanded=false) and links are hidden', async () => {
      await visible(menuButton(page));
      assert((await menuButton(page).getAttribute('aria-expanded')) === 'false', 'aria-expanded is not false');
      assert(!(await panel(page).isVisible()), 'menu panel is visible while closed');
    });

    await check('m-aria-controls', 'Menu aria-controls matches the id of the menu panel', async () => {
      const controls = await menuButton(page).getAttribute('aria-controls');
      const panelId = await panel(page).getAttribute('id');
      assert(controls && controls === panelId, `aria-controls="${controls}" panel id="${panelId}"`);
    });

    await check('m-open', 'Opening Menu sets aria-expanded=true and shows The rooms, How to play, Close', async () => {
      await menuButton(page).click();
      assert((await menuButton(page).getAttribute('aria-expanded')) === 'true', 'aria-expanded is not true');
      await visible(panelLink(page, 'The rooms'));
      await visible(panelLink(page, 'How to play'));
      await visible(closeButton(page));
    });

    await check('m-tab-order', 'Tab order inside the open menu: Menu, The rooms, How to play, Close', async () => {
      await menuButton(page).focus();
      await page.keyboard.press('Tab');
      assert((await activeText(page)) === 'The rooms', `after Tab 1: "${await activeText(page)}"`);
      await page.keyboard.press('Tab');
      assert((await activeText(page)) === 'How to play', `after Tab 2: "${await activeText(page)}"`);
      await page.keyboard.press('Tab');
      assert((await activeText(page)) === 'Close', `after Tab 3: "${await activeText(page)}"`);
    });

    await check('m-tab-past-close', 'Tab past Close closes the menu', async () => {
      await page.keyboard.press('Tab');
      assert((await menuButton(page).getAttribute('aria-expanded')) === 'false', 'still expanded after Tab past Close');
      assert(!(await panel(page).isVisible()), 'panel still visible after Tab past Close');
    });

    await check('m-escape', 'Escape closes the menu and returns focus to Menu', async () => {
      await openMenu(page);
      await page.keyboard.press('Escape');
      assert((await menuButton(page).getAttribute('aria-expanded')) === 'false', 'still expanded after Escape');
      assert(!(await panel(page).isVisible()), 'panel still visible after Escape');
      assert((await activeText(page)) === 'Menu', `focus after Escape: "${await activeText(page)}"`);
    });

    await check('m-close', 'Close button closes the menu and returns focus to Menu', async () => {
      await openMenu(page);
      await closeButton(page).click();
      assert((await menuButton(page).getAttribute('aria-expanded')) === 'false', 'still expanded after Close');
      assert(!(await panel(page).isVisible()), 'panel still visible after Close');
      assert((await activeText(page)) === 'Menu', `focus after Close: "${await activeText(page)}"`);
    });

    await check('m-click-outside', 'A click outside the menu closes it', async () => {
      await openMenu(page);
      await visible(panelLink(page, 'The rooms'));
      await roomsTitle(page).click({ position: { x: 4, y: 4 } });
      assert((await menuButton(page).getAttribute('aria-expanded')) === 'false', 'still expanded after outside click');
      assert(!(await panel(page).isVisible()), 'panel still visible after outside click');
    });

    await check('m-choose', 'Choosing How to play closes the menu and navigates to #how-to-play', async () => {
      await openMenu(page);
      await panelLink(page, 'How to play').click();
      assert(!(await panel(page).isVisible()), 'panel still visible after choosing a link');
      assert(new URL(page.url()).hash === '#how-to-play', `hash is "${new URL(page.url()).hash}"`);
      assert((await page.evaluate(() => document.activeElement?.id ?? '')) === 'how-to-play', 'focus not on #how-to-play');
    });

    await check('m-open-shot', 'Menu open at 390px: screenshot saved', async () => {
      await openRooms(page);
      await openMenu(page);
      await visible(panelLink(page, 'The rooms'));
      await settle(page);
      await page.screenshot({ path: resolve(SHOTS, 'menu-open-390.png'), fullPage: true });
    });

    await check('errors-menu-390', 'No page or console errors in the menu flow at 390px', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Resize focus: for each header control, focus it at 390, then 3 cycles of 390 -> 800 -> 390.
// Each target runs on a fresh page. Focus must never be on <body>.
// After 390 -> 800: a link target lands on the inline link with the same name; Close/Menu land on the brand.
// After 800 -> 390: link targets land on Menu; Close/Menu stay on the brand.
const HEADER_LINKS = ['The rooms', 'How to play'];

async function activeInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { body: true, tag: 'BODY', cls: '', text: '', inNav: false, width: 0 };
    const r = el.getBoundingClientRect();
    return {
      body: false,
      tag: el.tagName,
      cls: typeof el.className === 'string' ? el.className : '',
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      inNav: Boolean(el.closest('.site-header__nav')),
      width: r.width,
    };
  });
}

async function resizeCycles(browser, target) {
  const { context, page, errors } = await newPage(browser, 390);
  try {
    await openRooms(page);
    const isLink = HEADER_LINKS.includes(target);
    await check(`m-resize-${target.replace(/ /g, '-').toLowerCase()}`, `Resize 390-800-390 x3, focus on "${target}": never body; lands on the expected control`, async () => {
      for (let cycle = 1; cycle <= 3; cycle++) {
        if (target === 'Menu') {
          await menuButton(page).focus();
        } else {
          await openMenu(page);
          if (isLink) await panelLink(page, target).focus();
          else await closeButton(page).focus();
        }
        const start = await activeInfo(page);
        assert(!start.body, `cycle ${cycle}: focus on body before resize`);

        await page.setViewportSize({ width: 800, height: 900 });
        await page.waitForTimeout(300);
        const wide = await activeInfo(page);
        assert(!wide.body, `cycle ${cycle}: focus on body after 390->800`);
        if (isLink) {
          assert(wide.tag === 'A' && wide.inNav && wide.text === target && wide.width > 0,
            `cycle ${cycle}: after 390->800 focus is ${JSON.stringify(wide)}, expected inline "${target}" link`);
        } else {
          assert(wide.tag === 'A' && wide.cls.includes('site-header__brand') && wide.width > 0,
            `cycle ${cycle}: after 390->800 focus is ${JSON.stringify(wide)}, expected brand link`);
        }

        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForTimeout(300);
        const narrow = await activeInfo(page);
        assert(!narrow.body, `cycle ${cycle}: focus on body after 800->390`);
        if (isLink) {
          assert(narrow.tag === 'BUTTON' && narrow.cls.includes('site-menu__toggle'),
            `cycle ${cycle}: after 800->390 focus is ${JSON.stringify(narrow)}, expected Menu button`);
        } else {
          assert(narrow.tag === 'A' && narrow.cls.includes('site-header__brand'),
            `cycle ${cycle}: after 800->390 focus is ${JSON.stringify(narrow)}, expected brand link`);
        }
      }
    });
    await check(`errors-resize-${target.replace(/ /g, '-').toLowerCase()}`, `No page or console errors in resize cycles for "${target}"`, async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Focus on a checkbox outside the header must stay put across resize.
async function checkboxResize(browser) {
  const { context, page, errors } = await newPage(browser, 390);
  try {
    await openRooms(page);
    await enterRoom(page);
    await check('m-resize-checkbox', 'Focus on a promise checkbox (outside the header) stays put across 390-800-390 x3', async () => {
      await checkbox(page, 'A').focus();
      for (let cycle = 1; cycle <= 3; cycle++) {
        await page.setViewportSize({ width: 800, height: 900 });
        await page.waitForTimeout(300);
        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForTimeout(300);
        const id = await page.evaluate(() => document.activeElement?.id ?? '');
        assert(id === 'promise-A', `cycle ${cycle}: focus id is "${id}", expected promise-A`);
      }
    });
    await check('errors-resize-checkbox', 'No page or console errors in checkbox resize flow', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

export async function flowResizeFocus(browser) {
  for (const target of ['The rooms', 'How to play', 'Close', 'Menu']) await resizeCycles(browser, target);
  await checkboxResize(browser);
}

// Wide widths: no Menu button, both links visible.
export async function flowWideHeader(browser) {
  for (const width of [768, 1440]) {
    const { context, page, errors } = await newPage(browser, width);
    try {
      await openRooms(page);
      await check(`m-wide-${width}`, `No Menu button at ${width}px; The rooms and How to play both visible`, async () => {
        assert((await menuButton(page).count()) === 0, 'a Menu button is present');
        await visible(page.getByRole('link', { name: 'The rooms', exact: true }));
        await visible(page.getByRole('link', { name: 'How to play', exact: true }));
      });
      await check(`errors-wide-${width}`, `No page or console errors on rooms at ${width}px`, async () => {
        assert(errors.length === 0, errors.slice(0, 3).join(' | '));
      });
    } finally {
      await context.close();
    }
  }
}

const roomsTitle = (page) => page.getByRole('heading', { level: 1, name: 'Three rooms. One rule.' });

// Room 02 art at a given width. Line samples are tested against figure pixels (PNG alpha > 24),
// not the whole portrait bounding box, so transparent margins do not count. Portrait boxes must not overlap each other.
export async function flowRoom2Art(browser) {
  for (const width of [390, 768, 1440]) {
    const { context, page, errors } = await newPage(browser, width);
    try {
      await openRooms(page);
      await check(`r-room2-art-${width}`, `Room 02 art at ${width}px: portrait boxes do not overlap; no line crosses a figure (opaque pixels)`, async () => {
        const result = await page.evaluate(async () => {
          const imgs = [...document.querySelectorAll('.circle__person img')];
          const svg = document.querySelector('.circle__lines');
          if (imgs.length !== 3 || !svg) return { error: 'Room 02 art not found' };
          await Promise.all(imgs.map((i) => (i.complete ? null : i.decode().catch(() => null))));
          // Alpha masks of the committed PNGs (same origin, so the canvas is not tainted).
          const figs = imgs.map((img) => {
            const nat = img.naturalWidth, h = img.naturalHeight;
            const c = document.createElement('canvas');
            c.width = nat;
            c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            return { r: img.getBoundingClientRect(), nat, h, alpha: ctx.getImageData(0, 0, nat, h).data };
          });
          const people = figs.map((f) => f.r);
          let boxOverlaps = 0;
          for (let i = 0; i < people.length; i++)
            for (let j = i + 1; j < people.length; j++) {
              const a = people[i], b = people[j];
              if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) boxOverlaps++;
            }
          let boxHits = 0, figHits = 0, samples = 0;
          for (const shape of svg.querySelectorAll('path, line, polyline')) {
            const len = shape.getTotalLength();
            const ctm = shape.getScreenCTM();
            for (let k = 0; k <= 200; k++) {
              const p = shape.getPointAtLength((len * k) / 200).matrixTransform(ctm);
              samples++;
              if (people.some((r) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom)) boxHits++;
              const inFig = figs.some((f) => {
                const u = Math.floor(((p.x - f.r.left) / f.r.width) * f.nat);
                const v = Math.floor(((p.y - f.r.top) / f.r.height) * f.h);
                return u >= 0 && v >= 0 && u < f.nat && v < f.h && f.alpha[(v * f.nat + u) * 4 + 3] > 24;
              });
              if (inFig) figHits++;
            }
          }
          return { error: null, boxOverlaps, boxHits, figHits, samples };
        });
        assert(!result.error, result.error);
        assert(result.boxOverlaps === 0, `portrait boxes overlap: ${result.boxOverlaps}`);
        console.log(`INFO room2-${width}: line samples in transparent box margins ${result.boxHits} of ${result.samples} (not figure)`);
        assert(result.figHits === 0, `line samples on opaque figure pixels: ${result.figHits} of ${result.samples}`);
      });
      await check(`errors-room2-${width}`, `No page or console errors on rooms at ${width}px (Room 02 art)`, async () => {
        assert(errors.length === 0, errors.slice(0, 3).join(' | '));
      });
    } finally {
      await context.close();
    }
  }
}

// Copy, fonts (all matching elements), result icons at 1440, on rooms and level pages.
export async function flowRegressions(browser) {
  const { context, page, errors } = await newPage(browser, 1440);
  try {
    await openRooms(page);

    await check('r-copy', 'Rooms page has the exact local-demo note and no "connected game" text', async () => {
      await visible(page.getByText('This demo runs locally. Blockchain execution is not implemented yet.', { exact: true }));
      const text = await page.evaluate(() => document.body.innerText);
      assert(!/connected game/i.test(text), 'found "connected game" on the rooms page');
    });

    await check('r-step-font', 'All step numbers (3) use the sans stack, not Georgia', async () => {
      const fonts = await page.locator('.step__num').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontFamily));
      assert(fonts.length === 3, `step number elements: ${fonts.length}`);
      assert(fonts.every((ff) => SANS_RE.test(ff) && !/Georgia/i.test(ff)), `font-family values: ${fonts.join(' | ')}`);
    });

    await check('r-has-font', 'All "Has" text on the level board (A and B) uses the sans stack, not Georgia', async () => {
      await enterRoom(page);
      const fonts = await page.locator('.person__has > span').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontFamily));
      assert(fonts.length === 2, `"Has" text elements: ${fonts.length}`);
      assert(fonts.every((ff) => SANS_RE.test(ff) && !/Georgia/i.test(ff)), `font-family values: ${fonts.join(' | ')}`);
      assert((await page.locator('.person--A .person__has > span').textContent()).trim() === 'Has 1 key', 'A text is not "Has 1 key"');
    });

    await check('errors-regressions-1440', 'No page or console errors in regression flow at 1440px', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

// Result item icon sizes (every .holding .item-icon) and the 768 .terms width.
const ICON_MIN = { 390: 44, 768: 48, 1440: 56 };

async function resultIconCheck(browser, width) {
  const { context, page, errors } = await newPage(browser, width);
  try {
    await openRooms(page);
    await enterRoom(page);
    await check(`r-result-icon-${width}`, `Result item icons are at least ${ICON_MIN[width]}px wide at ${width}px`, async () => {
      await selectBoth(page);
      await previewButton(page).click();
      await visible(reviewHeading(page));
      await runButton(page).click();
      await visible(resultHeading(page));
      const widths = await page.locator('.holding .item-icon').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
      assert(widths.length === 4, `result icon count: ${widths.length} (expected 4)`);
      assert(widths.every((w) => Math.round(w) >= ICON_MIN[width]), `widths: ${widths.map((w) => w.toFixed(1)).join(', ')}`);
    });
    await check(`errors-icons-${width}`, `No page or console errors in result icon check at ${width}px`, async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}

export async function flowResultIcons(browser) {
  for (const width of [390, 768, 1440]) await resultIconCheck(browser, width);
}

export async function flowTerms768(browser) {
  const { context, page, errors } = await newPage(browser, 768);
  try {
    await openRooms(page);
    await enterRoom(page);
    await check('r-terms-768', '.terms block is at most 420px wide at 768px', async () => {
      await visible(levelHeading(page));
      const widths = await page.locator('dl.terms').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
      assert(widths.length > 0, 'no .terms blocks found');
      assert(widths.every((w) => w <= 420), `widths: ${widths.map((w) => w.toFixed(1)).join(', ')}`);
    });
    await check('errors-terms-768', 'No page or console errors in terms check at 768px', async () => {
      assert(errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await context.close();
  }
}
