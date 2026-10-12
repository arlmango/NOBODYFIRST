# Reproduce the stage 3 Local chain E2E (final: round 4)

Run from the project root (/Users/mango/NOBODYFIRST). Requires contracts/.tools/bin/{forge,cast,anvil}, node_modules, Google Chrome (playwright-core channel "chrome").

Each player account has one run and the chain must be fresh, so always start from a fresh Anvil.

```bash
npx tsc --noEmit
npx vitest run
npx vite build

node scripts/chain/local-chain.mjs stop      # safe if nothing runs
node scripts/chain/local-chain.mjs start     # Anvil 127.0.0.1:8545
node scripts/chain/local-chain.mjs deploy    # writes contracts/deployments/local-anvil.json

node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort &   # note the PID

node scripts/chain/e2e/run.mjs > evidence/stage3/logs/e2e-run.log 2>&1   # S1..S12b in order; exit code 1 if any scenario FAILs

kill <preview-pid>                            # the preview you started
node scripts/chain/local-chain.mjs stop
```

FINAL RERUN COMMAND (preview already running on 127.0.0.1:4173):
`node scripts/chain/local-chain.mjs stop; node scripts/chain/local-chain.mjs start && node scripts/chain/local-chain.mjs deploy && node scripts/chain/e2e/run.mjs`

Single scenario: `node scripts/chain/e2e/run.mjs S7` (fresh chain required; accounts are used once per chain).

## Which run each result comes from

- **Round 4 full run (final):** logs/r4-e2e-run.log, fresh deploy (logs/r4-00..02). Results for S1-S11 in evidence/stage3/e2e-results.json.
- **Round 4 re-run of S12 and S12b:** logs/r4-s12-run.log, fresh deploy (logs/r4-s12-00..02). These replace S12 and S12b in e2e-results.json. Reason: the replacement-group assertions were adapted to the new Replacement group layout.
- **Round 2 full run:** previous-runs/round2-full-run/e2e-run.log (kept as is). In that run S7 FAILED under the old strict assertion (it expected a stale-preview heading). The orchestrator decided the expected outcome is the already-solved restored result with no UI send. S7 was then re-run in round 3 and passed (logs/r3-s7-run.log).
- **Round 3 merged results:** previous-runs/round3-merged/e2e-results.json (the earlier results file, redacted to the 16-hex prefix).
- **Pre-fix baseline:** run1-before-fixes/ (first full run, before the round-2 app fixes; kept for history, redacted).
- Chain and setup logs: logs/00-*, 01-*, 02-* (round 1), logs/r2-* (round 2), logs/r3-* (round 3), logs/r4-* (round 4). Cast commands: logs/cast-commands.log (last full run). Scenario logs: logs/S8-*.log, logs/S11-*.log.

## Account map (index 0 = deployer)

S1 1 (S1b reload 1), S2 2, S3 1/3/4/5, S4 8 (no run), S5 6, S6 9, S7 7, S8 1 (fresh chain after restart), S11 8 (preview-ready) and 3 (no run), S12 5 (cancellation), S12b 5 (identical replacement, same run as S12).

## Substitutions (artificially induced conditions)

- S6: Playwright page.route abort of http://127.0.0.1:8545/**.
- S7: a real execute() sent with cast send --unlocked from account 7 before the UI click.
- S8 and S11: Anvil stop, start and deploy under open pages; S8 also restores a previous manifest copy.
- S3 part 2b, S12, S12b: automine off with manual evm_mine.
- S12: cancellation (self-send, same nonce, 2x fees). S12b: identical execute with the same nonce and 2x fees.

## Scan needle (S9)

The scan uses the 16-hex prefix of the public Anvil account-0 test key (not the full key). See README-REDACTION.md.
