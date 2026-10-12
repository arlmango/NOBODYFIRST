# Stage 4 — public demo deployment record

| Item | Value |
|---|---|
| Public URL (production alias, no login) | https://nobody-first.vercel.app |
| Vercel account / team | robertdipolson-3358 / robertdipolson-3358's projects (hobby) |
| Project | nobody-first (new, created for this deployment; id prj_7Datm7axhBScx4pTrJQjUs9uWD47) |
| Deployment ID | dpl_3MB153Tdgdx424e7dAYHXpcmc4nj (target production, status Ready) |
| Deployment URL (protected by Vercel Authentication) | https://nobody-first-c6bluual2-robertdipolson-3358s-projects.vercel.app |
| Created | 2026-10-12 22:55 +05:00 (17:55 UTC) |
| Earlier deployment of the same project (superseded) | nobody-first-6bjp780n8-… (first upload; `cleanUrls` made paths such as /room/1 return 404; replaced by the deployment above) |
| Source version (`sourceId`) | a8fcbd9dfd0bda1a8f02132fac03e7d3fda51be553453601878e401fca3b1a6c (see build/public-staging.manifest.json) |
| Build command (local) | `npm run build:public` = `tsc --noEmit && vite build --mode public` (exit 0), staged by `node scripts/public/stage.mjs` |
| Uploaded content | exactly 9 files from build/public-staging/ (index.html, vercel.json, assets/* — 2,124,329 bytes); sha256 compared with the staging manifest before upload and again against the files served by the production URL |
| Vercel project type | static upload, no framework preset, no build/install step, no environment variables |

Verification from a fresh unauthenticated browser session against https://nobody-first.vercel.app:
`evidence/stage4/screenshots-production/results.json` (136 checks passed) and clean re-shoot with image/animation
settling in `evidence/stage4/screenshots-production-final/` (1440 and 390 px: rooms, level, review, result).
Served files equal the staging manifest (8 content files sha256-identical). Requests: same origin only;
console: no errors or CSP reports.

Deployment protection: the project uses Vercel's default Vercel Authentication. It applies to the
deployment-specific URL and the team alias (they answer 302 to a Vercel login); the production alias
nobody-first.vercel.app is open. No protection setting was changed. Share only https://nobody-first.vercel.app.
