#!/usr/bin/env bash
# NOBODY FIRST stage 2, level 1: reproducible build, tests, traces, source greps and (optional)
# local Anvil deployment. Uses only the project-local tools under contracts/.tools.
#
# Usage:  scripts/run-stage2.sh <output-dir> [--anvil]
#   <output-dir>  required; logs are written here (created if missing).
#   --anvil       also starts a LOCAL anvil on 127.0.0.1:8599 (chainId 31337), deploys
#                 Level1Deployer with anvil's unlocked account 0, runs startRun, a rejected
#                 short package, and the correct execute, reads state, then kills exactly the
#                 anvil PID it started and checks the port is free. Output: <output-dir>/anvil-deploy2/.
#                 Without this flag, anvil is never started.
#
# Exit status: 0 if every step (including each real forge/cast exit code that is required to
# succeed) exited 0; 1 otherwise; 2 on usage error. The expected revert of the short package is
# recorded, not counted as a failure, but its revert data is checked.
# Every log ends with an EXIT=<code> line; exit-codes.txt lists all steps.
# The anvil process's stdout/stderr is discarded on purpose: it prints dev private keys.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)" || exit 2
FORGE="$ROOT/.tools/bin/forge"
CAST="$ROOT/.tools/bin/cast"
ANVIL="$ROOT/.tools/bin/anvil"
SOLC="$ROOT/.tools/solc/solc-0.8.37"
SIG="$HOME/.foundry/cache/signatures"

SUITES="ToolchainSmoke Level1Wiring Level1Exchange Level1NpcValidation Level1Permissions Level1FaultInjection Level1LateFailure"

if [ $# -lt 1 ]; then
  echo "usage: $0 <output-dir> [--anvil]" >&2
  exit 2
fi
OUT="$1"
shift
WITH_ANVIL=0
for arg in "$@"; do
  case "$arg" in
    --anvil) WITH_ANVIL=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUT" || exit 2
OUT="$(cd "$OUT" && pwd)" || exit 2
SUMMARY="$OUT/exit-codes.txt"
: > "$SUMMARY"
FAILED=0

cd "$ROOT" || exit 2

# record <name> <rc>: one line in the summary; any non-zero rc marks the run failed.
record() {
  echo "$1 EXIT=$2" | tee -a "$SUMMARY"
  if [ "$2" -ne 0 ]; then FAILED=1; fi
}

# step <name> <logfile> <command...>: runs command, logs stdout+stderr, appends EXIT line.
step() {
  local name="$1" log="$2"
  shift 2
  "$@" > "$log" 2>&1
  local code=$?
  echo "EXIT=$code" >> "$log"
  record "$name" "$code"
}

sig_report() { # sig_report <label>
  echo "## $1: $SIG"
  if [ -f "$SIG" ]; then
    echo "size_bytes: $(stat -f %z "$SIG")"
    shasum -a 256 "$SIG"
  else
    echo "MISSING"
  fi
}

# ---- signature cache before -------------------------------------------------------
{
  echo "# ~/.foundry/cache/signatures: size and sha256 recorded around this run."
  echo "# Forge may append decoded signatures while compiling/tracing; the file is never deleted here."
  sig_report "BEFORE this run"
} > "$OUT/signatures-cache.txt" 2>&1

# ---- toolchain versions (same format for every run) -----------------------------------
{
  echo "## uname -a"; uname -a
  echo "## sw_vers"; sw_vers
  echo "## forge --version"; "$FORGE" --version
  echo "EXIT=$?"
  echo "## cast --version"; "$CAST" --version
  echo "EXIT=$?"
  echo "## anvil --version"; "$ANVIL" --version
  echo "EXIT=$?"
  echo "## solc --version (pinned ./.tools/solc/solc-0.8.37)"; "$SOLC" --version
  echo "EXIT=$?"
  echo "## forge-std commit"; git -C "$ROOT/lib/forge-std" rev-parse HEAD
  echo "EXIT=$?"
  echo "## date -u"; date -u
  echo "EXIT=$?"
} > "$OUT/versions.txt" 2>&1

# ---- build, sizes, tests ---------------------------------------------------------------
step "build"        "$OUT/build.log"  "$FORGE" build --force
step "sizes"        "$OUT/sizes.log"  "$FORGE" build --sizes
step "tests"        "$OUT/tests.log"  "$FORGE" test -vv

"$FORGE" test --json > "$OUT/tests.json" 2> "$OUT/tests-json.log"
TJ=$?
echo "EXIT=$TJ" >> "$OUT/tests-json.log"
record "tests-json" "$TJ"

