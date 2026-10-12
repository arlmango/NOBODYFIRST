#!/usr/bin/env node
// local-chain.mjs — local Anvil lifecycle + deployment manifest for NOBODY FIRST stage 3.
// Commands (all accept --port N, default 8545, host always 127.0.0.1):
//   start    start Anvil we own (PID + log under scripts/chain/.run/)
//   deploy   deploy the unchanged Level1Deployer from Anvil account 0 (unlocked), verify, write manifest
//   status   report Anvil/manifest state as JSON
//   stop     stop ONLY the Anvil recorded in our PID file, after verifying it is ours
// Last stdout line is always a JSON object. Exit codes: 0 ok, 1 failed check/operation, 2 refused/precondition.
// No private keys are read, printed or passed on a command line.

import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..', '..');
const CONTRACTS = join(ROOT, 'contracts');
const TOOLS = join(CONTRACTS, '.tools', 'bin');
const FORGE = join(TOOLS, 'forge');
const CAST = join(TOOLS, 'cast');
const ANVIL = join(TOOLS, 'anvil');
const RUN_DIR = join(SCRIPT_DIR, '.run');
const PID_FILE = join(RUN_DIR, 'anvil.pid');
const LOG_FILE = join(RUN_DIR, 'anvil.log');
const MANIFEST = join(CONTRACTS, 'deployments', 'local-anvil.json');
const SRC_DIR = join(CONTRACTS, 'src');
const HOST = '127.0.0.1';
const DEFAULT_PORT = 8545;
const CHAIN_ID = 31337;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
// Foundry cache is kept outside the project, inside the permitted location.
const FOUNDRY_CACHE = join(homedir(), '.foundry', 'cache', 'nobodyfirst-stage3');
const forgeEnv = () => ({ ...process.env, FOUNDRY_CACHE_PATH: FOUNDRY_CACHE });

const log = (msg) => process.stderr.write(`[local-chain] ${msg}\n`);
const finish = (code, obj) => {
  console.log(JSON.stringify({ ok: code === 0, ...obj }));
  process.exit(code);
};
const fail = (code, command, error, extra = {}) => finish(code, { command, error, ...extra });

// ---------- argument parsing ----------
function parseArgs(argv) {
  const [command, ...rest] = argv;
  let port = DEFAULT_PORT;
  let portGiven = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--port') {
      const n = Number(rest[++i]);
      if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error('--port must be an integer 1024-65535');
      port = n;
      portGiven = true;
    } else {
      throw new Error(`unknown argument: ${rest[i]}`);
    }
  }
  return { command, port, portGiven };
}

// ---------- low-level helpers ----------
async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

/** Returns chainId (number) if the RPC answers, else null. */
async function rpcChainId(url) {
  try {
    return parseInt(await rpc(url, 'eth_chainId'), 16);
  } catch {
    return null;
  }
}

function cast(args) {
  return execFileSync(CAST, [...args], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function castAddr(to, sig, callArgs, rpcUrl) {
  return cast(['call', to, sig, ...callArgs, '--rpc-url', rpcUrl]).toLowerCase();
}

function portFree(port) {
  return new Promise((resolveFree) => {
    const srv = createServer();
    srv.once('error', () => resolveFree(false));
    srv.listen(port, HOST, () => srv.close(() => resolveFree(true)));
  });
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** True only if the process command line is our Anvil binary bound to this port. */
function isOurAnvil(pid, port) {
  let cmd;
  try {
    cmd = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  } catch {
    return false;
  }
  return cmd.includes(ANVIL) && cmd.includes(`--port ${port}`) && cmd.includes(`--host ${HOST}`);
}

function readPidFile() {
  if (!existsSync(PID_FILE)) return { present: false };
  try {
    const d = JSON.parse(readFileSync(PID_FILE, 'utf8'));
    if (!Number.isInteger(d.pid) || !Number.isInteger(d.port)) throw new Error('bad shape');
    return { present: true, ...d };
  } catch {
    return { present: true, corrupt: true };
  }
}

function writeJsonAtomic(path, obj, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, { mode });
  renameSync(tmp, path);
}

/** Removes the manifest so the UI cannot use data from an earlier deployment. */
function removeManifest() {
  try {
    unlinkSync(MANIFEST);
    return true;
  } catch {
    return false;
  }
}

function sourceId() {
  const files = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.sol')) files.push(p);
    }
  };
  walk(SRC_DIR);
  const rels = files.map((abs) => ({ abs, rel: relative(CONTRACTS, abs).split('\\').join('/') }));
  rels.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const h = createHash('sha256');
  for (const { abs, rel } of rels) {
    const buf = readFileSync(abs);
    h.update(`${rel}\0${buf.length}\0`);
    h.update(buf);
  }
  return h.digest('hex');
}

