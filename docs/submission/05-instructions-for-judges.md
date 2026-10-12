# 05. Instructions for judges (English, ready to paste)

Reviewer notes (Evidence: lines, local paths) are for verification; do not paste them into the portal.

Read this first: the public site is a browser simulation of level 1. It sends no blockchain transaction, and no contract is deployed to any public network. The Solidity prototype was tested on a local EVM (Anvil) only.

## 1. A 60-second path on the public site

Open https://nobody-first.vercel.app in a desktop browser.

1. **Rooms page.** You should see the notice "Interactive demo · No blockchain transaction is sent." Room 01 has an "Enter room" button. Rooms 02 and 03 are marked "Coming soon".
2. Click **Enter room** (Room 01).
3. Tick both **Select promise** checkboxes, one for each promise. Until both are ticked, the page says "Select both promises to preview the exchange."
4. Click **Preview exchange**. The page says "Preview ready. Nothing has moved yet."
5. Click **Run demo exchange**. The result says "No blockchain transaction was sent. Everyone kept their promise."
6. **Reset demo** clears the browser simulation so you can run it again. It does not touch any contract, because the public build has none. **Back to rooms** returns to the rooms page.

Evidence: the strings above are in the built page at https://nobody-first.vercel.app (its JavaScript bundle under `/assets/`); `evidence/stage4/screenshots-production/results.json` (136 checks against this site); `evidence/stage4/DEPLOYMENT.md`.

## 2. Running the Solidity tests and the local-chain demo yourself

These steps were run by the project team on a macOS arm64 machine with Node.js v22.22.3. **They were not run from a clean clone.**

### Setup after cloning (not yet verified from a clean clone)

A clone does not contain the toolchain or the test library, because `.gitignore` excludes `contracts/.tools/` and `contracts/lib/`. Set them up as follows (sources and checksums are from `contracts/evidence/env/README-ENV.md`):

1. **Foundry v1.8.5** (forge, cast, anvil). Download the release tarball from the foundry-rs/foundry GitHub release v1.8.5. Its sha256 must be `56049728e25e44a61c7f2e49438023b0890cb45850ffcb7c882f90cd998baf83`. Extract `forge`, `cast` and `anvil` into `contracts/.tools/bin/`.
2. **solc 0.8.37.** Download the 0.8.37 build from the Solidity binaries list. Its sha256 must be `a27396e7732aa52e80ff89ad7bd8a2e46fec2a6dcc4ef20cd16e5e0c502d6821`. Place it at `contracts/.tools/solc/solc-0.8.37` (the path in `contracts/foundry.toml`).
3. **forge-std v1.17.0** at commit `f3dae6e6ee381f25eb6a246f7da9b85c91a68219`:
   ```bash
   git clone --depth 1 --branch v1.17.0 https://github.com/foundry-rs/forge-std contracts/lib/forge-std
   git -C contracts/lib/forge-std rev-parse HEAD   # expect f3dae6e6ee381f25eb6a246f7da9b85c91a68219
   ```
4. **Frontend dependencies:** `npm install` at the repository root.

Check the toolchain with `contracts/.tools/bin/forge --version` (expect 1.8.5).

Caveats: the team's binaries are macOS arm64 builds. Forge also writes `~/.foundry/cache/signatures`, outside the project. The local-chain tooling sets its cache to `~/.foundry/cache/nobodyfirst-stage3`. Both are known writes outside the project, and the team has not found a documented way to move them.

Evidence: `contracts/evidence/env/README-ENV.md` (tarball, solc and forge-std sources and checksums; the attestation and verification steps); `contracts/foundry.toml` (`solc = "./.tools/solc/solc-0.8.37"`, `offline = true`, `remappings = ["forge-std/=lib/forge-std/src/"]`); `.gitignore` (`contracts/.tools/`, `contracts/lib/`); `contracts/evidence/contracts/versions.txt` (toolchain versions, arm64); `contracts/evidence/contracts/GUARANTEES.md` section 8 (cache write); `scripts/chain/README-chain.md` (cache path).

### A. Solidity tests (77 tests, 7 suites; 74 for NOBODY FIRST, 3 toolchain smoke tests)

From the repository root:

```bash
cd contracts
./.tools/bin/forge build --force
./.tools/bin/forge test -vv
```

Expected result: "Ran 7 test suites ... 77 tests passed, 0 failed, 0 skipped". The team's log of this result is in `contracts/evidence/contracts/tests.log` (line 309).

