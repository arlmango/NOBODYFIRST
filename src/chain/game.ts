// Real ChainGateway over viem: contract reads, simulation of the very same execute(), transactions
// through the EIP-1193 wallet, receipt/event decoding and getLogs-based restoration of a run.

import { parseEventLogs, zeroAddress, type Abi, type Log, type PublicClient, type TransactionReceipt, type WalletClient } from 'viem';
import { coordinatorAbi, itemsAbi, npcAbi } from './abi.generated';
import { createSigner, localChain, type Eip1193Provider } from './clients';
import { deploymentKeyOf, revalidateDeployment, type FetchLike } from './deployment';
import { stringifyArg } from './errors';
import { toBalances } from './plan';
import { txViewFromReceipt } from './txview';
import type { ChainGateway, ExecuteArgs, ReceiptResult, RunHistory } from './ports';
import type { Address, ChainEvent, DeploymentManifest, Hex, NpcRulesView, RunView, TxView } from './types';

export { txViewFromReceipt };

const mergedEventAbi: Abi = ([...coordinatorAbi, ...npcAbi, ...itemsAbi] as Abi).filter((i) => i.type === 'event');

/** Decodes the logs our five contracts emitted; logs from any other address are ignored. */
export function decodeGameEvents(logs: readonly Log[], m: DeploymentManifest): ChainEvent[] {
  const ours = new Set([m.coordinator, m.items, m.npcA, m.npcB, m.npcC].map((a) => a.toLowerCase()));
  const filtered = logs.filter((l) => ours.has(l.address.toLowerCase()));
  const parsed = parseEventLogs({ abi: mergedEventAbi, logs: filtered, strict: true });
  return parsed
    .map((p) => {
      const args: Record<string, string> = {};
      const raw = (p as unknown as { args?: unknown }).args;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) args[k] = stringifyArg(v);
      }
      return {
        name: (p as unknown as { eventName: string }).eventName,
        address: p.address as Address,
        args,
        logIndex: Number(p.logIndex ?? 0),
      };
    })
    .sort((a, b) => a.logIndex - b.logIndex);
}

export function receiptToResult(r: TransactionReceipt, m: DeploymentManifest): ReceiptResult {
  return {
    hash: r.transactionHash,
    status: r.status === 'success' ? 'success' : 'reverted',
    blockNumber: r.blockNumber,
    blockHash: r.blockHash,
    to: r.to ?? null,
    events: decodeGameEvents(r.logs, m),
  };
}

