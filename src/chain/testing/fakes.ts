import { encodeErrorResult } from 'viem';
import { npcAbi } from '../abi.generated';
import { createController } from '../controller';
import { createPendingStore, memoryStorage } from '../pending';
import { runIdOf, toBalances } from '../plan';
import type { ChainGateway, ExecuteArgs, ReceiptResult, Replacement, RunHistory, WalletEvents, WalletGateway } from '../ports';
import type { Address, DeploymentCheck, DeploymentManifest, Hex, NpcRulesView, RunView } from '../types';

// Test doubles for the controller (no network, no browser). Not imported by production code.

export const P1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
export const P2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;
export const NONE = `0x${'0'.repeat(64)}` as Hex;
export const A1 = `0x${'a'.repeat(64)}` as Hex;
export const B1 = `0x${'b'.repeat(64)}` as Hex;
export const H = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
export const START = toBalances([1n, 0n, 0n, 1n, 0n, 0n]);
export const SOLVED = toBalances([0n, 1n, 1n, 0n, 0n, 0n]);

export const M: DeploymentManifest = {
  schema: 1, chainId: 31337, rpcUrl: 'http://127.0.0.1:8545',
  deployer: '0x5FbDB2315678afecb367f032d93F642f64180aa3', coordinator: '0xa16E02E87b7454126E5E10d957A927A7F5B5d2be',
  items: '0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968', npcA: '0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883',
  npcB: '0x10C6E9530F1C1AF873a391030a1D9E8ed0630D26', npcC: '0x603E1BD79259EbcbAaeD0c83eeC09cA0B89a5bcC',
  deployTxHash: H(1), deployBlockNumber: '1', deployBlockHash: H(2), sourceId: 's', forgeVersion: 'f', createdAt: 'c',
};
export const RULES: NpcRulesView[] = [
  { npcId: 0, address: M.npcA, offerId: A1, giveTo: 1, giveItem: 1, giveQty: 1, needFrom: 1, needItem: 2, needQty: 1, goalKey: 0, goalCoin: 1 },
  { npcId: 1, address: M.npcB, offerId: B1, giveTo: 0, giveItem: 2, giveQty: 1, needFrom: 0, needItem: 1, needQty: 1, goalKey: 1, goalCoin: 0 },
  { npcId: 2, address: M.npcC, offerId: NONE, giveTo: 0, giveItem: 0, giveQty: 0, needFrom: 0, needItem: 0, needQty: 0, goalKey: 0, goalCoin: 0 },
];

export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
export const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};
export const revertWith = (data: Hex) => new Error('execution reverted', { cause: { name: 'ContractFunctionRevertedError', raw: data } });

export class FakeChain implements ChainGateway {
  manifest = M;
  deploymentKey = `${M.coordinator.toLowerCase()}@${M.deployBlockHash}`;
  runs = new Map<bigint, RunView>();
  sent: ExecuteArgs[] = [];
  startRuns: Address[] = [];
  receipt = deferred<ReceiptResult>();
  replacement: Replacement | null = null;
  readFails = false;
  sendError: unknown = null;
  pendingKnown = true;
  minedReceipts = new Map<Hex, ReceiptResult>();
  nextHash = 0x100;
  /** Live re-validation result (e.g. stale after an Anvil restart + redeploy with the same addresses). */
  revalidateResult: DeploymentCheck = { ok: true, manifest: M };
  revalidations = 0;
  disposed = false;
  /** One-shot gates: when set, the named call waits until the test resolves it. */
  gates: Partial<Record<'readRun' | 'readRules' | 'simulate' | 'sendExecute' | 'readOutgoing', ReturnType<typeof deferred<void>>>> = {};
  readError: unknown = null;
  outgoingError: unknown = null;
  rules: NpcRulesView[] = RULES;
  waited: Hex[] = [];

  private async pass(name: keyof FakeChain['gates']) {
    const d = this.gates[name];
    if (d) {
      delete this.gates[name];
      await d.promise;
    }
  }
  rearm() {
    this.receipt = deferred<ReceiptResult>();
  }
  async revalidate() {
    this.revalidations++;
    return this.revalidateResult;
  }
  dispose() {
    this.disposed = true;
  }

