# NOBODY FIRST — stage 2 toolchain smoke test (opus-env)

Date: 2026-10-12 (UTC 05:26–05:30). Host: macOS 27.0 (26A428), Darwin 27.0.0, arm64 (Apple Silicon), native (sysctl.proc_translated = 0).
Executed by: opus-env (model `claude-opus-5-5`).

**Scope:** this is a tooling smoke test only. It proves that the project-local toolchain compiles, tests and runs a local node. It is **not** evidence about NOBODY FIRST mechanics, game rules, or any stage-2 contract. No production contracts were written.

## Versions used

| Tool | Path (relative to `contracts/`) | Version |
|---|---|---|
| forge | `./.tools/bin/forge` | 1.8.5 (commit 51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f) |
| cast | `./.tools/bin/cast` | 1.8.5 (same commit) |
| anvil | `./.tools/bin/anvil` | 1.8.5 (same commit) |
| chisel | `./.tools/bin/chisel` | 1.8.5 (not used beyond `--version`) |
| solc | `./.tools/solc/solc-0.8.37` | 0.8.37+commit.f401782d (universal Mach-O; arm64 slice used) |
| forge-std | `lib/forge-std` | v1.17.0, commit f3dae6e6ee381f25eb6a246f7da9b85c91a68219 |

Binary hashes match haiku-env's `install-manifest.sha256` (forge, cast, anvil, chisel, solc: OK). The `.tools/_dl/*.tar.gz` entry in that manifest was already absent when this smoke run started; opus-env did not touch `.tools/`.

## Config (`contracts/foundry.toml`)

`src="src"`, `test="test"`, `out="out"`, `libs=["lib"]`, `cache_path="cache"`, `solc="./.tools/solc/solc-0.8.37"`, `auto_detect_solc=false`, `offline=true`, remapping `forge-std/=lib/forge-std/src/`. The relative solc path form works as-is: forge 1.8.5 resolved it and compiled with it (artifact metadata records `"compiler":{"version":"0.8.37+commit.f401782d"}`). No solc download was attempted; there is no `~/.svm`.

`contracts/src/.gitkeep` exists only so the `src` dir is present; it holds no contracts.

## Commands (copy-paste, run from `/Users/mango/NOBODYFIRST/contracts`)

```sh
cd /Users/mango/NOBODYFIRST/contracts
./.tools/bin/forge --version
./.tools/bin/cast --version
./.tools/bin/anvil --version
./.tools/solc/solc-0.8.37 --version
./.tools/bin/forge build
./.tools/bin/forge test -vvv
./.tools/bin/forge test -vvvv --match-test test_WriteThenRevert_ExpectRevertRollsBackStorage

# local node (127.0.0.1 only), then stop exactly that PID
lsof -nP -iTCP:8599            # expect no output (port free)
./.tools/bin/anvil --host 127.0.0.1 --port 8599 > /tmp/anvil-out.txt 2>&1 &
APID=$!
sleep 1
./.tools/bin/cast chain-id --rpc-url http://127.0.0.1:8599      # 31337
./.tools/bin/cast block-number --rpc-url http://127.0.0.1:8599  # 0
lsof -nP -a -p "$APID" -iTCP -sTCP:LISTEN                       # 127.0.0.1:8599 only
kill "$APID"; wait "$APID"
lsof -nP -iTCP:8599            # expect no output (port free again)

# frontend integrity (from project root)
cd /Users/mango/NOBODYFIRST && shasum -a 256 -c contracts/evidence/env/frontend-baseline.sha256
git -C /Users/mango/NOBODYFIRST status --short
```

## Results

