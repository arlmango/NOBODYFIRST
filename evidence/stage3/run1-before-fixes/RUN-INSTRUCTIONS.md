# Reproduce the stage 3 Local chain E2E

Run from the project root (/Users/mango/NOBODYFIRST). Requires contracts/.tools/bin/{forge,cast,anvil}, node_modules, and Google Chrome (playwright-core channel "chrome").

The full run is stateful: each player account can start one run, and the chain must be fresh. Start from a fresh Anvil every time.

```bash
# 1. chain (writes contracts/deployments/local-anvil.json)
node scripts/chain/local-chain.mjs stop          # no-op if nothing runs (safe)
node scripts/chain/local-chain.mjs start         # Anvil on 127.0.0.1:8545
node scripts/chain/local-chain.mjs deploy

# 2. checks and production build
npx tsc --noEmit
npx vitest run
npx vite build

# 3. preview (serves dist and /local-deployment.json on 127.0.0.1:4173)
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort &

# 4. E2E (all scenarios S1..S10 in order; S8 restarts Anvil and redeploys)
node scripts/chain/e2e/run.mjs > evidence/stage3/logs/e2e-run.log 2>&1

# 5. cleanup: stop the preview you started (kill <pid>) and
node scripts/chain/local-chain.mjs stop
```

Re-running a subset (`node scripts/chain/e2e/run.mjs S4`) only works on a chain where the chosen accounts are unused (accounts are index 1..9, one run each). After a partial run, restart from step 1.

Outputs: evidence/stage3/e2e-results.json, state-before-after.md, receipts/*.json, screenshots/*.png, logs/cast-commands.log (each cast command with EXIT), logs/S8-*.log, logs/e2e-run.log.

Account map: S1 1, S1b 1 (reload), S2 2, S3 1/3/4/5, S4 8, S5 6, S6 9, S7 7. S8 uses account 1 on a fresh chain.

Substitutions (artificially induced conditions): S6 page.route abort of http://127.0.0.1:8545/**; S7 an external real cast send of the same execute(); S8 a restored previous manifest copy and Anvil stop/start; S3 part 2b automine off and manual evm_mine.
