// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IGameItems} from "./interfaces/IGameItems.sol";
import {INpc} from "./interfaces/INpc.sol";
import {
    Transfer,
    Selection,
    KEY,
    COIN,
    NPC_A_ID,
    NPC_B_ID,
    NPC_C_ID,
    NPC_COUNT,
    OFFER_NONE,
    LEVEL_ID,
    SNAPSHOT_DOMAIN,
    PLAN_DOMAIN,
    balanceIndex
} from "./Types.sol";

/// @title AtomicCoordinator — one-transaction settlement of a level-1 exchange package.
/// @notice Holds no items and has no owner, setters or special cases. It derives transfers only
///         from the NPCs' immutable offers, lets every NPC validate independently, collects one-time
///         permits, releases them in npcId order and verifies the result. Any failure reverts all.
contract AtomicCoordinator {
    struct Run {
        address owner;
        bool active;
        bool solved;
        uint64 nonce;
    }

    /// @dev In-memory working set of one `execute` call.
    struct Plan {
        uint256[6] before;
        uint256[6] expected;
        bytes32[3] offerIds;
        bool[3] sends;
        Transfer[] transfers;
        bytes32 snapshotHash;
        bytes32 planHash;
    }

    error ZeroAddress();
    error DuplicateAddress();
    error Reentrancy();
    error RunExists(uint256 runId);
    error RunMissing(uint256 runId);
    error NotRunOwner(uint256 runId, address caller);
    error RunNotActive(uint256 runId);
    error AlreadySolved(uint256 runId);
    error StaleNonce(uint256 expected, uint256 actual);
    error StaleSnapshot(bytes32 expected, bytes32 actual);
    error BadPackageLength(uint256 len);
    error InvalidNpc(uint8 npcId);
    error DuplicateNpc(uint8 npcId);
    error UnknownOffer(uint8 npcId, bytes32 offerId);
    error ObserverMustSelectNone(bytes32 offerId);
    error InvalidTransfer(uint8 npcId);
    error InsufficientStock(uint8 npcId, uint8 item, uint256 have, uint256 need);
    error ConservationViolated();
    error PrepareChangedState();
    error SettlementMismatch();
    error PermitsRemaining(uint8 npcId);
    error GoalNotSatisfied(uint8 npcId);

    event RunStarted(uint256 indexed runId, address indexed player);
    event LevelSolved(
        uint256 indexed runId, address indexed player, uint64 newNonce, bytes32 snapshotHash, bytes32 planHash
    );

    /// @notice The item ledger this coordinator settles on.
    IGameItems public immutable items;
    INpc private immutable _npcA;
    INpc private immutable _npcB;
    INpc private immutable _npcC;

    mapping(uint256 runId => Run) private _runs;
    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address items_, address npcA, address npcB, address npcC) {
        if (items_ == address(0) || npcA == address(0) || npcB == address(0) || npcC == address(0)) {
            revert ZeroAddress();
        }
        if (items_ == npcA || items_ == npcB || items_ == npcC || npcA == npcB || npcA == npcC || npcB == npcC) {
            revert DuplicateAddress();
        }
        items = IGameItems(items_);
        _npcA = INpc(npcA);
        _npcB = INpc(npcB);
        _npcC = INpc(npcC);
    }

    // -------------------------------------------------------------- mutations

    /// @notice Starts the caller's single run (runId = uint160(caller)) and grants initial stock.
    /// @dev Callable by anyone, once per address.
    function startRun() external nonReentrant returns (uint256 runId) {
        runId = uint256(uint160(msg.sender));
        if (_runs[runId].owner != address(0)) revert RunExists(runId);
        _runs[runId] = Run({owner: msg.sender, active: true, solved: false, nonce: 0});
        emit RunStarted(runId, msg.sender);
        items.grantInitial(runId);
    }

    /// @notice Atomically settles `package` (one Selection per NPC) for run `runId`.
    /// @dev Callable only by the run owner. Steps 1–10 of SPEC.md in exact order; reverts bubble up.
    function execute(
        uint256 runId,
        Selection[] calldata package,
        uint256 expectedNonce,
        bytes32 expectedSnapshotHash
    ) external nonReentrant {
        // 1. run checks + live snapshot (the only balance read used for planning, step 3)
        Run storage run = _runs[runId];
        if (run.owner == address(0)) revert RunMissing(runId);
        if (run.owner != msg.sender) revert NotRunOwner(runId, msg.sender);
        if (run.solved) revert AlreadySolved(runId);
        if (!run.active) revert RunNotActive(runId);
        if (expectedNonce != run.nonce) revert StaleNonce(expectedNonce, run.nonce);
        Plan memory p;
        p.before = _liveBalances(runId);
        p.snapshotHash = snapshotHashFor(runId, run, p.before);
        if (expectedSnapshotHash != p.snapshotHash) revert StaleSnapshot(expectedSnapshotHash, p.snapshotHash);

        // 2. package completeness
        p.offerIds = _parsePackage(package);

        // 4. transfers derived only from the NPCs' own immutable offers
        (p.transfers, p.sends) = _deriveTransfers(p.offerIds);

        // 5. in-memory stock, conservation and expected final balances
        p.expected = _simulate(p.before, p.transfers);

        // 6. every NPC validates independently (PlanRejected bubbles up)
        for (uint8 id = 0; id < NPC_COUNT; ++id) {
            _npc(id).validatePlan(runId, p.offerIds[id], p.transfers, p.before);
        }

        // 7. prepare: one-time permits bound to run/offer/snapshot/plan; must not change state
        p.planHash = computePlanHash(p.snapshotHash, p.offerIds, p.transfers);
        _prepare(runId, run, p);

        // 8. sequential release; each NPC consumes its permit before its own ledger call
        for (uint8 id = 0; id < NPC_COUNT; ++id) {
            if (p.sends[id]) _npc(id).release(runId, p.offerIds[id], p.snapshotHash, p.planHash);
        }

        // 9. verify actual result
        _verifySettlement(runId, p.expected);

        // 10. commit
        run.solved = true;
        run.active = false;
        uint64 newNonce = run.nonce + 1;
        run.nonce = newNonce;
        emit LevelSolved(runId, msg.sender, newNonce, p.snapshotHash, p.planHash);
    }

    // ------------------------------------------------------------------ views

    /// @notice Run state of `runId` (zeroed if it does not exist). Callable by anyone.
    function runOf(uint256 runId) external view returns (Run memory) {
        return _runs[runId];
    }

    /// @notice Snapshot hash of `runId` computed from live run state and ledger. Callable by anyone.
    function currentSnapshotHash(uint256 runId) external view returns (bytes32) {
        return snapshotHashFor(runId, _runs[runId], _liveBalances(runId));
    }

    /// @dev Canonical snapshot hash for explicit run state and balances (exposed via `currentSnapshotHash`).
    function snapshotHashFor(uint256 runId, Run memory run, uint256[6] memory balances)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                SNAPSHOT_DOMAIN,
                address(this),
                address(items),
                block.chainid,
                runId,
                run.owner,
                LEVEL_ID,
                run.nonce,
                run.active,
                run.solved,
                balances
            )
        );
    }

    /// @notice Canonical plan hash. `offerIds` are indexed by npcId. Callable by anyone.
    function computePlanHash(bytes32 snapshotHash, bytes32[3] memory offerIds, Transfer[] memory transfers)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(PLAN_DOMAIN, snapshotHash, offerIds, transfers));
    }

    /// @notice Registered address of NPC `id`. Reverts `InvalidNpc` for unknown ids.
    function npcAddress(uint8 id) external view returns (address) {
        return address(_npc(id));
    }

    // --------------------------------------------------------------- internal

    /// @dev Single call site for the ledger snapshot (keeps unoptimized bytecode small).
    function _liveBalances(uint256 runId) internal view returns (uint256[6] memory) {
        return items.snapshotBalances(runId);
    }

    function _npc(uint8 id) internal view returns (INpc) {
        if (id == NPC_A_ID) return _npcA;
        if (id == NPC_B_ID) return _npcB;
        if (id == NPC_C_ID) return _npcC;
        revert InvalidNpc(id);
    }

    /// @dev Step 2. Pass 1: length, range, uniqueness. Pass 2: offers (observer first, then NPC's own list).
    function _parsePackage(Selection[] calldata package) internal view returns (bytes32[3] memory offerIds) {
        if (package.length != NPC_COUNT) revert BadPackageLength(package.length);
        bool[3] memory seen;
        for (uint256 i = 0; i < NPC_COUNT; ++i) {
            uint8 id = package[i].npcId;
            if (id >= NPC_COUNT) revert InvalidNpc(id);
            if (seen[id]) revert DuplicateNpc(id);
            seen[id] = true;
        }
        for (uint256 i = 0; i < NPC_COUNT; ++i) {
            uint8 id = package[i].npcId;
            bytes32 offerId = package[i].offerId;
            if (id == NPC_C_ID && offerId != OFFER_NONE) revert ObserverMustSelectNone(offerId);
            if (!_npc(id).hasOffer(offerId)) revert UnknownOffer(id, offerId);
            offerIds[id] = offerId;
        }
    }

    /// @dev Step 4. Asks each NPC (npcId order) for the terms of its selected offer; sanity-checks shape.
    function _deriveTransfers(bytes32[3] memory offerIds)
        internal
        view
        returns (Transfer[] memory transfers, bool[3] memory sends)
    {
        Transfer[3] memory buf;
        uint256 n = 0;
        for (uint8 id = 0; id < NPC_COUNT; ++id) {
            (bool has, Transfer memory t) = _npc(id).outgoing(offerIds[id]);
            if (!has) continue;
            if (
                t.fromNpc != id || t.toNpc >= NPC_COUNT || t.toNpc == id || (t.item != KEY && t.item != COIN)
                    || t.qty == 0
            ) revert InvalidTransfer(id);
            sends[id] = true;
            buf[n++] = t;
        }
        transfers = new Transfer[](n);
        for (uint256 i = 0; i < n; ++i) {
            transfers[i] = buf[i];
        }
    }

    /// @dev Step 5. Spend is measured against `before` only; incoming never counts as stock.
    function _simulate(uint256[6] memory before, Transfer[] memory transfers)
        internal
        pure
        returns (uint256[6] memory expected)
    {
        uint256[6] memory spent;
        for (uint256 i = 0; i < transfers.length; ++i) {
            Transfer memory t = transfers[i];
            uint256 from = balanceIndex(t.fromNpc, t.item);
            spent[from] += t.qty;
            if (spent[from] > before[from]) revert InsufficientStock(t.fromNpc, t.item, before[from], spent[from]);
        }
        for (uint256 i = 0; i < 6; ++i) {
            expected[i] = before[i]; // element-wise copy: `expected = before` would alias memory
        }
        for (uint256 i = 0; i < transfers.length; ++i) {
            Transfer memory t = transfers[i];
            expected[balanceIndex(t.fromNpc, t.item)] -= t.qty;
            expected[balanceIndex(t.toNpc, t.item)] += t.qty;
        }
        for (uint8 item = KEY; item <= COIN; ++item) {
            uint256 sumBefore = 0;
            uint256 sumAfter = 0;
            for (uint8 id = 0; id < NPC_COUNT; ++id) {
                sumBefore += before[balanceIndex(id, item)];
                sumAfter += expected[balanceIndex(id, item)];
            }
            if (sumBefore != sumAfter) revert ConservationViolated();
        }
    }

    /// @dev Step 7. Collects permits in npcId order, then requires the snapshot to be unchanged.
    function _prepare(uint256 runId, Run storage run, Plan memory p) internal {
        for (uint8 id = 0; id < NPC_COUNT; ++id) {
            if (p.sends[id]) {
                _npc(id).authorize(runId, p.offerIds[id], p.transfers, p.before, p.snapshotHash, p.planHash);
            }
        }
        if (snapshotHashFor(runId, run, _liveBalances(runId)) != p.snapshotHash) {
            revert PrepareChangedState();
        }
    }

    /// @dev Step 9. Actual == expected, no residual permits, every goal satisfied.
    function _verifySettlement(uint256 runId, uint256[6] memory expected) internal view {
        uint256[6] memory actual = _liveBalances(runId);
        for (uint256 i = 0; i < 6; ++i) {
            if (actual[i] != expected[i]) revert SettlementMismatch();
        }
        for (uint8 id = 0; id < NPC_COUNT; ++id) {
            if (_npc(id).permitOf(runId).active) revert PermitsRemaining(id);
        }
        for (uint8 id = 0; id < NPC_COUNT; ++id) {
            if (!_npc(id).isGoalSatisfied(actual)) revert GoalNotSatisfied(id);
        }
    }
}
