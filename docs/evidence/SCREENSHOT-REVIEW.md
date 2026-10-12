# Screenshot review (stage 1.3 final run, 2026-10-12)

Reviewed: the 15 files in `docs/screenshots/` from the final run (see RUN.md): 13 state shots at 390, 768 and 1440 px,
plus `rooms-1440-2x.png` and `level-one-result-1440-2x.png` (deviceScaleFactor 2, viewport only).
Visual judgement from the images, not pixel comparison. The mockups are in the design kit (01, 02, 05, 07).

Fixes judged (stage 1.3):
- **Fix 1: Room 03 arrows attached to the key.** The two arrows start at the key's underside and end at circles B and C.
- **Fix 2: Room 02 line ends and 768 size.** The lines end at the figures' edges, the triangle is closed, and at 768
  the portraits are the same size as at 390 (82.5 / 87.9 / 79.5 px, measured).
- **Fix 3: C secondary on the board and result only.** C is smaller than A and B on the level board and the result
  (measured 0.70 to 0.85 of each in the run). In Room 02, C is not shrunk (scale within 5% of A).
- **DPR and clipping:** minimum natural/rendered ratio 2.90 (unchanged assets); no clipping or horizontal overflow in any image.

Separation of defects from design differences:
- **Factual defects found: none in these images.**
- **OPEN (known, not fixed):** at 1024 px the Room 02 portraits are about 83% of their 390 width (A 68.5 vs 82.5 px).
  Not visible in the 13 widths shot here (390, 768, 1440); measured separately (CHECKS.md).
- **Accepted design differences** (not defects): see the list below.

Accepted design differences vs the mockups:
- Level board "Has" icons are about 38px; mockup 02 shows them larger.
- Navigation is title case; mockup 01 uses capitals.
- At 390px each room is a tall card with its art on top; mockup 07 shows compact rows.
- The heading reads "LEVEL 01" above "You First"; mockup 07 reads "01 · You First".
- The design-preview notice sits under the header, not in it (mockup 01).
- The result omits "Preview Room 02" and "Continue the design demo" (out of scope).
- No 768px mockup exists; 768 layouts are extrapolations.

| File | Fix 1 (Room 03 arrows) | Fix 2 (Room 02 / 768) | Fix 3 (C secondary) | Other criteria | Verdict |
|---|---|---|---|---|---|
| rooms-1440.png | Arrows start at the key underside, no gap, no crossing of B/C letters | Lines end at figure edges; triangle closed; no line through a face | Room 02 C at full scale (not shrunk) | No plate, no clipping | PASS |
| rooms-1440-2x.png | As rooms-1440 at 2x; arrowheads land on the circles | As rooms-1440 | As rooms-1440 | At 2x the speckled lower edges of B and C read as painted texture, no halo | PASS |
| rooms-768.png | Arrows attached to key; circles B and C below | Room 02 same size as at 390; lines to figure edges | Room 02 C at full scale | No overflow | PASS |
| rooms-390.png | Arrows attached; small but connected | Room 02 closed, portraits same size as 768 | Room 02 C at full scale | Figures complete | PASS |
| menu-open-390.png | Not in view | Not in view | Not in view | Panel readable; Close visible | PASS |
| level-one-1440.png | n/a | n/a | C visibly smaller than A and B on the board | A's ruffle readable; key and coin distinct | PASS |
| level-one-768.png | n/a | n/a | C smaller on the board | Portraits complete | PASS |
| level-one-390.png | n/a | n/a | C smaller on the board | Figures recognisable | PASS |
| level-one-review-1440.png | n/a | n/a | C smaller on the board | Review legible | PASS |
| level-one-review-768.png | n/a | n/a | C smaller on the board | No overflow | PASS |
| level-one-review-390.png | n/a | n/a | C smaller on the board | Buttons full width | PASS |
| level-one-result-1440.png | n/a | n/a | C smaller in the result (secondary) | Key (A before, B after) and coin (A after, B before) distinct | PASS |
| level-one-result-1440-2x.png | n/a | n/a | C smaller in the result | Holding icons show clear key and coin shapes at 2x | PASS |
| level-one-result-768.png | n/a | n/a | C smaller in the result | Icons legible | PASS |
| level-one-result-390.png | n/a | n/a | C smaller in the result | Legible; no overflow | PASS |

Summary: 15 of 15 PASS. Fixes 1 to 3 are judged visually as met at the widths shown. Fix 1 has no measurement and fix 2
has only the Room 02 width measurements. The 1024 px open item is not in these images.
