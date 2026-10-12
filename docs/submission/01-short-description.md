# 01. Short description (English, ready to paste)

Reviewer notes (Evidence: lines, local paths) are for verification; do not paste them into the portal.

## Tagline (one sentence)

Two promises, one observer, nobody goes first: one atomic deal satisfies everyone, or nothing moves.

Evidence: site text "Two people. Two promises." (built page at `https://nobody-first.vercel.app`); `contracts/SPEC.md` (two offers, one observer NPC_C with no offer); the three-person circle is the level-2 idea in `/Users/mango/Downloads/NOBODY_FIRST_handoff_RU.txt` section 6, not built.

## Description (under 280 characters)

NOBODY FIRST is a browser puzzle about promises that only work together: two characters trade only if each gets what they need; a third watches. The public demo is a simulation with no blockchain transaction. A Solidity prototype settles the deal atomically, tested locally.

Evidence: public demo notice "Interactive demo · No blockchain transaction is sent." (built page at `https://nobody-first.vercel.app`); `contracts/SPEC.md` (offers A1 and B1, observer C); `evidence/stage4/DEPLOYMENT.md` (static public build); `evidence/stage3/RUN-INSTRUCTIONS.md` (local EVM run).

## Description (about 100 words; 101 words)

NOBODY FIRST is a short browser puzzle about promises that only work together. Two characters trade only if each gets what they need, and nobody wants to go first. A third character only watches and must end with nothing changed. The public demo lets you select promises, preview the exchange and run level 1 as a browser simulation; no blockchain transaction is sent. The repository also holds a Solidity prototype that settles the deal in one transaction or not at all. It is tested on a local EVM only, is not deployed publicly, and levels 2 and 3 are not built.

(101 words.)

Evidence: `contracts/SPEC.md` (offers and observer); `evidence/stage4/DEPLOYMENT.md` (public build, static); `contracts/README.md` line 3 (levels 2 and 3 not in scope); `contracts/evidence/contracts/GUARANTEES.md` section 1 (guarantees limited to the Level1Deployer set).

## Test count disclosure (use with any test figure)

The 77 Solidity tests in 7 suites include 3 toolchain smoke tests (`contracts/test/ToolchainSmoke.t.sol`). The other 74 test NOBODY FIRST rules.

Evidence: `contracts/evidence/contracts/tests.log` line 309 (77 passed); `contracts/test/ToolchainSmoke.t.sol` (3 `function test`).