function forgeVersion() {
  const v = execFileSync(FORGE, ['--version'], { encoding: 'utf8', env: forgeEnv() });
  return /Version:\s*(\S+)/.exec(v)?.[1] ?? 'unknown';
}

// ---------- deployment verification (shared by deploy and status) ----------
/**
 * Returns a list of human-readable failures (empty = valid). Throws only on RPC/cast transport errors.
 * addrs: { coordinator, items, npcA, npcB, npcC }
 */
async function verifyDeployment(rpcUrl, addrs, deploy) {
  const failures = [];
  const named = Object.entries(addrs);
  for (const [name, a] of named) {
    const code = await rpc(rpcUrl, 'eth_getCode', [a, 'latest']);
    if (!code || code.length <= 2) failures.push(`no code at ${name} ${a}`);
  }
  const block = await rpc(rpcUrl, 'eth_getBlockByNumber', [`0x${BigInt(deploy.blockNumber).toString(16)}`, false]);
  if (!block || block.hash?.toLowerCase() !== deploy.blockHash.toLowerCase()) {
    failures.push(`block ${deploy.blockNumber} hash is ${block?.hash ?? 'missing'}, expected ${deploy.blockHash}`);
  }
  const receipt = await rpc(rpcUrl, 'eth_getTransactionReceipt', [deploy.txHash]);
  if (!receipt) failures.push(`deploy tx ${deploy.txHash} has no receipt`);
  else if (receipt.blockHash.toLowerCase() !== deploy.blockHash.toLowerCase()) failures.push('deploy receipt blockHash mismatch');
  if (failures.length) return failures;
  // Wiring checks only make sense once code exists at every address.
  const eq = (x, y) => x.toLowerCase() === y.toLowerCase();
  const { coordinator, items, npcA, npcB, npcC } = addrs;
  const npcs = [npcA, npcB, npcC];
  const checks = [
    ['coordinator.items()', castAddr(coordinator, 'items()(address)', [], rpcUrl), items],
    ['items.coordinator()', castAddr(items, 'coordinator()(address)', [], rpcUrl), coordinator],
    ...npcs.flatMap((npc, i) => [
      [`coordinator.npcAddress(${i})`, castAddr(coordinator, 'npcAddress(uint8)(address)', [String(i)], rpcUrl), npc],
      [`items.npcAddress(${i})`, castAddr(items, 'npcAddress(uint8)(address)', [String(i)], rpcUrl), npc],
    ]),
    ...[['npcA', npcA], ['npcB', npcB], ['npcC', npcC]].flatMap(([n, a]) => [
      [`${n}.items()`, castAddr(a, 'items()(address)', [], rpcUrl), items],
      [`${n}.coordinator()`, castAddr(a, 'coordinator()(address)', [], rpcUrl), coordinator],
    ]),
  ];
  for (const [label, got, want] of checks) {
    if (!eq(got, want)) failures.push(`wiring ${label} = ${got}, expected ${want}`);
  }
  return failures;
}