for suite in $SUITES; do
  step "tests:$suite" "$OUT/tests-by-suite-$suite.log" "$FORGE" test --match-contract "$suite" -vv
done

# ---- late-failure trace and state tables; happy path; setUp traces -----------------------
step "latefail-trace"   "$OUT/latefail-trace.log"        "$FORGE" test --match-contract Level1LateFailure -vvvv
step "latefail-tables"  "$OUT/latefail-state-tables.log" "$FORGE" test --match-contract Level1LateFailure -vv
step "happy-path"       "$OUT/happy-path-state.log"      "$FORGE" test --match-test test_HappyPath_ExactBalancesRunStateEventsNoPermits -vvv
step "setup-trace-happy" "$OUT/setup-trace-happy.log"    "$FORGE" test --match-test test_HappyPath_ExactBalancesRunStateEventsNoPermits -vvvvv
step "setup-trace-wiring" "$OUT/setup-trace-wiring.log"  "$FORGE" test --match-test test_Wiring_DistinctNonZeroAddressesWithCode -vvvvv

# ---- fault injection -------------------------------------------------------------------
step "fault-injection"  "$OUT/fault-injection.log"       "$FORGE" test --match-contract Level1FaultInjection -vvv

# ---- source greps (exact patterns; raw output; grep exit 1 = no match is expected) ------------
{
  echo "## grep -rnE \"selfdestruct|delegatecall|callcode|tx\\.origin|assembly|payable|receive\\(|fallback\\(\" src"
  grep -rnE "selfdestruct|delegatecall|callcode|tx\.origin|assembly|payable|receive\(|fallback\(" src
  echo "EXIT=$? (0 = matches printed above, 1 = no matches)"
  echo
  echo "## grep -rniE \"\\bowner\\b|admin|initialize|setter|\\bset[A-Z][A-Za-z]*\\(\" src"
  grep -rniE "\bowner\b|admin|initialize|setter|\bset[A-Z][A-Za-z]*\(" src
  echo "EXIT=$? (0 = matches printed above, 1 = no matches)"
} > "$OUT/forbidden-grep.log" 2>&1
record "forbidden-grep" 0

