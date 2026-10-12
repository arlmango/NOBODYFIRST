# Final run record: stage 1.3 (composition corrections)

## Versions and date
- node: v22.22.3
- npm: 10.9.8
- date (UTC): 2026-10-12, the run started about 03:42 UTC (see versions.txt)
- Browser: Chrome via playwright-core 1.64.0

## Why this run
Stage 1.3 changed the composition only: Room 03 arrows anchored to the key silhouette; Room 02 line ends and a larger
768 art column; observer C scaled to 0.82 on the board and result. Changed files: src/screens/{Rooms.tsx, rooms.css,
level-one.css}, src/styles/components.css, src/assets/PROVENANCE.md. PNG assets, demo logic, copy and routes are unchanged.

Test-side changes in this round:
- Stale comment on the Room 02 check corrected (it tests opaque figure pixels, not bounding boxes).
- New light regression checks (scripts/e2e/flows-geometry.mjs): observer ratio on the board and result at 390, 768
  and 1440 (C/A and C/B between 0.70 and 0.85); Room 02 C not shrunk at 1440 (scale within 5% of A); Room 02
  portraits at 768 at least 0.95x their 390 width.

## Attempts in this round (for transparency)
1. The first full run stopped with an uncaught error in the new 768-vs-390 check: the 390 measurement returned its
   promise without awaiting it, so the page closed first. Script bug, not an app defect. Fixed with `return await`.
2. The whole set was run again after the fix (113 of 113). This was a script change after a failure, so a full
   re-run was required.

## Which results are new for this version
All 113 checks, the vitest, tsc, build and node-check results, and all 15 screenshots were produced by this run.
None were reused from the stage 1.2 run. Vitest (26) was run and passed; its results do not depend on the Room 02
change, but it was run anyway because it was cheap.

## Runs
Logs and screenshots were removed first with literal file names, then rewritten by this run.

| Step | Command | Log | Result | Exit |
|---|---|---|---|---|
| Unit tests | `npx vitest run --reporter=verbose` | vitest.log | 1 file, 26 tests passed (names in log) | EXIT=0 |
| Typecheck | `npx tsc --noEmit` | tsc.log | no errors | EXIT=0 |
| Build | `npx vite build` | build.log | dist written | EXIT=0 |
| Script syntax | `node --check` on run.mjs, lib.mjs, flows-extra.mjs, flows-assets.mjs, flows-geometry.mjs | node-check.log | all parse | EXIT=0 |
| Preview | `npx vite preview --port 4173 --strictPort` (background); stopped by kill; port 4173 confirmed free | preview.log | up after 2 s | EXIT=0 (stop record) |
| Browser checks | `node scripts/e2e/run.mjs` against the preview server | e2e.log | 113 of 113 PASS, 0 FAIL | EXIT=0 |
| Screenshots | written by the run | docs/screenshots/ | 15 files | - |

The preview EXIT line records the stop (kill). It is not a process exit code.

## Measurements
- Minimum natural/rendered ratio 2.90 over 60 rendered portraits and items (390, 768, 1440; rooms, board, result).
- Room 02 portrait rendered widths (CSS px, one-off script on the same build): 390 A 82.5 / B 87.9 / C 79.5;
  768 same; 1024 A 68.5 / B 73.0 / C 66.0; 1280 A 86.4 / B 92.0 / C 83.2; 1440 A 90.5 / B 96.4 / C 87.2.

## OPEN item
At 1024 px the Room 02 portraits are smaller than at 390 (about 83%). At 1280 px they are larger again. Not fixed in
stage 1.3 (out of scope). Only 1024 and 1280 were measured; widths in between were not swept.

## Not run
- Room 03 arrowhead size below 760px, and Room 03 arrow attachment to the key: not measured by the script (NOT RUN).
  Checked by eye only.

## Hashes
`docs/evidence/MANIFEST.sha256` (src/** including PNG assets and PROVENANCE, scripts/**, configs, .gitignore, README,
docs/CHECKS.md, docs/screenshots/*.png, characters-and-items.png) and `docs/evidence/EVIDENCE.sha256` (this folder's
logs, RUN.md, SCREENSHOT-REVIEW.md and the manifest) were generated LAST, after the final README, CHECKS and RUN edits.
Any later edit to a listed file invalidates its hash. `manifest-verify.log` holds `shasum -a 256 -c` output for both files with EXIT.

## Post-review doc corrections (2026-10-12, after the final run)
- Date: 2026-10-12 (UTC). Edits made after the run: README run date corrected from 2026-10-11 to 2026-10-12; escaped
  backticks fixed in docs/CHECKS.md (screenshots line and two "Other checks" rows); the comment in
  scripts/e2e/flows-extra.mjs now reads "figure pixels (PNG alpha > 24)" instead of "opaque figure pixels".
- No code, no screenshot, and no test result changed. The e2e run is not repeated. node --check was re-run on all five
  scripts and appended, with a dated note, to docs/evidence/node-check.log (all OK, EXIT=0). The other logs are unchanged.
- OPEN item, Room 02 at 1024 to about 1143 px: the portraits are below 0.95x their 390 px size. Worst is 0.83 at 1024 px;
  ratio 0.90 at 1096 px; 0.95 at about 1144 px; 1.0 at about 1190 px (reviewer's 8 px sweep). Not fixed (out of scope).
- Observer C in Level 1 (values from the review, not re-measured in this note): C is 25.9% smaller than B and 21% smaller
  than A on the board. Both sit inside the 0.70 to 0.85 band the browser checks enforce (C/A and C/B).
