# Entrypoints (external and public functions), level 1 contracts

Source: `contracts/src/**` (read-only for this evidence pass; not changed in round 2). Line numbers are `src/<file>:<line>`.
Selectors: `abi-selectors.log` (forge inspect methodIdentifiers, with exit codes). Grep evidence: `forbidden-grep.log` (raw output, produced by `scripts/run-stage2.sh`).

Trust boundary: which contract checks what itself, and what it takes from its caller as given, is in `GUARANTEES.md` section 2. The public view functions `NpcBase.validatePlan` and `NpcBase.isGoalSatisfied` judge only the arguments passed in: they do not read the ledger, and a successful call does not by itself confirm the real state of any run.

Mutability: "view" means `view` or `pure`; "non-view" means it can change state.

## GameItems (`src/GameItems.sol`)

| Function | Mutability | Who may call (access check) | Errors raised in the function (src) |
|---|---|---|---|
| `coordinator()` (public immutable getter, line 13) | view | anyone | none |
| `grantInitial(uint256)` (line 38) | non-view | only the AtomicCoordinator: `if (msg.sender != coordinator) revert NotCoordinator();` (line 39) | `NotCoordinator` (39), `AlreadyGranted(runId)` (40) |
| `transferFromNpc(uint256,uint8,uint8,uint32)` (line 50) | non-view | only a registered NPC address: `(bool registered, uint8 fromNpc) = npcIdOf(msg.sender); if (!registered) revert NotRegisteredNpc(msg.sender);` (lines 51-52). In production it is reached only from `NpcBase.release` (`src/NpcBase.sol:170`), which is coordinator-gated (`src/NpcBase.sol:180`). | `NotRegisteredNpc` (52), `RunNotGranted(runId)` (53), `InvalidItem` (54), `InvalidNpc` (55), `SelfTransfer` (56), `ZeroQuantity` (57), `InsufficientBalance` (62) |
| `balanceOf(uint256,uint8,uint8)` (line 71) | view | anyone | `InvalidNpc` (72), `InvalidItem` (73) |
| `snapshotBalances(uint256)` (line 78) | view | anyone | none |
| `isGranted(uint256)` (line 83) | view | anyone | none |
| `npcAddress(uint8)` (line 88) | view | anyone | `InvalidNpc` (92) |
| `npcIdOf(address)` (line 96, `public`) | view | anyone | none |

Constructor (`src/GameItems.sol:22`): `ZeroAddress` (24), `DuplicateAddress` (29). Deploy-time only.

## AtomicCoordinator (`src/AtomicCoordinator.sol`)

| Function | Mutability | Who may call (access check) | Errors raised in the function (src) |
|---|---|---|---|
| `items()` (public immutable getter, line 74) | view | anyone | none |
| `startRun()` (line 106, `nonReentrant`) | non-view | anyone; the run id is `uint256(uint160(msg.sender))` (line 107), so each address can only start its own run | `Reentrancy` (83, modifier), `RunExists(runId)` (108); propagates from `items.grantInitial` (line 111) |
| `execute(uint256,Selection[],uint256,bytes32)` (lines 116-121, `nonReentrant`) | non-view | only the run owner: `if (run.owner != msg.sender) revert NotRunOwner(runId, msg.sender);` (line 125) | `Reentrancy` (83), `RunMissing` (124), `NotRunOwner` (125), `AlreadySolved` (126), `RunNotActive` (127), `StaleNonce` (128), `StaleSnapshot` (132), `BadPackageLength` (233), `InvalidNpc` (237), `DuplicateNpc` (238), `ObserverMustSelectNone` (244), `UnknownOffer` (245), `InvalidTransfer` (264), `InsufficientStock` (285), `ConservationViolated` (302), `PrepareChangedState` (314), `SettlementMismatch` (322), `PermitsRemaining` (325), `GoalNotSatisfied` (328). Also propagates the NPC and GameItems errors listed below. |
| `runOf(uint256)` (line 171) | view | anyone | none (returns zeroed struct for unknown run) |
| `currentSnapshotHash(uint256)` (line 176) | view | anyone | none |
| `computePlanHash(bytes32,bytes32[3],Transfer[])` (lines 204-205, `public pure`) | view | anyone | none |
| `npcAddress(uint8)` (line 213) | view | anyone | `InvalidNpc` (228, via `_npc`) |

Constructor (`src/AtomicCoordinator.sol:89`): `ZeroAddress` (91), `DuplicateAddress` (94). Deploy-time only.

Internal helpers (not externally callable): `snapshotHashFor`, `_liveBalances`, `_npc`, `_parsePackage`, `_deriveTransfers`, `_simulate`, `_prepare`, `_verifySettlement`.

## NpcBase (inherited by NPC_A, NPC_B, NPC_C; `src/NpcBase.sol`)

| Function | Mutability | Who may call (access check) | Errors raised in the function (src) |
|---|---|---|---|
| `npcId()`, `items()`, `coordinator()` (public immutable getters, lines 43, 45, 47) | view | anyone | none |
| `rules()` (line 82, `public`) | view | anyone | none |
| `npcIdValue()` (line 87) | view | anyone | none |
| `ownOffer()` (line 92) | view | anyone | none |
| `hasOffer(bytes32)` (line 97, `public`) | view | anyone | none |
| `outgoing(bytes32)` (line 103) | view | anyone | `UnknownOffer` (105) |
| `validatePlan(uint256,bytes32,Transfer[],uint256[6])` (lines 112-113) | view | anyone (comment at line 110: "Callable by anyone") | `PlanRejected` (186, via `_requireValid`) |
| `permitOf(uint256)` (line 120) | view | anyone | none |
| `isGoalSatisfied(uint256[6])` (line 125, `virtual`) | view | anyone | none (no override exists in production src) |
| `authorize(uint256,bytes32,Transfer[],uint256[6],bytes32,bytes32)` (lines 136-143) | non-view | only the coordinator: `_enter()` (line 144) → `if (msg.sender != coordinator) revert NotCoordinator();` (line 180) | `Reentrancy` (179), `NotCoordinator` (180), `NothingToAuthorize` (145), `PermitExists` (146), `BeforeMismatch` (150), `PlanRejected` (186) |
| `release(uint256,bytes32,bytes32,bytes32)` (line 160, `virtual`) | non-view | only the coordinator: `_enter()` (line 161) → line 180 | `Reentrancy` (179), `NotCoordinator` (180), `NoPermit` (163), `PermitMismatch` (165); propagates `GameItems.transferFromNpc` errors (line 170) |