function named(e: unknown, ...names: string[]): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 8 && cur && typeof cur === 'object'; i++) {
    if (names.includes((cur as { name?: string }).name ?? '')) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export function createChainGateway(
  manifest: DeploymentManifest,
  client: PublicClient,
  provider: Eip1193Provider | null,
  fetchFn: FetchLike,
): ChainGateway {
  let disposed = false;
  const aborters = new Set<(e: Error) => void>();
  const m = manifest;
  const chain = localChain(m);
  const npcs: readonly Address[] = [m.npcA, m.npcB, m.npcC];
  let signer: WalletClient | null = null;
  const getSigner = (): WalletClient => {
    if (!provider) throw new Error('No browser wallet is available to send transactions.');
    signer ??= createSigner(provider, m);
    return signer;
  };
  const fromBlock = BigInt(m.deployBlockNumber);

  const gateway: ChainGateway = {
    manifest: m,
    deploymentKey: deploymentKeyOf(m),

    async readRules() {
      const out: NpcRulesView[] = [];
      const results = await Promise.all(
        npcs.map(async (address) => {
          const [r, own] = await Promise.all([
            client.readContract({ address, abi: npcAbi, functionName: 'rules' }),
            client.readContract({ address, abi: npcAbi, functionName: 'ownOffer' }),
          ]);
          return { address, r, own };
        }),
      );
      results.forEach(({ address, r, own }, i) => {
        if (Number(r.npcId) !== i) throw new Error(`NPC at ${address} reports id ${r.npcId}, expected ${i}`);
        if (own.toLowerCase() !== r.offerId.toLowerCase()) throw new Error(`NPC ${i}: ownOffer() and rules().offerId differ`);
        out.push({
          npcId: Number(r.npcId),
          address,
          offerId: own,
          giveTo: Number(r.giveTo),
          giveItem: Number(r.giveItem),
          giveQty: Number(r.giveQty),
          needFrom: Number(r.needFrom),
          needItem: Number(r.needItem),
          needQty: Number(r.needQty),
          goalKey: Number(r.goalKey),
          goalCoin: Number(r.goalCoin),
        });
      });
      return out;
    },

    async readRun(runId): Promise<RunView | null> {
      // One block for all three reads, so nonce, balances and hash describe the same moment.
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const [run, balances, snapshotHash] = await Promise.all([
        client.readContract({ address: m.coordinator, abi: coordinatorAbi, functionName: 'runOf', args: [runId], blockNumber }),
        client.readContract({ address: m.items, abi: itemsAbi, functionName: 'snapshotBalances', args: [runId], blockNumber }),
        client.readContract({ address: m.coordinator, abi: coordinatorAbi, functionName: 'currentSnapshotHash', args: [runId], blockNumber }),
      ]);
      if (run.owner.toLowerCase() === zeroAddress) return null;
      return {
        runId,
        owner: run.owner,
        active: run.active,
        solved: run.solved,
        nonce: BigInt(run.nonce),
        balances: toBalances(balances),
        snapshotHash,
      };
    },

    async readOutgoing(npcId, offerId) {
      const address = npcs[npcId];
      if (!address) throw new Error(`invalid npc id ${npcId}`);
      const [hasTransfer, t] = await client.readContract({ address, abi: npcAbi, functionName: 'outgoing', args: [offerId] });
      return {
        hasTransfer,
        transfer: { fromNpc: Number(t.fromNpc), toNpc: Number(t.toNpc), item: Number(t.item), qty: Number(t.qty) },
      };
    },

    async simulateExecute(a: ExecuteArgs, blockNumber?: bigint) {
      await client.simulateContract({
        address: m.coordinator,
        abi: coordinatorAbi,
        functionName: 'execute',
        args: [a.runId, a.package.map((s) => ({ npcId: s.npcId, offerId: s.offerId })), a.expectedNonce, a.expectedSnapshotHash],
        account: a.account,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      });
    },

    async sendStartRun(account) {
      return getSigner().writeContract({ address: m.coordinator, abi: coordinatorAbi, functionName: 'startRun', account, chain });
    },

    async sendExecute(a) {
      return getSigner().writeContract({
        address: m.coordinator,
        abi: coordinatorAbi,
        functionName: 'execute',
        args: [a.runId, a.package.map((s) => ({ npcId: s.npcId, offerId: s.offerId })), a.expectedNonce, a.expectedSnapshotHash],
        account: a.account,
        chain,
      });
    },

    async waitForReceipt(hash, onReplaced) {
      if (disposed) throw new Error('disposed');
      // viem has no abort signal here: race it, and stop reporting replacements once disposed.
      let abort!: (e: Error) => void;
      const aborted = new Promise<never>((_, reject) => (abort = reject));
      aborters.add(abort);
      try {
        const r = await Promise.race([
          client.waitForTransactionReceipt({
            hash,
            pollingInterval: 500,
            timeout: 120_000,
            onReplaced: (x) => {
              if (!disposed) onReplaced({ reason: x.reason, newHash: x.transaction.hash });
            },
          }),
          aborted,
        ]);
        return receiptToResult(r, m);
      } finally {
        aborters.delete(abort);
      }
    },

    revalidate() {
      return revalidateDeployment(m, client, fetchFn);
    },

    dispose() {
      disposed = true;
      for (const a of [...aborters]) a(new Error('Receipt wait stopped: the page left the Local chain mode.'));
      aborters.clear();
    },

    async getReceipt(hash) {
      try {
        return receiptToResult(await client.getTransactionReceipt({ hash }), m);
      } catch (e) {
        if (named(e, 'TransactionReceiptNotFoundError')) return null;
        throw e;
      }
    },

    async hasTransaction(hash) {
      try {
        await client.getTransaction({ hash });
        return true;
      } catch (e) {
        if (named(e, 'TransactionNotFoundError')) return false;
        throw e;
      }
    },

    async readRunHistory(runId): Promise<RunHistory> {
      const [started, solved] = await Promise.all([
        client.getContractEvents({ address: m.coordinator, abi: coordinatorAbi, eventName: 'RunStarted', args: { runId }, fromBlock, toBlock: 'latest' }),
        client.getContractEvents({ address: m.coordinator, abi: coordinatorAbi, eventName: 'LevelSolved', args: { runId }, fromBlock, toBlock: 'latest' }),
      ]);
      const view = async (kind: TxView['kind'], hash: Hex | null | undefined): Promise<TxView | null> => {
        if (!hash) return null;
        const r = await gateway.getReceipt(hash);
        return r ? txViewFromReceipt(kind, r) : null;
      };
      const [startRun, execute] = await Promise.all([
        view('startRun', started.at(-1)?.transactionHash),
        view('execute', solved.at(-1)?.transactionHash),
      ]);
      return { startRun, execute };
    },
  };
  return gateway;
}
