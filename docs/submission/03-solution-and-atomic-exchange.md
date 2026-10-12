# 03. Solution and how the atomic exchange works (English, ready to paste)

Reviewer notes (Evidence: lines, local paths) are for verification; do not paste them into the portal.

## The rules of level 1

Three characters start with: A holds 1 KEY, B holds 1 COIN, C holds nothing.

- **A's promise (offer A1):** A gives 1 KEY to B, if B gives 1 COIN to A. A is satisfied only if A ends with 1 COIN and no KEY.
- **B's promise (offer B1):** B gives 1 COIN to A, if A gives 1 KEY to B. B is satisfied only if B ends with 1 KEY and no COIN.
- **C's promise:** C takes no part. C must not receive or send anything, and must end with nothing.

The player chooses which promises to combine. Each character either uses its promise or does nothing. The only combination that satisfies all three is A1 together with B1, which is a closed loop.

Evidence: `contracts/SPEC.md` (sections on the NPCs and identifiers); `contracts/src/NPC_A.sol`, `contracts/src/NPC_B.sol`, `contracts/src/NPC_C.sol` (fixed terms, lines 8-26); `contracts/evidence/contracts/GUARANTEES.md` section 2 (the same terms).

## Pieces of the prototype

- **GameItems** is the ledger. It holds the balances per run and character and moves items only when a registered character calls it. No mint, no admin transfer.
- **NPC_A, NPC_B, NPC_C** are three separate contracts. Each holds its own fixed offer and checks any plan against its own rules. They share one base contract (`NpcBase`), and their rules are fixed at deployment.
- **AtomicCoordinator** takes a package (which offer each character uses) and runs the settlement.
- **Level1Deployer** creates the five contracts and checks each address against the address it predicted.

Evidence: `contracts/src/` (file list); `contracts/src/Level1Deployer.sol` lines 20-41 (creation order and address checks); `contracts/evidence/contracts/GUARANTEES.md` section 1.

## What a player's package does

1. The player chooses an offer for each character (or none).
2. The coordinator reads the current balances and computes the **snapshot hash**, a fingerprint of the run state and balances (fields listed below). It also checks the run's nonce. If the player's preview was made against an older state, the package is rejected as stale.
3. The coordinator derives every transfer from the chosen offers only. It does not accept transfers from the caller.
4. It simulates the final balances and checks that no character spends more than it holds at the start, and that the total of each item is unchanged.
5. Each character checks the whole plan against its own rules. If any one of them rejects, the transaction reverts.
6. **Prepare.** Each active character records a one-time permit containing the offer, the snapshot hash, and a **plan hash** (a fingerprint of the snapshot hash, the offers and the transfers). Preparation does not move items.
7. **Release.** The characters act in a fixed order. Each one deletes its permit first, then calls the ledger to make its transfer.
8. The coordinator checks that the final balances equal the simulated ones, that no permit is left, and that each character's goal is met. Then it marks the run solved and increments the nonce.

Evidence: `contracts/src/AtomicCoordinator.sol` lines 120-166 (`execute`: numbered steps in the comments); `contracts/src/NpcBase.sol` lines 147-151 (live check of the snapshot in `authorize`) and lines 163-167 (`release` deletes the permit before the ledger call); `contracts/evidence/contracts/GUARANTEES.md` section 2 (which checks each contract makes itself).

## Why a partial execution cannot persist

All of these steps run inside one EVM transaction. If any step reverts, every state change in that transaction is reverted, including transfers already made in the release loop, permit changes and the nonce update. The late-failure test forces the failure after the first character has already moved its item, and checks that the listed state fields (balances, grant flag, permits, run data, current snapshot hash) are identical before and after the call. The test covers those fields only.

Evidence: `contracts/test/Level1LateFailure.t.sol` (six tests; the fixture makes NPC B fail late); `contracts/evidence/contracts/latefail-README.md` (fields compared, and the boundary of the claim); `contracts/evidence/contracts/tests-by-suite-Level1LateFailure.log` ("6 passed").

## What "atomic" does and does not mean here

- **Does mean:** the success or failure of the whole package is one outcome. Either all transfers and the nonce update are committed, or none are.
- **Does not mean simultaneous.** The steps run one after another inside the transaction. The EVM has no parallel execution.
- **Does not mean free of cost.** A failed transaction can still consume gas on a network that charges for it.
- **Does not roll back the sender's account nonce.** The sender's transaction counter still advances, so a later transaction must use the next nonce.
- **Does not cover other contracts.** The guarantees hold only for the set created by `Level1Deployer`. Another contract with the same interface has none of them.
- **Does not check the snapshot independently inside each character's release.** Each character stores the snapshot and plan hashes it is given and compares them only for equality. The live balance check happens in `authorize`, and the coordinator recomputes the snapshot itself.

Evidence: `contracts/evidence/contracts/GUARANTEES.md` section 2 (trust boundary table: "takes as given" column) and section 6 (what the Anvil replay does and does not show); `/Users/mango/Downloads/NOBODY_FIRST_handoff_RU.txt` section 3 (gas and nonce note).

## Result of the local happy path

On a local Anvil chain, the saved transaction state after the successful `execute` shows the final balances in the order A.KEY, A.COIN, B.KEY, B.COIN, C.KEY, C.COIN as `[0,1,1,0,0,0]`, the run marked solved, and all permits cleared. This is one local run, not a public result.

Evidence: `contracts/evidence/contracts/anvil-deploy2/session.log` lines 110-127 (balances after execute; as cited in `contracts/evidence/contracts/happy-path-state.md`); `contracts/evidence/contracts/GUARANTEES.md` section 6.

## Snapshot and plan hashes, in one paragraph

The snapshot hash is a keccak256 fingerprint of: the contract's own address, the ledger address, the chain id, the run id, the run owner, the level id, the run nonce, the run's active and solved flags, and the six balances. It fixes the state the plan was made against. The plan hash is a fingerprint of the snapshot hash, the offers and the transfers. Each permit stores both values, and a release is allowed only when the coordinator passes back the same offer, snapshot hash and plan hash. The permit is a consistency tag: the character does not recompute the hashes, so it trusts that the coordinator computed them correctly. The live balance check at `authorize` is the independent part.

Evidence: `contracts/src/NpcBase.sol` lines 153 and 164 (values stored as given and compared for equality); `contracts/src/AtomicCoordinator.sol` lines 128, 132 and 307-316 (recomputed snapshot; permits collected in order); lines 180-199 (fields hashed into the snapshot).