# ---- optional local Anvil deployment ----------------------------------------------------
if [ "$WITH_ANVIL" -eq 1 ]; then
  AD="$OUT/anvil-deploy2"
  mkdir -p "$AD"
  RPC="http://127.0.0.1:8599"
  LOG="$AD/session.log"
  : > "$LOG"
  echo "# LOCAL anvil chainId 31337 on 127.0.0.1:8599 (not public). Anvil's own output is discarded." >> "$LOG"
  AFAIL=0
  APID=""

  # run_ac <label> <command...>: logs the command, its output and EXIT to session.log; sets LAST_OUT.
  run_ac() {
    shift
    printf '$ %s\n' "$*" >> "$LOG"
    LAST_OUT="$("$@" 2>&1)"
    LAST_RC=$?
    printf '%s\n' "$LAST_OUT" >> "$LOG"
    echo "EXIT=$LAST_RC" >> "$LOG"
    return $LAST_RC
  }
  need() { # need <label> <rc>: a required step; failure marks the anvil section failed
    if [ "$2" -ne 0 ]; then echo "REQUIRED STEP FAILED: $1 (EXIT=$2)" >> "$LOG"; AFAIL=1; fi
  }

  if lsof -iTCP:8599 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port 8599 already in use; refusing to start anvil" >> "$LOG"
    AFAIL=1
  else
    "$ANVIL" --host 127.0.0.1 --port 8599 >/dev/null 2>&1 &
    APID=$!
    echo "anvil started, PID $APID" >> "$LOG"
    trap 'if [ -n "$APID" ]; then kill "$APID" 2>/dev/null; fi' EXIT INT TERM
    READY=0
    for _ in $(seq 1 20); do
      if "$CAST" chain-id --rpc-url "$RPC" >/dev/null 2>&1; then READY=1; break; fi
      sleep 1
    done
    need "anvil ready" $((1 - READY))
  fi

  if [ "$AFAIL" -eq 0 ]; then
    run_ac "chain-id" "$CAST" chain-id --rpc-url "$RPC"; need "chain-id" $?
    CHAIN="$LAST_OUT"
    run_ac "accounts" "$CAST" rpc --rpc-url "$RPC" eth_accounts; need "eth_accounts" $?
    ACC="$(echo "$LAST_OUT" | grep -o '0x[0-9a-fA-F]\{40\}' | head -1)"
    echo "account0 (unlocked anvil account, public address): $ACC" >> "$LOG"

    run_ac "forge-create" "$FORGE" create src/Level1Deployer.sol:Level1Deployer --rpc-url "$RPC" \
      --unlocked --from "$ACC" --broadcast; need "forge create" $?
    DEP="$(echo "$LAST_OUT" | grep -o 'Deployed to: 0x[0-9a-fA-F]\{40\}' | grep -o '0x[0-9a-fA-F]\{40\}')"
    DEPTX="$(echo "$LAST_OUT" | grep -o 'Transaction hash: 0x[0-9a-fA-F]\{64\}' | grep -o '0x[0-9a-fA-F]\{64\}')"
    [ -n "$DEP" ] || need "deployer address parsed" 1

    ITEMS=""; NA=""; NB=""; NC=""; CO=""
    if [ -n "$DEP" ]; then
      run_ac "items" "$CAST" call --rpc-url "$RPC" "$DEP" "items()(address)"; need "items()" $?; ITEMS="$LAST_OUT"
      run_ac "npcA" "$CAST" call --rpc-url "$RPC" "$DEP" "npcA()(address)"; need "npcA()" $?; NA="$LAST_OUT"
      run_ac "npcB" "$CAST" call --rpc-url "$RPC" "$DEP" "npcB()(address)"; need "npcB()" $?; NB="$LAST_OUT"
      run_ac "npcC" "$CAST" call --rpc-url "$RPC" "$DEP" "npcC()(address)"; need "npcC()" $?; NC="$LAST_OUT"
      run_ac "coordinator" "$CAST" call --rpc-url "$RPC" "$DEP" "coordinator()(address)"; need "coordinator()" $?; CO="$LAST_OUT"
      for pair in "Level1Deployer:$DEP" "GameItems:$ITEMS" "NPC_A:$NA" "NPC_B:$NB" "NPC_C:$NC" "AtomicCoordinator:$CO"; do
        name="${pair%%:*}"; addr="${pair#*:}"
        run_ac "codesize-$name" "$CAST" codesize --rpc-url "$RPC" "$addr"; need "codesize $name" $?
      done
    fi

    if [ -n "$CO" ] && [ -n "$ITEMS" ]; then
      run_ac "startRun" "$CAST" send --rpc-url "$RPC" --unlocked --from "$ACC" "$CO" "startRun()"; need "startRun" $?
      START_TX="$(echo "$LAST_OUT" | grep '^transactionHash' | awk '{print $2}')"
      START_STATUS="$(echo "$LAST_OUT" | grep '^status' | awk '{print $2}')"
      run_ac "runId" "$CAST" to-dec "$ACC"; need "runId" $?
      RID="$LAST_OUT"
      run_ac "snapshot-before" "$CAST" call --rpc-url "$RPC" "$CO" "currentSnapshotHash(uint256)(bytes32)" "$RID"
      need "snapshot before" $?; SNAP="$LAST_OUT"
      run_ac "A1" "$CAST" keccak "NOBODYFIRST.L1.A1"; need "keccak A1" $?; A1="$LAST_OUT"
      run_ac "B1" "$CAST" keccak "NOBODYFIRST.L1.B1"; need "keccak B1" $?; B1="$LAST_OUT"
      Z="0x0000000000000000000000000000000000000000000000000000000000000000"

      # Expected rejection of a short package: recorded, not a failure; revert data must be BadPackageLength(1).
      run_ac "bad-package-call" "$CAST" call --rpc-url "$RPC" --from "$ACC" "$CO" \
        "execute(uint256,(uint8,bytes32)[],uint256,bytes32)" "$RID" "[(0,$A1)]" 0 "$SNAP"
      BADRC=$?
      if echo "$LAST_OUT" | grep -q "0x1ac68832"; then
        echo "bad package: revert selector 0x1ac68832 (BadPackageLength) present; expected rejection, EXIT=$BADRC" >> "$LOG"
      else
        echo "bad package: expected BadPackageLength selector not found" >> "$LOG"; AFAIL=1
      fi

      run_ac "execute" "$CAST" send --rpc-url "$RPC" --unlocked --from "$ACC" "$CO" \
        "execute(uint256,(uint8,bytes32)[],uint256,bytes32)" "$RID" "[(0,$A1),(1,$B1),(2,$Z)]" 0 "$SNAP"
      need "execute" $?
      EXEC_TX="$(echo "$LAST_OUT" | grep '^transactionHash' | awk '{print $2}')"
      EXEC_STATUS="$(echo "$LAST_OUT" | grep '^status' | awk '{print $2}')"

      run_ac "snapshotBalances" "$CAST" call --rpc-url "$RPC" "$ITEMS" "snapshotBalances(uint256)(uint256[6])" "$RID"
      need "snapshotBalances" $?; BAL="$LAST_OUT"
      run_ac "runOf" "$CAST" call --rpc-url "$RPC" "$CO" "runOf(uint256)((address,bool,bool,uint64))" "$RID"
      need "runOf" $?; RUN="$LAST_OUT"
      run_ac "snapshot-after" "$CAST" call --rpc-url "$RPC" "$CO" "currentSnapshotHash(uint256)(bytes32)" "$RID"
      need "snapshot after" $?; SNAP_AFTER="$LAST_OUT"
      for n in A B C; do
        case $n in A) ADDR="$NA";; B) ADDR="$NB";; C) ADDR="$NC";; esac
        run_ac "permitOf-$n" "$CAST" call --rpc-url "$RPC" "$ADDR" "permitOf(uint256)((bytes32,bytes32,bytes32,bool))" "$RID"
        need "permitOf $n" $?
      done
      for tx in "$DEPTX" "$START_TX" "$EXEC_TX"; do
        if [ -n "$tx" ]; then
          run_ac "receipt-$tx" "$CAST" receipt --rpc-url "$RPC" "$tx" status
          need "receipt $tx" $?
        else
          need "tx hash parsed" 1
        fi
      done
      [ "$BAL" = "[0, 1, 1, 0, 0, 0]" ] || { echo "balance check failed: $BAL" >> "$LOG"; AFAIL=1; }
      echo "$RUN" | grep -q "false, true, 1" || { echo "run check failed: $RUN" >> "$LOG"; AFAIL=1; }

      {
        echo "{"
        echo "  \"label\": \"LOCAL anvil chainId $CHAIN on 127.0.0.1:8599, not public\","
        echo "  \"Level1Deployer\": \"$DEP\","
        echo "  \"GameItems\": \"$ITEMS\","
        echo "  \"NPC_A\": \"$NA\","
        echo "  \"NPC_B\": \"$NB\","
        echo "  \"NPC_C\": \"$NC\","
        echo "  \"AtomicCoordinator\": \"$CO\","
        echo "  \"deployerAccountUnlocked\": \"$ACC\","
        echo "  \"runId\": \"$RID\","
        echo "  \"txDeploy\": \"$DEPTX\","
        echo "  \"txStartRun\": \"$START_TX\", \"statusStartRun\": \"$START_STATUS\","
        echo "  \"txExecute\": \"$EXEC_TX\", \"statusExecute\": \"$EXEC_STATUS\","
        echo "  \"snapshotBalances_after_execute\": \"$BAL\","
        echo "  \"runOf_after_execute\": \"$RUN\","
        echo "  \"snapshot_after_execute\": \"$SNAP_AFTER\""
        echo "}"
      } > "$AD/addresses-and-results.json"
    fi
  fi

  # stop exactly the PID we started, then verify it is gone and the port is free
  if [ -n "$APID" ]; then
    kill "$APID" 2>/dev/null
    wait "$APID" 2>/dev/null
    sleep 1
    if kill -0 "$APID" 2>/dev/null; then
      echo "anvil PID $APID still running after kill" >> "$LOG"; AFAIL=1
    else
      echo "anvil PID $APID stopped (kill -0 fails)" >> "$LOG"
    fi
    if lsof -iTCP:8599 -sTCP:LISTEN >/dev/null 2>&1; then
      echo "port 8599 still listening" >> "$LOG"; AFAIL=1
    else
      echo "port 8599 free (lsof shows no listener)" >> "$LOG"
    fi
    APID=""
    trap - EXIT INT TERM
  fi
  echo "anvil section EXIT=$AFAIL" >> "$LOG"
  record "anvil-deploy2" "$AFAIL"
fi

# ---- signature cache after ---------------------------------------------------------------
{
  sig_report "AFTER this run"
} >> "$OUT/signatures-cache.txt" 2>&1

echo "summary written to $SUMMARY"
if [ "$FAILED" -eq 0 ]; then
  echo "ALL STEPS EXIT=0"
  exit 0
fi
echo "ONE OR MORE STEPS FAILED (see $SUMMARY)"
exit 1