function validateShape(m) {
  const problems = [];
  if (m.schema !== 1) problems.push('schema must be 1');
  if (!Number.isInteger(m.chainId)) problems.push('chainId must be an integer');
  for (const k of ['deployer', 'coordinator', 'items', 'npcA', 'npcB', 'npcC']) {
    if (typeof m[k] !== 'string' || !ADDR.test(m[k])) problems.push(`${k} is not an address`);
  }
  if (!HASH.test(m.deployTxHash ?? '')) problems.push('deployTxHash invalid');
  if (!HASH.test(m.deployBlockHash ?? '')) problems.push('deployBlockHash invalid');
  if (typeof m.deployBlockNumber !== 'string' || !/^\d+$/.test(m.deployBlockNumber)) problems.push('deployBlockNumber must be a decimal string');
  for (const k of ['rpcUrl', 'sourceId', 'forgeVersion', 'createdAt']) {
    if (typeof m[k] !== 'string' || m[k].length === 0) problems.push(`${k} missing`);
  }
  try {
    const u = new URL(m.rpcUrl);
    if (u.protocol !== 'http:' || !LOOPBACK.has(u.hostname)) problems.push('rpcUrl is not loopback http');
  } catch {
    problems.push('rpcUrl is not a URL');
  }
  return problems;
}

/** Validates the manifest file against the live chain. Returns { valid, failures, manifest }. */
async function checkManifestLive() {
  if (!existsSync(MANIFEST)) return { valid: false, failures: ['manifest missing'] };
  let m;
  try {
    m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    return { valid: false, failures: [`manifest unreadable: ${e.message}`] };
  }
  const shape = validateShape(m);
  if (shape.length) return { valid: false, failures: shape, manifest: m };
  const chainId = await rpcChainId(m.rpcUrl);
  if (chainId === null) return { valid: false, failures: [`rpc unreachable at ${m.rpcUrl}`], manifest: m };
  if (chainId !== m.chainId) return { valid: false, failures: [`chainId ${chainId} != manifest ${m.chainId}`], manifest: m };
  try {
    const failures = await verifyDeployment(
      m.rpcUrl,
      { coordinator: m.coordinator, items: m.items, npcA: m.npcA, npcB: m.npcB, npcC: m.npcC },
      { blockNumber: m.deployBlockNumber, blockHash: m.deployBlockHash, txHash: m.deployTxHash },
    );
    return { valid: failures.length === 0, failures, manifest: m };
  } catch (e) {
    return { valid: false, failures: [`verification error: ${e.message}`], manifest: m };
  }
}

