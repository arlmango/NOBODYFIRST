# Public demo staging

Scripts in this folder turn `npm run build:public` (output `dist-public/`) into a static upload set
for a Vercel static project. No server build, no environment variables.

| Script | Purpose |
| --- | --- |
| `stage.mjs` | Runs `npm run build:public` (abort on failure), recreates `build/public-staging/` with only `dist-public/` contents plus `vercel.json`, writes `build/public-staging.manifest.json`, then runs `verify-staging.mjs`. |
| `verify-staging.mjs` | Static checks on the staging dir (exact file set, forbidden paths and strings, absolute URLs, notice and description, manifest match). Writes `evidence/stage4/staging-verification.{json,log}`. |
| `vercel.json.template` | Static-site config: clean URLs, SPA-style rewrite, security headers, CSP, cache rules. |
| `serve-static.mjs` | Local static server on `127.0.0.1:4176` for checks before deployment. Applies the same rewrite and headers as `vercel.json`. |
| `verify-site.mjs <baseUrl>` | Browser checks (playwright-core, Chrome channel, fresh contexts) at 1440 and 390 px. Writes `<out>/results.json` and screenshots. |

Commands:

```bash
node scripts/public/stage.mjs
node scripts/public/serve-static.mjs --port 4176 &   # PID to be stopped afterwards
node scripts/public/verify-site.mjs http://127.0.0.1:4176 --label local
```

Deployment itself is done by the orchestrator only. Generated output (`dist-public/`,
`build/public-staging/`, `.vercel/`) is gitignored.
