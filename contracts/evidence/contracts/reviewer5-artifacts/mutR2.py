import os, shutil, subprocess, sys, re

R = "/private/tmp/claude-501/-Users-mango-NOBODYFIRST/98af9731-d60f-4f75-9ccd-d2bf0a46ecf5/scratchpad/reviewer5"
C = "/Users/mango/NOBODYFIRST/contracts"
FORGE = C + "/.tools/bin/forge"

M = {
 "M01_permit_delete_after_ledger": ("src/NpcBase.sol",
   "        delete _permits[runId];\n        NpcRules memory r = rules();\n        emit PermitConsumed(runId, r.npcId, offerId);\n        items.transferFromNpc(runId, r.giveTo, r.giveItem, r.giveQty);\n",
   "        NpcRules memory r = rules();\n        emit PermitConsumed(runId, r.npcId, offerId);\n        items.transferFromNpc(runId, r.giveTo, r.giveItem, r.giveQty);\n        delete _permits[runId];\n"),
 "M02_remove_before_check": ("src/NpcBase.sol",
   "            if (live[i] != before[i]) revert BeforeMismatch(runId);",
   "            live[i];"),
 "M03_skip_incoming_source_check": ("src/NpcBase.sol",
   "inOk = inOk && t.fromNpc == r.needFrom && t.item == r.needItem",
   "inOk = inOk && t.item == r.needItem"),
 "M04_allow_user_release": ("src/NpcBase.sol",
   "        if (msg.sender != coordinator) revert NotCoordinator();\n        _lock = 2;",
   "        _lock = 2;"),
 "M05_swap_give_need_NPC_B": ("src/NPC_B.sol",
   "                giveItem: COIN,",
   "                giveItem: KEY,"),
 "M06_drop_conservation": ("src/AtomicCoordinator.sol",
   "            if (sumBefore != sumAfter) revert ConservationViolated();",
   "            sumBefore; sumAfter;"),
 "M07_no_nonce_increment": ("src/AtomicCoordinator.sol",
   "        run.nonce = newNonce;\n",
   ""),
 "M08_settlement_no_revert_on_mismatch": ("src/AtomicCoordinator.sol",
   "            if (actual[i] != expected[i]) revert SettlementMismatch();",
   "            actual[i]; expected[i];"),
 "M09_coord_no_unknownoffer_check": ("src/AtomicCoordinator.sol",
   "            if (!_npc(id).hasOffer(offerId)) revert UnknownOffer(id, offerId);",
   ""),
 "M10_no_permits_remaining_check": ("src/AtomicCoordinator.sol",
   "            if (_npc(id).permitOf(runId).active) revert PermitsRemaining(id);",
   ""),
 "M11_no_prepare_changed_check": ("src/AtomicCoordinator.sol",
   "        if (snapshotHashFor(runId, run, _liveBalances(runId)) != p.snapshotHash) {\n            revert PrepareChangedState();\n        }",
   ""),
 "M12_no_derive_sanity_check": ("src/AtomicCoordinator.sol",
   "            ) revert InvalidTransfer(id);",
   "            ) {}"),
 "M13_skip_C_validatePlan": ("src/AtomicCoordinator.sol",
   "        for (uint8 id = 0; id < NPC_COUNT; ++id) {\n            _npc(id).validatePlan(",
   "        for (uint8 id = 0; id < NPC_COUNT - 1; ++id) {\n            _npc(id).validatePlan("),
 "M14_skip_all_step6_validatePlan": ("src/AtomicCoordinator.sol",
   "            _npc(id).validatePlan(runId, p.offerIds[id], p.transfers, p.before);",
   ""),
 "M15_no_goal_check_coord": ("src/AtomicCoordinator.sol",
   "            if (!_npc(id).isGoalSatisfied(actual)) revert GoalNotSatisfied(id);",
   ""),
 "M16_permit_mismatch_ignore_planHash": ("src/NpcBase.sol",
   " || p.planHash != planHash) {",
   ") {"),
 "M17_ledger_unregistered_allowed": ("src/GameItems.sol",
   "        if (!registered) revert NotRegisteredNpc(msg.sender);",
   ""),
 "M18_runNotActive_before_alreadySolved": ("src/AtomicCoordinator.sol",
   "        if (run.solved) revert AlreadySolved(runId);\n        if (!run.active) revert RunNotActive(runId);",
   "        if (!run.active) revert RunNotActive(runId);\n        if (run.solved) revert AlreadySolved(runId);"),
 "M19_snapshot_hash_omit_balances": ("src/AtomicCoordinator.sol",
   "                run.solved,\n                balances\n",
   "                run.solved\n"),
 "M20_snapshot_hash_omit_chainid": ("src/AtomicCoordinator.sol",
   "                block.chainid,\n",
   ""),
 "M21_planHash_omit_offerIds": ("src/AtomicCoordinator.sol",
   "abi.encode(PLAN_DOMAIN, snapshotHash, offerIds, transfers)",
   "abi.encode(PLAN_DOMAIN, snapshotHash, transfers)"),
 "M22_npc_permit_not_deleted": ("src/NpcBase.sol",
   "        delete _permits[runId];\n",
   ""),
 "M23_solved_flag_not_set": ("src/AtomicCoordinator.sol",
   "        run.solved = true;\n",
   ""),
 "M24_authorize_skip_requireValid": ("src/NpcBase.sol",
   "        _requireValid(offerId, plan, before);\n        _permits[runId] = Permit(",
   "        _permits[runId] = Permit("),
}

def run(name, spec):
    f, old, new = spec
    d = os.path.join(R, "mutR2", name)
    if os.path.exists(d):
        shutil.rmtree(d)
    os.makedirs(d)
    for sub in ("src", "test"):
        shutil.copytree(os.path.join(R, "base2", sub), os.path.join(d, sub))
    shutil.copy(os.path.join(R, "base2", "foundry.toml"), d)
    os.symlink(C + "/lib", os.path.join(d, "lib"))
    os.symlink(C + "/.tools", os.path.join(d, ".tools"))
    p = os.path.join(d, f)
    s = open(p).read()
    n = s.count(old)
    if n != 1:
        return (name, "PATTERN_COUNT=%d" % n, "", "")
    open(p, "w").write(s.replace(old, new))
    r = subprocess.run([FORGE, "test"], cwd=d, capture_output=True, text=True)
    out = r.stdout + r.stderr
    open(os.path.join(R, "mutR2", name + ".log"), "w").write(out)
    fails = re.findall(r"^\[FAIL.*\] (test\w+)\(\)", out, re.M)
    summ = re.findall(r"(\d+) tests passed, (\d+) failed", out)
    comp = "COMPILE_ERROR" if "Compiler run failed" in out or "Error (" in out else ""
    return (name, "EXIT=%d" % r.returncode, (summ[-1] if summ else comp), sorted(set(fails)))

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
M.update(M2)
os.makedirs(os.path.join(R,'mutR2'), exist_ok=True)
names = sys.argv[1:] or list(M)
for nm in names:
    res = run(nm, M[nm])
    status = "KILLED" if res[1] not in ("EXIT=0",) else "SURVIVED"
    if res[1].startswith("PATTERN"):
        status = "BADPATTERN"
    print(res[0], res[1], status, res[2], ",".join(res[3]) if res[3] else "", flush=True)