// ---------- commands ----------
async function cmdStart(port) {
  const pid = readPidFile();
  const rpcUrl = `http://${HOST}:${port}`;
  if (pid.present && !pid.corrupt && isPidAlive(pid.pid)) {
    if (isOurAnvil(pid.pid, pid.port)) return fail(2, 'start', `already running (pid ${pid.pid}); run stop first`, { pid: pid.pid, port: pid.port });
    return fail(2, 'start', `pid file points at a live process that is not our Anvil (pid ${pid.pid}); refusing`);
  }
  if (pid.present) unlinkSync(PID_FILE); // stale or corrupt pid file
  if (!(await portFree(port))) return fail(2, 'start', `port ${port} on ${HOST} is already in use; refusing to start`);
  const manifestRemoved = removeManifest();
  mkdirSync(RUN_DIR, { recursive: true });
  const logFd = openSync(LOG_FILE, 'a', 0o600);
  const child = spawn(ANVIL, ['--host', HOST, '--port', String(port), '--chain-id', String(CHAIN_ID)], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  closeSync(logFd);
  if (!child.pid) return fail(1, 'start', 'failed to spawn anvil');
  writeJsonAtomic(PID_FILE, { pid: child.pid, port, host: HOST, command: 'anvil', startedAt: new Date().toISOString() }, 0o600);
  log(`anvil spawned pid ${child.pid}; waiting for eth_chainId on ${rpcUrl}`);
  const deadline = Date.now() + 20000;
  let chainId = null;
  while (Date.now() < deadline) {
    if (!isPidAlive(child.pid)) break;
    chainId = await rpcChainId(rpcUrl);
    if (chainId !== null) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (chainId === null) {
    if (isPidAlive(child.pid) && isOurAnvil(child.pid, port)) process.kill(child.pid, 'SIGTERM');
    try { unlinkSync(PID_FILE); } catch {}
    return fail(1, 'start', 'anvil did not answer eth_chainId in time (see scripts/chain/.run/anvil.log)', { manifestRemoved });
  }
  return finish(0, { command: 'start', pid: child.pid, host: HOST, port, rpcUrl, chainId, logFile: 'scripts/chain/.run/anvil.log', manifestRemoved });
}

async function cmdDeploy(port) {
  const rpcUrl = `http://${HOST}:${port}`;
  // Never reuse an earlier manifest: remove it first, write a new one only after every check passes.
  const removedOld = removeManifest();
  const deployFail = (error, code = 1) => {
    const manifestRemoved = removeManifest();
    return fail(code, 'deploy', error, { manifestRemoved, removedOld });
  };
  const pid = readPidFile();
  const ownedRunning = pid.present && !pid.corrupt && isPidAlive(pid.pid) && isOurAnvil(pid.pid, port);
  const chainId = ownedRunning ? await rpcChainId(rpcUrl) : null;
  if (!ownedRunning || chainId === null) return deployFail('no running Anvil started by local-chain.mjs on this port; run start first', 2);
  if (chainId !== CHAIN_ID) return deployFail(`chainId ${chainId} is not ${CHAIN_ID}`, 2);
  let accounts;
  try {
    accounts = await rpc(rpcUrl, 'eth_accounts');
  } catch (e) {
    return deployFail(`eth_accounts failed: ${e.message}`);
  }
  const acct0 = accounts?.[0];
  if (!acct0 || !ADDR.test(acct0)) return deployFail('Anvil returned no unlocked account 0');
  log(`deploying Level1Deployer from unlocked account 0 ${acct0}`);
  let fc;
  try {
    const out = execFileSync(
      FORGE,
      ['create', 'src/Level1Deployer.sol:Level1Deployer', '--rpc-url', rpcUrl, '--unlocked', '--from', acct0, '--broadcast', '--json'],
      { cwd: CONTRACTS, env: forgeEnv(), encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    // forge prints a pretty-printed JSON object (possibly after build messages): take the last top-level one.
    const block = [...out.matchAll(/^\{[\s\S]*?^\}/gm)].pop();
    if (!block) throw new Error('no JSON object in forge create output');
    fc = JSON.parse(block[0]);
  } catch (e) {
    return deployFail(`forge create failed: ${(e.stderr || e.message).toString().split('\n').slice(-6).join(' | ')}`);
  }
  const deployer = fc.deployedTo;
  const txHash = fc.transactionHash;
  if (!ADDR.test(deployer ?? '') || !HASH.test(txHash ?? '')) return deployFail('forge create output lacks deployedTo/transactionHash');
  let receipt;
  try {
    receipt = await rpc(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
  } catch (e) {
    return deployFail(`receipt read failed: ${e.message}`);
  }
  if (!receipt || receipt.status !== '0x1') return deployFail(`deploy tx ${txHash} not successful`);
  if (receipt.contractAddress?.toLowerCase() !== deployer.toLowerCase()) return deployFail('receipt contractAddress differs from forge output');
  const blockNumber = BigInt(receipt.blockNumber).toString();
  const blockHash = receipt.blockHash;
  let addrs;
  try {
    const getter = (sig) => castAddr(deployer, `${sig}()(address)`, [], rpcUrl);
    addrs = {
      items: getter('items'),
      npcA: getter('npcA'),
      npcB: getter('npcB'),
      npcC: getter('npcC'),
      coordinator: getter('coordinator'),
    };
  } catch (e) {
    return deployFail(`reading deployer getters failed: ${e.message.split('\n')[0]}`);
  }
  const addrPairs = Object.entries(addrs);
  for (const [k, v] of addrPairs) if (!ADDR.test(v)) return deployFail(`getter ${k} returned ${v}`);
  let failures;
  try {
    failures = await verifyDeployment(rpcUrl, addrs, { blockNumber, blockHash, txHash });
  } catch (e) {
    return deployFail(`verification error: ${e.message}`);
  }
  if (failures.length) return deployFail(`verification failed: ${failures.join('; ')}`);
  const manifest = {
    schema: 1,
    chainId,
    rpcUrl,
    deployer,
    coordinator: addrs.coordinator,
    items: addrs.items,
    npcA: addrs.npcA,
    npcB: addrs.npcB,
    npcC: addrs.npcC,
    deployTxHash: txHash,
    deployBlockNumber: blockNumber,
    deployBlockHash: blockHash,
    sourceId: sourceId(),
    forgeVersion: forgeVersion(),
    createdAt: new Date().toISOString(),
  };
  writeJsonAtomic(MANIFEST, manifest);
  return finish(0, { command: 'deploy', manifestPath: 'contracts/deployments/local-anvil.json', manifest });
}

async function cmdStatus(port, portGiven) {
  const pid = readPidFile();
  const usePort = pid.present && !pid.corrupt ? pid.port : port;
  const rpcUrl = `http://${HOST}:${usePort}`;
  const pidAlive = pid.present && !pid.corrupt && isPidAlive(pid.pid);
  const isAnvil = pidAlive && isOurAnvil(pid.pid, pid.port);
  const chainId = await rpcChainId(rpcUrl);
  const check = await checkManifestLive();
  return finish(0, {
    command: 'status',
    anvilRunning: Boolean(isAnvil && chainId !== null),
    pid: pid.present && !pid.corrupt ? pid.pid : null,
    pidFilePresent: pid.present,
    pidAlive,
    isOurAnvil: isAnvil,
    port: usePort,
    portOverridden: portGiven && usePort !== port,
    rpcUrl,
    chainId,
    manifestPresent: existsSync(MANIFEST),
    manifestValid: check.valid,
    manifestFailures: check.failures,
  });
}

async function cmdStop(port, portGiven) {
  const pid = readPidFile();
  if (!pid.present) {
    const free = await portFree(port);
    if (!free) return fail(2, 'stop', `port ${port} in use but no pid file; not ours, refusing`);
    return finish(0, { command: 'stop', stopped: false, reason: 'no pid file; port free', portFree: true, manifestRemoved: removeManifest() });
  }
  if (pid.corrupt) return fail(2, 'stop', 'pid file is corrupt; refusing to guess a PID');
  if (portGiven && pid.port !== port) return fail(2, 'stop', `pid file is for port ${pid.port}, not ${port}`);
  if (!isPidAlive(pid.pid)) {
    unlinkSync(PID_FILE);
    return finish(0, { command: 'stop', stopped: false, reason: 'process not running; stale pid file removed', portFree: await portFree(pid.port), manifestRemoved: removeManifest() });
  }
  if (!isOurAnvil(pid.pid, pid.port)) return fail(2, 'stop', `pid ${pid.pid} is not our Anvil on port ${pid.port}; refusing to kill`);
  log(`stopping anvil pid ${pid.pid}`);
  process.kill(pid.pid, 'SIGTERM');
  const waitDead = async (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end && isPidAlive(pid.pid)) await new Promise((r) => setTimeout(r, 200));
    return !isPidAlive(pid.pid);
  };
  let dead = await waitDead(8000);
  if (!dead && isOurAnvil(pid.pid, pid.port)) {
    process.kill(pid.pid, 'SIGKILL');
    dead = await waitDead(3000);
  }
  if (!dead) return fail(1, 'stop', `pid ${pid.pid} did not exit`);
  unlinkSync(PID_FILE);
  const manifestRemoved = removeManifest();
  let free = false;
  for (let i = 0; i < 25 && !free; i++) {
    free = await portFree(pid.port);
    if (!free) await new Promise((r) => setTimeout(r, 200));
  }
  if (!free) return fail(1, 'stop', `port ${pid.port} still busy after stopping pid ${pid.pid}`);
  return finish(0, { command: 'stop', stopped: true, pid: pid.pid, port: pid.port, portFree: true, manifestRemoved });
}

// ---------- main ----------
async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    return fail(2, 'usage', e.message);
  }
  const { command, port, portGiven } = parsed;
  if (!['start', 'deploy', 'status', 'stop'].includes(command)) {
    return fail(2, command ?? 'usage', 'usage: local-chain.mjs <start|deploy|status|stop> [--port N]');
  }
  for (const [label, p] of [['forge', FORGE], ['cast', CAST], ['anvil', ANVIL]]) {
    if (!existsSync(p)) return fail(2, command, `${label} not found at ${p}`);
  }
  if (command === 'start') return cmdStart(port);
  if (command === 'deploy') return cmdDeploy(port);
  if (command === 'status') return cmdStatus(port, portGiven);
  return cmdStop(port, portGiven);
}

main().catch((e) => fail(1, process.argv[2] ?? 'unknown', e.message));
