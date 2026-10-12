# Asset provenance

Date: 2026-10-11

## Status

- Assets replaced by the user's transparent sheet. The permanent masters, one per character and per item, are cropped from the imagegen sheet `characters-and-items.png` (real alpha). Transparent background, no baked paper.
- Resolution is sufficient for DPR 2 at the current maximum displayed sizes (table below).
- The previous BLOCKED status (blocked on the old low-resolution paper-background crops) is resolved.
- Image generation was done in the designer's chat with imagegen. The full prompt exists only in that chat and is not reproduced here. No prompt was invented.
- The sheet itself was not modified or moved. Nothing was resized, filtered or colour-keyed.
- Retired temporary crops from `02-level-one.png` (the earlier 265/310/215/75/68 px paper-background crops) were removed. They are not the sources any more.

## Source

- File: `/Users/mango/NOBODYFIRST/characters-and-items.png` (1536x1024 RGBA)
- SHA-256: `1f36153020b3bdaa53594355f8263af5722372d46b1dd48dcfd4d766c74d08f9` (verified before cropping)

## Tool and commands

- Crops: macOS `sips` only. Command pattern: `sips -c <height> <width> --cropOffset <y> <x> <source> --out <target>`
- Commands used:
  - `sips -c 630 490 --cropOffset 76 26 characters-and-items.png --out src/assets/portraits/a.png`
  - `sips -c 637 522 --cropOffset 78 512 characters-and-items.png --out src/assets/portraits/b.png`
  - `sips -c 595 472 --cropOffset 141 1037 characters-and-items.png --out src/assets/portraits/c.png`
  - `sips -c 255 288 --cropOffset 714 355 characters-and-items.png --out src/assets/items/key.png`
  - `sips -c 238 234 --cropOffset 734 899 characters-and-items.png --out src/assets/items/coin.png`
- Alpha analysis and pixel verification: headless Chrome via playwright-core (channel `chrome`), canvas `getImageData`. Scripts are in the orchestrator's scratchpad, not in the repo.

## Object detection and rectangles

Connected components of alpha >= 8 on the sheet gave five separate objects with no bridging. Each object's window is its alpha >= 8 bounding box plus up to 6 px of padding per side. Padding is capped so that no pixel of another object with alpha >= 1 falls inside any window. Faint stray specks (alpha 1-6) exist on the sheet outside all objects; they are below the visible threshold and are not part of any object.

Rectangles (sheet px, x, y, w, h):

| File | Object | Rectangle (x, y, w, h) | Output size | Drawing (alpha >= 16) inside file (x, y, w, h) | Transparent share of file | Transparent share of 4 px border |
|---|---|---|---|---|---|---|
| `portraits/a.png` | A | (26, 76, 490, 630) | 490x630 | (6, 6, 479, 618) | 26.5% | 91.9% |
| `portraits/b.png` | B | (512, 78, 522, 637) | 522x637 | (5, 7, 511, 624) | 29.9% | 89.0% |
| `portraits/c.png` | C | (1037, 141, 472, 595) | 472x595 | (7, 7, 459, 582) | 27.9% | 96.1% |
| `items/key.png` | key | (355, 714, 288, 255) | 288x255 | (7, 6, 275, 242) | 68.0% | 99.8% |
| `items/coin.png` | coin | (899, 734, 234, 238) | 234x238 | (7, 7, 221, 225) | 25.2% | 89.3% |

Neighbour checks: A's window ends at x=515 (B starts at x=516). B's window starts at x=512, so it overlaps A's window only in columns that hold no A pixel at alpha >= 1. Key's window starts at y=714 (A ends at y=699 and B at y=708 in their columns). Coin's window starts at y=734 (C ends at y=729).

## Verification

- Output format: PNG, `sips -g hasAlpha` = yes for all five.
- Pixel comparison (each output vs its sheet region at the rectangle offset, as rendered by Chrome canvas, premultiplied RGBA): 0 differing pixels for all five files. Alpha channel identical everywhere. Raw non-premultiplied RGB differs in semi-transparent and fully transparent pixels because `sips` round-trips through premultiplied alpha. This has no visible effect on the light page background.
- Composites on `#F6F2E9` and `#1b1b1b` were rendered in Chrome at 1x and checked visually. No rectangular plate, no dark halo, and no neighbouring fragment was visible. A's white ruffle reads clearly on both backgrounds.

## No resolution increase

No resampling, upscaling, resizing, filtering or background removal was applied. The sources are exactly the sheet pixels. Resolution is whatever the imagegen sheet provides.

## Rendered size and DPR

Measured from the DOM on the final build at 390, 768, 1024, 1440 and 1920 px, across all screens.

Rule: achieved DPR = drawing px (the file's alpha >= 16 drawing width) / displayed drawing px (the drawing's rendered CSS width). DPR 2 requires drawing px >= 2 x displayed drawing px.