| Step | Command | Exit | Result | Log |
|---|---|---|---|---|
| OS + versions | `uname -a`, `sw_vers`, `--version` x5 | all 0 | versions as in table above | `forge-version.log` |
| Build | `forge build` | 0 | "Compiling 20 files with Solc 0.8.37 … Compiler run successful!" | `forge-build.log` |
| Test | `forge test -vvv` | 0 | 3 passed, 0 failed, 0 skipped | `forge-test.log` |
| Trace | `forge test -vvvv --match-test test_WriteThenRevert_ExpectRevertRollsBackStorage` | 0 | trace shows `writeThenRevert(999)` → `[Revert] ToolchainSmoke: write-then-revert`, then `getValue()` → 7 | `forge-test.log` |
| Anvil | start on 127.0.0.1:8599 (PID 49670) | — | answered after ~500 ms | `anvil-session.log` |
| | `cast chain-id` | 0 | `31337` | |
| | `cast block-number` | 0 | `0` | |
| | `cast client` | 0 | `anvil/v1.8.5` | |
| | `lsof` / `netstat` listen check | 0 | only `127.0.0.1:8599` (tcp4); no `*`/`0.0.0.0`/`[::]` listener | |
| | `kill 49670` | 0 | SIGTERM sufficed (no escalation); `kill -0` → No such process; `lsof :8599` empty; `cast chain-id` → connection refused | |
| Frontend baseline | `shasum -a 256 -c …/frontend-baseline.sha256` | 0 | package.json, package-lock.json, index.html, vite.config.ts, tsconfig.json: OK | this file |
| Git | `git status --short` | 0 | repo has no commits (0 tracked files); everything is untracked `??`; no tracked-file edits possible/none made | this file |

Tests (`test/ToolchainSmoke.t.sol`, contract `ToolchainSmokeTest`, harness `ToolchainSmokeHarness`):

1. `test_StorageWriteAndRead` — PASS: set/get of a `uint256` storage slot (0 → 42 → max).
2. `test_WriteThenRevert_ExpectRevertRollsBackStorage` — PASS: storage set to 7; `vm.expectRevert(bytes("ToolchainSmoke: write-then-revert"))`; `writeThenRevert(999)` writes then reverts; storage still 7.
3. `test_WriteThenRevert_TryCatchRollsBackStorage` — PASS: same without the revert cheatcode — `try/catch Error(string)` asserts the call reverted, the reason equals the exact string, and storage is unchanged (11).

Anvil stdout prints the well-known default dev accounts/keys; it was kept only in the session scratchpad and not copied into evidence. No keys were used, no transactions sent, no public RPC used.

## Writes outside the project

- `~/.foundry/cache/signatures` (31183 bytes, sha256 `fb390d35d080a835b57d69347b0f6b80d78a676bf81f609b3ed7fc26472f79e8`), with dirs `~/.foundry/` and `~/.foundry/cache/`, created 10:27:04 local (05:27:04Z), i.e. by the first `forge build`. This is forge's function-signature cache; it did not exist before this run. Not deleted (report only).
- Not present after the run: `~/.svm`, `~/.config/foundry`, `~/Library/Caches/foundry`, `~/Library/Application Support/foundry`, `~/.foundry/anvil`.
- Inside the project, build products went to `contracts/out/` and `contracts/cache/` (both git-ignored by the orchestrator's `.gitignore`).

## What this proves / does not prove

Proves: forge 1.8.5 + local solc 0.8.37 + forge-std v1.17.0 work together offline on this Mac with no auto-detect/download; the EVM rolls back a storage write when the call reverts, observed both via `vm.expectRevert` and via plain `try/catch`; anvil 1.8.5 starts on loopback only, answers `chainId=31337`, and stops cleanly.

Does not prove: anything about NOBODY FIRST game logic, items, NPCs, coordinators, gas budgets, security, or any deployment target other than a throwaway local Anvil.

## Re-run

Run the commands block above from `contracts/`. Then regenerate the manifest last:

```sh
cd /Users/mango/NOBODYFIRST/contracts
shasum -a 256 foundry.toml test/ToolchainSmoke.t.sol evidence/env/SMOKE-README.md \
  evidence/env/forge-version.log evidence/env/forge-build.log evidence/env/forge-test.log \
  evidence/env/anvil-session.log > evidence/env/smoke-manifest.sha256
shasum -a 256 -c evidence/env/smoke-manifest.sha256
```
