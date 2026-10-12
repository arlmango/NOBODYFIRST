# NOBODY FIRST

A puzzle about conditional promises. Three characters (A, B, C) take part in each room, and nobody wants to go first.
The player picks which promises to put into one package, and the package either settles completely or not at all.

**What level 1 ("You First") implements.** Two participants exchange conditional promises: A gives a key to B if B
gives a coin to A, and B gives a coin to A if A gives a key to B. The third character, C, is an observer: C takes
part in no transfer and must end with its holdings unchanged (C holds nothing). A true three-party exchange, where
all three characters trade, is **not implemented**; rooms 02 and 03 are only announced as "Coming soon".

**Public demo: <https://nobody-first.vercel.app>** (level 1 only, runs in the browser, no wallet, no blockchain).

## What exists, and what does not

There are two separate things in this repository. They are not connected in the public demo.

| | Browser simulation | Local contract prototype |
|---|---|---|
| What it is | The interactive level 1 in the browser. The rules run as plain TypeScript in the page (`src/demo`). | Solidity contracts (`contracts/`) and an optional "Local chain" mode of the development build. |
| Where it runs | The public site and `npm run dev`. | Only on a developer machine, on a local Anvil chain (`127.0.0.1:8545`, chain ID 31337). |
| Blockchain | **None.** No transaction is sent. | Local EVM only. No public network or testnet. |
| Result | A simulated result shown in the page. A reload resets it. | A result read back from the contracts after a real local transaction. |
| Verified by | Browser checks in [scripts/e2e](scripts/e2e/run.mjs); public site checks in [scripts/public](scripts/public/README-public.md). | 77 Foundry tests (3 toolchain smoke tests + 74 level 1 tests); local-chain browser scenarios in [scripts/chain/e2e](scripts/chain/e2e/run.mjs). |

The public site is the simulation only. Local chain code is removed from the public bundle at build time.

### Limitations

- Only level 1 is playable. Rooms 02 and 03 are shown as "Coming soon".
- No contracts are deployed to a public network or testnet. The Solidity prototype has been tested locally only.
- The prototype has not been independently audited. Its trust boundary is described in
  [contracts/evidence/contracts/GUARANTEES.md](contracts/evidence/contracts/GUARANTEES.md).
- The Local chain mode needs a wallet-like EIP-1193 provider and a local Anvil with a fresh deployment; it is not part
  of the public demo.
- Accessibility conformance has not been tested or claimed.

## Repository status

- GitHub repository: `arlmango/NOBODYFIRST`. It is **private**.
- First published commit: `0daf26d` on `main`.
- Access for the hackathon judges is **not yet confirmed**.
- There is no `LICENSE` file yet. The Solidity sources carry `SPDX-License-Identifier: MIT` headers.

## Run it locally

Requirements: Node.js (checked with v22.22.3) and npm. Google Chrome is needed only for the browser checks.

```bash
npm install
npm run dev              # Vite dev server on http://127.0.0.1:5173 (Demo and Local chain modes)
npm run typecheck        # tsc --noEmit
npm test                 # vitest run: 126 frontend tests (26 demo + 100 Local chain integration)
npm run build            # typecheck, then vite build into dist/ (includes the optional Local chain mode)
npm run preview          # serves dist/ on http://127.0.0.1:4173
```

Public build (the one deployed to the demo URL):

```bash
npm run build:public     # typecheck, then vite build --mode public into dist-public/
npm run preview:public   # serves dist-public/ on http://127.0.0.1:4174
npm run stage:public     # builds, stages dist-public/ + vercel.json into build/public-staging/, checks the file set
npm run verify:site -- <base-url>   # browser checks of a running site (Chrome via playwright-core)
```

Details: [scripts/public/README-public.md](scripts/public/README-public.md); deployment record: [evidence/stage4/DEPLOYMENT.md](evidence/stage4/DEPLOYMENT.md).

### Browser checks of the simulation