| File | Drawing px | Max displayed file box (CSS px) | Displayed drawing (CSS px) | Achieved DPR | Meets DPR 2 |
|---|---|---|---|---|---|
| `portraits/a.png` | 479 | 156.8 | 153.3 (board, >= 1024 px) | 3.13 | yes |
| `portraits/b.png` | 511 | 167.0 | 163.5 | 3.13 | yes |
| `portraits/c.png` | 459 | 151.0 | 146.9 | 3.13 | yes |
| `items/key.png` | 275 | 99.3 | 94.8 (Room 03, >= 1024 px) | 2.90 | yes |
| `items/coin.png` | 221 | 56.2 | 53.0 (Room 01, 1440 px) | 4.17 | yes |

All five meet DPR 2 with no resampling or upscaling. Sizes were reduced by CSS only.

Values measured at stage 1.2 integration. Stage 1.3 only reduces C's displayed size and changes the Room 02/03 layout. Re-measured values are in `docs/evidence/RUN.md`.

## Alpha and metadata (stage 1.3, measured 2026-10-12)

Measured by decoding each file in headless Chrome (canvas `getImageData`). Percentages are of all pixels in the file.

| File | Size | Max alpha | Alpha 255 | Alpha 0 | Alpha >= 250 | Alpha 1-15 | Alpha 16-127 | Alpha 128-249 | Mean alpha (alpha >= 16) |
|---|---|---|---|---|---|---|---|---|---|
| sheet `characters-and-items.png` | 1536x1024 | 254 | 0 (0%) | 53.59% | 33.91% | 5.40% | 2.10% | 4.99% | 238.8 |
| `portraits/a.png` | 490x630 | 254 | 0 (0%) | 26.50% | 50.76% | 9.53% | 3.95% | 9.26% | 235.8 |
| `portraits/b.png` | 522x637 | 254 | 0 (0%) | 29.85% | 50.01% | 8.19% | 3.62% | 8.33% | 236.9 |
| `portraits/c.png` | 472x595 | 254 | 0 (0%) | 27.95% | 56.83% | 6.83% | 2.63% | 5.77% | 242.0 |
| `items/key.png` | 288x255 | 254 | 0 (0%) | 68.05% | 19.14% | 5.61% | 1.36% | 5.84% | 237.6 |
| `items/coin.png` | 234x238 | 254 | 0 (0%) | 25.18% | 65.90% | 4.91% | 0.83% | 3.19% | 249.2 |

Confirmed: no pixel in the sheet or in any output has alpha 255. The maximum alpha in every file is 254.

PNG metadata (chunk headers read with Node `fs`):

- Sheet `characters-and-items.png`: `IHDR`, `caBX` (23,654 bytes), `IDAT` (multiple), `IEND`. The `caBX` chunk is a C2PA/JUMBF content-credentials block. It is present in the original sheet.
- Outputs (all five): `IHDR`, `sRGB` (1 byte), `eXIf` (68 bytes), `IDAT` (multiple), `IEND`. None contains `caBX`. The `sRGB` and `eXIf` chunks were added by `sips` when the crops were written.
- Absence of `caBX` in the derived files does not mean absence of provenance. The original sheet is kept unchanged at `/Users/mango/NOBODYFIRST/characters-and-items.png`, SHA-256 `1f36153020b3bdaa53594355f8263af5722372d46b1dd48dcfd4d766c74d08f9`.
- The metadata change does not change the rendered pixels. Each crop is identical to its sheet rectangle as rendered (premultiplied RGBA via Chrome canvas: 0 differing pixels) and the alpha channel is identical everywhere. Raw non-premultiplied RGB differs in semi-transparent and fully transparent pixels because `sips` round-trips through premultiplied alpha (see Verification above).

## Known limitations

Factual defects (measured or observed):

- Faint stray alpha specks (1-6) exist on the sheet outside all objects. Some crop windows contain such specks at alpha 1-6 (maximum 6). They are below the drawing threshold and invisible on the composites, but they are not zero.
- Semi-transparent pixels (alpha 1-249, sum of the three ranges above, as a share of all pixels in the file): sheet 12.49%, a 22.74%, b 20.14%, c 15.23%, key 12.81%, coin 8.93%. They were not cleaned or hardened. Edge quality depends on the sheet's alpha.
- Edge inspection: composites were checked at 1x by the asset agent. Per-pixel edge zoom was not done.

Accepted design differences (properties of the generated art, not repaired):

- A's white ruffled collar is close to the paper colour, so its edges are subtle on light backgrounds.
- Key shadow fringe on dark backgrounds and coin rim shadow come from the generated art. The orchestrator reported these; the asset agent did not separately re-verify them.

Other:

- One sample per character and per item.