Constructor (`src/NpcBase.sol:63`): `ZeroAddress` (64). Deploy-time only.

## NPC_A (`src/NPC_A.sol`), NPC_B (`src/NPC_B.sol`), NPC_C (`src/NPC_C.sol`)

No functions of their own. Each has only a constructor (`NPC_A.sol:9`, `NPC_B.sol:9`, `NPC_C.sol:9`) that passes fixed rules to NpcBase. Their external surface is exactly the NpcBase table above.

## Level1Deployer (`src/Level1Deployer.sol`)

| Function | Mutability | Who may call (access check) | Errors raised in the function (src) |
|---|---|---|---|
| `constructor()` (line 25) | deploy-time | anyone at deployment; it creates the five contracts at CREATE nonces 1..5 | `PredictionMismatch` (via `_check`, line 54); propagates child constructor errors (`ZeroAddress`, `DuplicateAddress`) |
| `items()`, `npcA()`, `npcB()`, `npcC()`, `coordinator()` (public immutable getters, `src/Level1Deployer.sol:19-23`) | view | anyone | none |
| `predict(address,uint8)` (line 46, `public pure`) | view | anyone | `UnsupportedNonce` (47) |
| `_check(...)` (line 53, `private`) | internal | not callable | `PredictionMismatch` (54) |

The deployer has no function that changes state after deployment (`src/Level1Deployer.sol:11-14` comment).

## Source greps (raw output in `forbidden-grep.log`)

Pattern 1, exact command: `grep -rnE "selfdestruct|delegatecall|callcode|tx\.origin|assembly|payable|receive\(|fallback\(" src`
- Result: no matches (EXIT=1). Therefore no `delegatecall`, `selfdestruct`, `callcode`, `tx.origin`, assembly, `payable`, `receive()` or `fallback()` in src.

Pattern 2, exact command: `grep -rniE "\bowner\b|admin|initialize|setter|\bset[A-Z][A-Za-z]*\(" src`
- Result: 11 matches (EXIT=0). Each one is explained here:
  - `src/AtomicCoordinator.sol:23`: comment "has no owner, setters or special cases". Statement of absence.
  - `src/AtomicCoordinator.sol:28`: `address owner;`: field of the `Run` struct (the address that started the run).
  - `src/AtomicCoordinator.sol:64`: `error SettlementMismatch();`. Matched by `\bset[A-Z][A-Za-z]*\(` (case-insensitive, "Set"+"tlement…" then "("). Not an admin function.
  - `src/AtomicCoordinator.sol:108`: `if (_runs[runId].owner != address(0)) revert RunExists(runId);`: existence check, not an access check.
  - `src/AtomicCoordinator.sol:109`: `_runs[runId] = Run({owner: msg.sender, …})`: records the run starter.
  - `src/AtomicCoordinator.sol:115`: doc comment "Callable only by the run owner."
  - `src/AtomicCoordinator.sol:124`: `if (run.owner == address(0)) revert RunMissing(runId);`: existence check.
  - `src/AtomicCoordinator.sol:125`: `if (run.owner != msg.sender) revert NotRunOwner(runId, msg.sender);`: the run-owner access check for `execute`.
  - `src/AtomicCoordinator.sol:193`: `run.owner,` inside the snapshot-hash encoding.
  - `src/AtomicCoordinator.sol:322`: `if (actual[i] != expected[i]) revert SettlementMismatch();`: settlement check.
  - `src/GameItems.sol:9`: comment "owner, no mint, no setBalance, no approvals …": statement of absence.
- No match is an owner, admin, setter, or initialize function. The only owner-based check is `NotRunOwner` at line 125 (per-run owner, not a contract owner).

## Summary marks

- **No contract owner, admin, setter, or initialize**: every access check is `NotCoordinator` (`GameItems.sol:39`, `NpcBase.sol:180`), `NotRegisteredNpc` (`GameItems.sol:52`), or `NotRunOwner` (`AtomicCoordinator.sol:125`). There is no owner-gated function.
- **No payable**: pattern 1 above has no `payable`; every function is non-payable.
- **No delegatecall / selfdestruct**: pattern 1 above has no `delegatecall` or `selfdestruct` match.
- **Non-view functions**: `GameItems.grantInitial`, `GameItems.transferFromNpc`, `AtomicCoordinator.startRun`, `AtomicCoordinator.execute`, `NpcBase.authorize`, `NpcBase.release`. All others are view or pure.
- **Coordinator-gated** (only the AtomicCoordinator can call): `GameItems.grantInitial`, `NpcBase.authorize`, `NpcBase.release`.
- **Run-owner-gated** (only the run owner): `AtomicCoordinator.execute`.
- **Open to anyone**: `AtomicCoordinator.startRun` (one run per address), all view functions, `NpcBase.validatePlan`, `Level1Deployer.predict`.
