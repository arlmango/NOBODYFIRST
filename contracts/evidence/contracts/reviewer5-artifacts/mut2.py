import sys
sys.argv = [sys.argv[0]]
exec(open("/private/tmp/claude-501/-Users-mango-NOBODYFIRST/98af9731-d60f-4f75-9ccd-d2bf0a46ecf5/scratchpad/reviewer5/mut.py").read().split("names = sys.argv")[0])
M2 = {
 "M25_skip_incoming_qty_check": ("src/NpcBase.sol", "t.item == r.needItem && t.qty == r.needQty", "t.item == r.needItem"),
 "M26_skip_own_toNpc_check": ("src/NpcBase.sol", "outOk = outOk && t.toNpc == r.giveTo && ", "outOk = outOk && "),
 "M27_allow_multiple_incoming": ("src/NpcBase.sol", "if (inCount > 1 || !inOk)", "if (!inOk)"),
 "M28_observer_allows_incoming": ("src/NpcBase.sol", "            if (inCount != 0) return (UNEXPECTED_INCOMING, touched);", ""),
 "M29_special_case_right_ids_skip_npc_checks": ("src/AtomicCoordinator.sol",
   "        for (uint8 id = 0; id < NPC_COUNT; ++id) {\n            _npc(id).validatePlan(",
   "        if (!(p.offerIds[0] == keccak256(\"NOBODYFIRST.L1.A1\") && p.offerIds[1] == keccak256(\"NOBODYFIRST.L1.B1\"))) for (uint8 id = 0; id < NPC_COUNT; ++id) {\n            _npc(id).validatePlan("),
 "M30_coord_nonReentrant_removed_execute": ("src/AtomicCoordinator.sol", "        bytes32 expectedSnapshotHash\n    ) external nonReentrant {", "        bytes32 expectedSnapshotHash\n    ) external {"),
 "M31_npc_lock_removed": ("src/NpcBase.sol", "        if (_lock != 1) revert Reentrancy();\n        if (msg.sender != coordinator)", "        if (msg.sender != coordinator)"),
}
for nm, spec in M2.items():
    res = run(nm, spec)
    status = "KILLED" if res[1] != "EXIT=0" else "SURVIVED"
    if res[1].startswith("PATTERN"): status = "BADPATTERN"
    print(res[0], res[1], status, res[2], ",".join(res[3]) if res[3] else "", flush=True)