Evidence: `contracts/README.md` (commands); `contracts/evidence/contracts/tests.log` line 309; `contracts/test/ToolchainSmoke.t.sol` (3 tests).

### B. Local-chain browser demo (14 scenarios)

This runs the development build against a local Anvil chain on 127.0.0.1:8545 and a preview server on 127.0.0.1:4173. It uses a test-only provider, not a real wallet. Each Anvil account can start one run, so always start from a fresh chain. It needs the toolchain from section 2 setup and Google Chrome.

```bash
npx tsc --noEmit
npx vitest run
npx vite build

node scripts/chain/local-chain.mjs stop
node scripts/chain/local-chain.mjs start
node scripts/chain/local-chain.mjs deploy
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort &   # note the PID
node scripts/chain/e2e/run.mjs > evidence/stage3/logs/e2e-run.log 2>&1
kill <preview-pid>
node scripts/chain/local-chain.mjs stop
```

Expected result: each scenario prints PASS, and the script exits with code 1 if any scenario fails. The team's saved results are in `evidence/stage3/e2e-results.json` (combined: 14 scenarios PASS).

Known history: the round-4 full run ended with `== S12b FAIL` (`evidence/stage3/logs/r4-e2e-run.log`, `EXIT=1`). S12 and S12b were re-run with adapted checks and passed (`evidence/stage3/logs/r4-s12-run.log`, `EXIT=0`). A single run from scratch may therefore show a failure in S12b.

Note: `npm install` is not in `evidence/stage3/RUN-INSTRUCTIONS.md`, but the scripts need `node_modules`. The `deploy` step writes `contracts/deployments/local-anvil.json`, which is ignored by `.gitignore`.

Evidence: `evidence/stage3/RUN-INSTRUCTIONS.md` (the commands, the fresh-chain rule, the account map); `scripts/chain/README-chain.md` (test-only provider, exit codes); `evidence/stage3/e2e-results.json`; `evidence/stage3/logs/r4-e2e-run.log`; `evidence/stage3/logs/r4-s12-run.log`; `.gitignore` (line 30 un-ignores `evidence/**/*.log`; `contracts/deployments/` is ignored).

### C. Public-site checks (optional)

```bash
node scripts/public/verify-site.mjs https://nobody-first.vercel.app
```

Evidence: `scripts/public/verify-site.mjs`; `evidence/stage4/screenshots-production/results.json` (the team's saved run, 136 checks).

## 3. Where the evidence lives

Evidence files are in the working tree and are not ignored by `.gitignore` (line 30 `!evidence/**/*.log`). A clone contains them only after the owner commits them. Do not look for them in `scripts/chain/.run/`: that folder holds Anvil's runtime files, which stay ignored and are not evidence.

- **Contracts:** `contracts/src/` (code), `contracts/test/` (tests), `contracts/SPEC.md` (interface spec).
- **Contract evidence:** `contracts/evidence/contracts/`. Start with `GUARANTEES.md` (trust boundary and limits), then `tests.log`, `sizes.log`, `latefail-README.md`.
- **Toolchain setup record:** `contracts/evidence/env/README-ENV.md`.
- **Browser and local-chain evidence:** `evidence/stage3/` (`RUN-INSTRUCTIONS.md`, `e2e-results.json`, and `logs/`).
- **Public-site evidence:** `evidence/stage4/` (`DEPLOYMENT.md`, `screenshots-production/results.json`, and `screenshots-production-final/` with 8 PNG screenshots).
- **Frontend unit tests:** `evidence/stage3/logs/r4-04-vitest.log` (126 tests).

Evidence: the paths above, each checked to exist in the working tree; `.gitignore` line 30.

## 4. What not to expect

- No contract on any public testnet or mainnet, and no public contract address.
- No transaction on the public site. No wallet connection there.
- No levels 2 and 3. Rooms 02 and 03 show "Coming soon".
- No security audit. Separate AI review agents checked the contracts and tests during development, including a 31-mutant run (30 detected) and a manual local Anvil replay. This is not a security audit, and no human security review has been done.
- No way to reset a run in the contracts. Each player address has one run.
- The Anvil results come from a local chain (chainId 31337), not from a public network.
- The public demo does not show the on-chain part of the project. To see the contract rules, use the local steps in section 2.

Evidence: `contracts/evidence/contracts/GUARANTEES.md` (section 6); `contracts/README.md` lines 61-70 ("Known limits": "Not an audit. No security review has been done.", one run per player, no reset, no levels 2 and 3); `evidence/stage4/DEPLOYMENT.md`.
