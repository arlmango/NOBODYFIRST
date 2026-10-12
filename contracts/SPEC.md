# NOBODY FIRST — Stage 2 contract spec (level 1, local EVM)

Status: interface contract between `opus-contracts` (src/**) and `opus-tests` (test/**). Owner: orchestrator.
Solidity `pragma solidity 0.8.37;` Foundry 1.8.5, offline, `contracts/foundry.toml` (do not edit; ask orchestrator).
No ETH, no ERC tokens, no approvals, no callbacks, no proxies, no admin, no open initialize, no selfdestruct, no delegatecall.

## Identifiers
- Items: `uint8 KEY = 1`, `uint8 COIN = 2` (0 invalid). Quantity type `uint32`.
- NPC ids: `uint8 NPC_A_ID = 0`, `NPC_B_ID = 1`, `NPC_C_ID = 2`.
- Offer ids (bytes32): `OFFER_NONE = bytes32(0)`, `OFFER_A1 = keccak256("NOBODYFIRST.L1.A1")`, `OFFER_B1 = keccak256("NOBODYFIRST.L1.B1")`.
- Level id `1`. runId = `uint256(uint160(player))` (one run per player, no reset).
- Canonical balances: `uint256[6] b` in order `[A.KEY, A.COIN, B.KEY, B.COIN, C.KEY, C.COIN]`, index = `npcId*2 + (item-1)`.

## Shared types (file `src/Types.sol`, free-standing)
```solidity
struct Transfer { uint8 fromNpc; uint8 toNpc; uint8 item; uint32 qty; }
struct Selection { uint8 npcId; bytes32 offerId; }
struct Permit { bytes32 offerId; bytes32 snapshotHash; bytes32 planHash; bool active; }
```
Interfaces in `src/interfaces/`: `IGameItems`, `INpc`.

## GameItems (`src/GameItems.sol`)
Constructor `(address coordinator_, address npcA, address npcB, address npcC)`; all immutable; reverts `ZeroAddress`/`DuplicateAddress`.
Fixed initial config in code: A: 1 KEY, B: 1 COIN, C: nothing. Player and coordinator hold nothing.
- `grantInitial(uint256 runId)` — only coordinator (`NotCoordinator`); once per run (`AlreadyGranted(runId)`). Emits `InitialGranted(runId)`.
- `transferFromNpc(uint256 runId, uint8 toNpc, uint8 item, uint32 qty)` — msg.sender must be a registered NPC (`NotRegisteredNpc(sender)`), that NPC is the source; `RunNotGranted(runId)`; `InvalidItem(item)`, `InvalidNpc(toNpc)`, `SelfTransfer`, `ZeroQuantity`; `InsufficientBalance(runId, npcId, item, have, need)`. Emits `ItemMoved(runId, fromNpc, toNpc, item, qty)`. Nothing else can move balances: no mint, no setBalance, no coordinator/user transfer.
- Views: `balanceOf(runId, npcId, item)`, `snapshotBalances(runId) returns (uint256[6])`, `isGranted(runId)`, `coordinator()`, `npcAddress(npcId)`, `npcIdOf(address) returns (bool registered, uint8 id)`.
- Non-reentrant not needed (no external calls) — must make no external calls.

## NPCs (`src/NpcBase.sol`, `src/NPC_A.sol`, `src/NPC_B.sol`, `src/NPC_C.sol`)
`abstract contract NpcBase is INpc` with immutables: `npcId`, `items` (IGameItems), `coordinator`, own `offerId` (NONE for C), give terms (`giveTo`, `giveItem`, `giveQty`), required incoming terms (`needFrom`, `needItem`, `needQty`), goal holdings (`goalKey`, `goalCoin`). Concrete contracts `NPC_A`, `NPC_B`, `NPC_C` are separate contracts (distinct code) that pass their own fixed rules to the base constructor `(address items_, address coordinator_)`:
- NPC_A (id 0): offer A1: give B 1 KEY; require incoming from B 1 COIN; goal: A holds only 1 COIN.
- NPC_B (id 1): offer B1: give A 1 COIN; require incoming from A 1 KEY; goal: B holds only 1 KEY.
- NPC_C (id 2): no offer (NONE only); no transfers may involve C; goal: C holds nothing.
Functions (all `external`; `release` and `isGoalSatisfied` are `virtual` — an extension point used only by test fixtures; the three production instances do not override):
- `npcIdValue() view`, `ownOffer() view returns (bytes32)`, `hasOffer(bytes32 offerId) view returns (bool)` (true for NONE and own offer).
- `outgoing(bytes32 offerId) view returns (bool hasTransfer, Transfer memory t)` — terms of the selected offer (NONE → false). Reverts `UnknownOffer(npcId, offerId)`.
- `validatePlan(uint256 runId, bytes32 offerId, Transfer[] calldata plan, uint256[6] calldata before) view` — independent check; reverts `PlanRejected(uint8 npcId, uint8 code)` with codes in `NpcBase`/`Types` constants:
  `1 UNKNOWN_OFFER`, `2 OWN_TRANSFER_MISSING`, `3 OWN_TRANSFER_MISMATCH` (wrong to/item/qty or more than one transfer from self), `4 INCOMING_MISSING`, `5 INCOMING_MISMATCH` (wrong source/item/qty or more than one incoming), `6 UNEXPECTED_INCOMING` (offer NONE but something arrives), `7 UNEXPECTED_OUTGOING` (offer NONE but self sends), `8 INSUFFICIENT_STOCK` (spend measured against `before` only; expected incoming never counts as stock), `9 GOAL_NOT_MET` (expected final holdings != goal), `10 OBSERVER_TOUCHED` (C involved in any transfer).
  Check order: 1, then spend (7/2/3), incoming (6/4/5), 8, 10 (for C), 9.
- `authorize(uint256 runId, bytes32 offerId, Transfer[] calldata plan, uint256[6] calldata before, bytes32 snapshotHash, bytes32 planHash)` — only coordinator (`NotCoordinator`); re-runs `validatePlan` internally; stores single `Permit` per run (`PermitExists(runId)` if active); changes no item balances. Before validating, it requires `keccak256(abi.encode(before)) == keccak256(abi.encode(items.snapshotBalances(runId)))` (`BeforeMismatch(runId)`): the NPC does not trust the caller-supplied balances, it re-reads the live ledger. Emits `PermitIssued(runId, npcId, offerId, snapshotHash, planHash)`. Not callable for NONE/C (reverts `NothingToAuthorize`).
- `release(uint256 runId, bytes32 offerId, bytes32 snapshotHash, bytes32 planHash)` — only coordinator (`NotCoordinator`); requires an active permit (`NoPermit(runId)`) whose fields match (`PermitMismatch(runId)`); **consumes the permit (storage cleared) BEFORE** calling `items.transferFromNpc`; non-reentrant (`Reentrancy`). Emits `PermitConsumed(runId, npcId, offerId)`.
- `permitOf(uint256 runId) view returns (Permit memory)`.
- `isGoalSatisfied(uint256[6] calldata finalBalances) view virtual returns (bool)` — own holdings exactly the goal.

## AtomicCoordinator (`src/AtomicCoordinator.sol`)
Constructor `(address items_, address npcA, address npcB, address npcC)` immutable. No owner, no setters.
Run state: `struct Run { address owner; bool active; bool solved; uint64 nonce; }` (game nonce, NOT account nonce).
- `startRun() returns (uint256 runId)` — runId from msg.sender; `RunExists(runId)`; sets owner, active = true, nonce = 0; calls `items.grantInitial(runId)`; emits `RunStarted(runId, player)`.
- `execute(uint256 runId, Selection[] calldata package, uint256 expectedNonce, bytes32 expectedSnapshotHash)` — non-reentrant (`Reentrancy`); exact order:
  1. `RunMissing(runId)`/`NotRunOwner(runId, caller)`, `AlreadySolved(runId)` (checked BEFORE `RunNotActive(runId)` so a repeated execute of a solved run reports AlreadySolved), `StaleNonce(expected, actual)`, `StaleSnapshot(expected, actual)` (snapshot recomputed from live state).
  2. package: `BadPackageLength(len)` (must be 3); each npcId in range `InvalidNpc(npcId)` and used once `DuplicateNpc(npcId)`; each offer allowed for that NPC `UnknownOffer(npcId, offerId)`; C must be NONE `ObserverMustSelectNone(offerId)`. (Duplicate offer ids across NPCs are caught by `UnknownOffer`/`DuplicateNpc`; same id twice for one NPC is `DuplicateNpc`.)
  3. snapshot read once; 4. transfers derived ONLY from `npc.outgoing(offerId)` in npcId order, no special-case "A1+B1 wins" logic; 5. in-memory: spend ≤ `before` stock, per-item conservation (`ConservationViolated`), compute expected final; 6. every NPC (all three) `validatePlan` (PlanRejected bubbles up); 7. `authorize` for each NPC with an outgoing transfer; after prepare recompute snapshot hash and require it equals the original (`PrepareChangedState`); 8. execute `release` in npcId order; 9. require actual final balances == expected final (`SettlementMismatch`), every NPC has no active permit (`PermitsRemaining(npcId)`), every NPC `isGoalSatisfied(final)` (`GoalNotSatisfied(npcId)`); 10. only then `solved = true; active = false; nonce += 1;` emit `LevelSolved(runId, player, newNonce, snapshotHash, planHash)`.
  External-call failures are not caught; revert data bubbles up.
- Views: `runOf(runId) returns (Run)`, `currentSnapshotHash(runId)`, `snapshotHashFor(runId, ...)` / `computePlanHash(...)` helpers as needed, `items()`, `npcAddress(id)`.
Hashes (single canonical encoding, `abi.encode`, domain-separated):
`snapshotHash = keccak256(abi.encode(SNAPSHOT_DOMAIN, address(this), address(items), block.chainid, runId, owner, LEVEL_ID, nonce, active, solved, balances))`.
`planHash = keccak256(abi.encode(PLAN_DOMAIN, snapshotHash, offerIds[3] (by npcId), transfers))`.
Domains are `keccak256("NOBODYFIRST.SNAPSHOT.V1")` / `keccak256("NOBODYFIRST.PLAN.V1")`.

## Deployment wiring (`src/Level1Deployer.sol`)
One-shot contract: the constructor deploys GameItems, NPC_A, NPC_B, NPC_C, AtomicCoordinator with `new`, using addresses predicted from its own CREATE nonces (1..5), requires each created address equals the prediction, stores the five addresses as immutables. No functions that change anything afterwards. Anyone can verify `items.coordinator()==coordinator`, `coordinator.npcAddress(i)==npc_i`, NPC immutables.

## Required evidence points for tests (opus-tests)
Happy path exact balances/solved/nonce/events; empty (`[A:NONE,B:NONE,C:NONE]` and `[]`), only A1, only B1; duplicates (`DuplicateNpc`), unknown offer, offer instead of NONE at C; direct release by user; spending foreign escrow via ledger (user, coordinator, wrong NPC); foreign user executing a run; repeated initial grant; wrong snapshot/nonce; repeated execution; wrong/used permit (pranked coordinator); conservation of stock; no residual permits; wiring/distinct addresses/code present. Assert exact error selectors+args, never bare `expectRevert()`.
Late failure fixtures in `test/harness/`: (1) `LateFailNpcB is NPC_B` overriding `release` to revert after the first transfer already settled; (2) `LateFailNpcB_Final is NPC_B` overriding `isGoalSatisfied` to return false so the coordinator reverts after BOTH transfers executed. Wiring for these fixtures is built in the test with `vm.computeCreateAddress`; coordinator and ledger are the unmodified production contracts.

## Amendments (stage 2, after first test round)
- `authorize` cross-checks `before` against the live ledger (`BeforeMismatch(uint256 runId)`).
- `AlreadySolved` is checked before `RunNotActive`.
- Additions accepted from opus-contracts: `InsufficientStock`, `InvalidTransfer`, `NpcRules`/`rules()`, `PredictionMismatch`, `UnsupportedNonce`; `ObserverMustSelectNone` evaluated before `UnknownOffer`; reject code 10 is defence in depth (unreachable under the check order).
