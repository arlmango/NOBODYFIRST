# Local chain (Anvil) — stage 3 tooling

All commands run from the repo root. Foundry binaries are the pinned local copies in `contracts/.tools/bin/`.
Forge's cache goes to `~/.foundry/cache/nobodyfirst-stage3` (via `FOUNDRY_CACHE_PATH`).

```bash
node scripts/chain/gen-abi.mjs              # forge build + write src/chain/abi.generated.ts (--no-build skips forge)
node scripts/chain/local-chain.mjs start    # Anvil on 127.0.0.1:8545 (--port N); refuses if the port is busy
node scripts/chain/local-chain.mjs deploy   # unchanged Level1Deployer from unlocked Anvil account 0; writes manifest
node scripts/chain/local-chain.mjs status   # JSON: anvil running, pid, manifest present/valid against live chain
node scripts/chain/local-chain.mjs stop     # stops ONLY the PID in scripts/chain/.run/anvil.pid (verified as our anvil)
```

- Exit codes: `0` ok, `1` failed check or operation, `2` refused (precondition, foreign process, busy port).
- Last stdout line is always JSON.
- `start`, `deploy` (on failure) and `stop` delete `contracts/deployments/local-anvil.json` so the UI never reads a stale manifest.
- `deploy` always creates a new deployment; it never reuses an earlier manifest.
- Runtime files: `scripts/chain/.run/anvil.pid` and `anvil.log` (the Anvil log contains Anvil's dev keys; do not copy it anywhere).

## E2E provider

`scripts/chain/test-provider.js` is a TEST-ONLY EIP-1193 object (not a wallet). Inject it with
`page.addInitScript({ path })` after setting `window.__NF_TEST_RPC` to a loopback Anvil URL.
It forwards allow-listed JSON-RPC to Anvil's unlocked accounts; it holds no keys and refuses signing methods.

`window.__nfTestProvider` hooks: `authorize()`, `setAccountIndex(i)`, `setChainId(hexOrNumber)`,
`rejectNext(method?)`, `failRpc(bool)`, `disconnect()`, `clearLog()`, `getState()`,
and the live arrays `sentTransactions` (hashes) and `requestLog` (method names).
`window.__NF_TEST_PREAUTH === true` pre-authorises the page; otherwise `eth_requestAccounts` must be called.

## E2E (Local chain, browser)

`node scripts/chain/e2e/run.mjs` runs S1..S10 against a fresh Anvil and the production preview (see `evidence/stage3/RUN-INSTRUCTIONS.md`). Chrome via playwright-core channel `chrome`; the test provider is injected per page with `addInitScript`. Results go to `evidence/stage3/e2e-results.json`.

S12b is PASS with limitation: an identical execute with a higher fee shows the confirmed result and the mined replacement hash; the proof panel's Replacement group shows 'Original hash'. There is no visible replaced notice.