Build and preview first, then in another terminal:

```bash
node scripts/e2e/run.mjs
BASE_URL=http://127.0.0.1:5173 node scripts/e2e/run.mjs   # against the dev server instead
```

The script prints a PASS or FAIL line per check and exits 1 on any failure. The status of each check is
tracked in [docs/CHECKS.md](docs/CHECKS.md).

### Contracts (local EVM)

The Foundry toolchain is **not** part of a clone (`contracts/.tools/` and `contracts/lib/` are git-ignored).
Install Foundry 1.8.5, solc 0.8.37 and forge-std v1.17.0 first; see
[docs/submission/05-instructions-for-judges.md](docs/submission/05-instructions-for-judges.md) and
[contracts/evidence/env/README-ENV.md](contracts/evidence/env/README-ENV.md).
Then, from `contracts/`, follow [contracts/README.md](contracts/README.md): 77 tests in 7 suites (3 toolchain smoke
tests and 74 level 1 tests), including the late-failure rollback proof. The trust boundary and guarantees are in
[contracts/evidence/contracts/GUARANTEES.md](contracts/evidence/contracts/GUARANTEES.md); the test log is
[contracts/evidence/contracts/tests.log](contracts/evidence/contracts/tests.log).
Foundry writes a cache under `~/.foundry/cache` outside the project.

### Local chain mode (optional)

Runs the existing level 1 screen against the contracts on a local Anvil. Commands and the test-only
provider are described in [scripts/chain/README-chain.md](scripts/chain/README-chain.md); the reproduction steps of
the recorded run are in [evidence/stage3/RUN-INSTRUCTIONS.md](evidence/stage3/RUN-INSTRUCTIONS.md)
(results: [evidence/stage3/e2e-results.json](evidence/stage3/e2e-results.json)).

```bash
node scripts/chain/local-chain.mjs start    # Anvil on 127.0.0.1:8545
node scripts/chain/local-chain.mjs deploy   # writes contracts/deployments/local-anvil.json (git-ignored)
npm run dev                                 # open the "Local chain" mode (#/local)
node scripts/chain/local-chain.mjs stop
```

## Project structure

```
src/
  main.tsx, App.tsx        entry point and hash routing (demo `#/`, local chain `#/local`)
  components/              Header, DemoNotice, ModeSwitch, ProofPanel, Portrait, ItemIcon, ...
  screens/                 Rooms, LevelOne (simulation), LevelOneChain (Local chain mode)
  demo/                    pure TypeScript simulation logic and its unit tests, no React
  chain/                   Local chain controller, deployment checks, error decoding (+ unit tests)
  assets/                  portraits and item icons (PROVENANCE.md)
contracts/                 Solidity prototype: src/, test/, evidence/, scripts/ (see contracts/README.md)
scripts/
  e2e/                     browser checks of the simulation
  chain/                   local Anvil tooling and Local chain browser scenarios
  public/                  public build staging, static server, site verification
evidence/                  stage 3 (local chain) and stage 4 (deployment) evidence
docs/                      CHECKS.md, screenshots, evidence of the design preview, submission/
```

## Submission package

[docs/submission/](docs/submission/README.md) holds the English texts and checklists prepared for the Crypto World's
Fair Hackathon (Colosseum): [index and open items](docs/submission/README.md),
[what is and is not built](docs/submission/04-implemented-and-limits.md),
[instructions for judges](docs/submission/05-instructions-for-judges.md),
[form answers](docs/submission/06-form-answers.md),
[requirements matrix](docs/submission/09-requirements-matrix.md).
Items that need the team (registration, repository access, videos, track, licence) are marked there.

## Demo state

- The simulation keeps its state in memory only. Nothing is written to `localStorage`, cookies or a server.
- A page reload resets the simulated run. A demo success is never treated as real progress.
- Local chain mode restores its state only from the contracts; the only browser storage it uses is a record of a
  pending transaction hash.