  addRun(owner: Address, over: Partial<RunView> = {}) {
    const runId = runIdOf(owner);
    this.runs.set(runId, { runId, owner, active: true, solved: false, nonce: 0n, balances: START, snapshotHash: H(0x51), ...over });
  }
  async readRules() {
    await this.pass('readRules');
    return this.rules;
  }
  async readRun(runId: bigint) {
    await this.pass('readRun');
    if (this.readFails) throw new Error('fetch failed');
    if (this.readError) throw this.readError;
    return this.runs.get(runId) ?? null;
  }
  async readOutgoing(npcId: number, offerId: Hex) {
    await this.pass('readOutgoing');
    if (this.outgoingError) throw this.outgoingError;
    const r = RULES[npcId];
    if (offerId === NONE) return { hasTransfer: false, transfer: { fromNpc: 0, toNpc: 0, item: 0, qty: 0 } };
    return { hasTransfer: true, transfer: { fromNpc: npcId, toNpc: r.giveTo, item: r.giveItem, qty: r.giveQty } };
  }
  async simulateExecute(a: ExecuteArgs) {
    await this.pass('simulate');
    const [x, y] = a.package;
    if (x.offerId === A1 && y.offerId === B1) return;
    if (x.offerId === A1) throw revertWith(encodeErrorResult({ abi: npcAbi, errorName: 'PlanRejected', args: [0, 4] }));
    if (y.offerId === B1) throw revertWith(encodeErrorResult({ abi: npcAbi, errorName: 'PlanRejected', args: [0, 6] }));
    throw revertWith(encodeErrorResult({ abi: npcAbi, errorName: 'PlanRejected', args: [0, 9] }));
  }
  async sendStartRun(account: Address) {
    if (this.sendError) throw this.sendError;
    this.startRuns.push(account);
    return H(this.nextHash++);
  }
  async sendExecute(a: ExecuteArgs) {
    await this.pass('sendExecute');
    if (this.sendError) throw this.sendError;
    this.sent.push(a);
    return H(this.nextHash++);
  }
  async waitForReceipt(hash: Hex, onReplaced: (r: Replacement) => void) {
    this.waited.push(hash);
    try {
      const r = await this.receipt.promise;
      if (this.replacement) onReplaced(this.replacement);
      return r;
    } catch (e) {
      if (this.replacement) onReplaced(this.replacement);
      throw e;
    }
  }
  async getReceipt(hash: Hex) {
    return this.minedReceipts.get(hash) ?? null;
  }
  async hasTransaction() {
    return this.pendingKnown;
  }
  runHistory: RunHistory = { startRun: null, execute: null };
  async readRunHistory() {
    return this.runHistory;
  }
  /** Mines the last execute: applies it to the run and resolves the receipt. */
  mineExecute(
    opts: {
      status?: 'success' | 'reverted';
      balances?: typeof SOLVED;
      event?: boolean;
      solved?: boolean;
      eventAddress?: Address;
      eventRunId?: bigint;
    } = {},
  ) {
    const a = this.sent.at(-1)!;
    const status = opts.status ?? 'success';
    if (status === 'success') {
      const run = this.runs.get(a.runId)!;
      const solved = opts.solved ?? true;
      this.runs.set(a.runId, { ...run, solved, active: !solved, nonce: run.nonce + 1n, balances: opts.balances ?? SOLVED, snapshotHash: H(0x52) });
    }
    const args = { runId: (opts.eventRunId ?? a.runId).toString(), player: a.account };
    const events =
      status === 'success' && opts.event !== false
        ? [{ name: 'LevelSolved', address: opts.eventAddress ?? M.coordinator, args, logIndex: 4 }]
        : [];
    this.receipt.resolve({ hash: H(this.nextHash - 1), status, blockNumber: 9n, blockHash: H(0x99), to: M.coordinator, events });
  }
}

export class FakeWallet implements WalletGateway {
  accountsList: Address[] = [P1];
  chain = 31337;
  requested = 0;
  calls = 0;
  handlers: WalletEvents | null = null;
  async accounts() {
    this.calls++;
    return [...this.accountsList];
  }
  async requestAccounts() {
    this.requested++;
    return [...this.accountsList];
  }
  async chainId() {
    return this.chain;
  }
  async switchChain() {
    this.chain = 31337;
  }
  subscribe(h: WalletEvents) {
    this.handlers = h;
    return () => (this.handlers = null);
  }
}

export function setup(
  opts: {
    check?: DeploymentCheck;
    wallet?: FakeWallet | null;
    run?: boolean;
    storage?: ReturnType<typeof memoryStorage>;
    chain?: FakeChain;
    deploymentGate?: Promise<void>;
  } = {},
) {
  const chain = opts.chain ?? new FakeChain();
  if (opts.run !== false && !opts.chain) chain.addRun(P1);
  const wallet = opts.wallet === undefined ? new FakeWallet() : opts.wallet;
  const storage = opts.storage ?? memoryStorage();
  const pending = createPendingStore(storage);
  const check: DeploymentCheck = opts.check ?? { ok: true, manifest: M };
  const c = createController({
    loadDeployment: async () => {
      if (opts.deploymentGate) await opts.deploymentGate;
      return { check, gateway: check.ok ? chain : null };
    },
    wallet,
    pending,
  });
  return { c, chain, wallet, storage, pending, s: () => c.getState() };
}

export async function readyToSend(t: ReturnType<typeof setup>) {
  await t.c.ready;
  await flush();
  t.c.actions.setChoice({ A: true, B: true });
  await t.c.actions.preview();
  if (t.s().phase !== 'preview-ready') throw new Error(`expected preview-ready, got ${t.s().phase}`);
}

