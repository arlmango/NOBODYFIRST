// Pending transaction record in localStorage. The ONLY thing persisted by the Local chain mode:
// a tx hash the wallet returned, bound to account + chainId + deployment. Never a result, never `solved`.

import type { Address, Hex, PendingRecord } from './types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Optional enumeration (localStorage has both) — used only to prune records of old deployments. */
  readonly length?: number;
  key?(index: number): string | null;
}

const PREFIX = 'nobodyfirst.local.pending.v1';
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/** Storage key bound to chain, account (case-insensitive) and deployment. */
export function pendingKey(account: Address, chainId: number, deploymentKey: string): string {
  return `${PREFIX}:${chainId}:${account.toLowerCase()}:${deploymentKey.toLowerCase()}`;
}

/** Strict shape check; returns a fresh object with only the PendingRecord fields. */
export function parsePendingRecord(raw: unknown): PendingRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.hash !== 'string' || !HASH_RE.test(r.hash)) return null;
  if (r.kind !== 'startRun' && r.kind !== 'execute') return null;
  if (typeof r.account !== 'string' || !ADDR_RE.test(r.account)) return null;
  if (typeof r.chainId !== 'number' || !Number.isSafeInteger(r.chainId) || r.chainId <= 0) return null;
  if (typeof r.deploymentKey !== 'string' || r.deploymentKey.length === 0) return null;
  if (typeof r.savedAt !== 'string') return null;
  return {
    hash: r.hash as Hex,
    kind: r.kind,
    account: r.account as Address,
    chainId: r.chainId,
    deploymentKey: r.deploymentKey,
    savedAt: r.savedAt,
  };
}

export interface PendingStore {
  save(record: PendingRecord): void;
  /** Returns the record for exactly this account/chain/deployment, or null. Corrupt entries are removed. */
  load(account: Address, chainId: number, deploymentKey: string): PendingRecord | null;
  clear(account: Address, chainId: number, deploymentKey: string, hash?: Hex): void;
  /** Removes this account's records that belong to any other deployment on this chain. */
  pruneOtherDeployments(account: Address, chainId: number, deploymentKey: string): void;
}

export function createPendingStore(storage: StorageLike | null): PendingStore {
  const safe = <T>(fn: () => T, fallback: T): T => {
    if (!storage) return fallback;
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    save(record) {
      const clean = parsePendingRecord(record);
      if (!clean) return;
      safe(() => storage?.setItem(pendingKey(clean.account, clean.chainId, clean.deploymentKey), JSON.stringify(clean)), undefined);
    },
    load(account, chainId, deploymentKey) {
      const key = pendingKey(account, chainId, deploymentKey);
      return safe(() => {
        const text = storage?.getItem(key);
        if (!text) return null;
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        const rec = parsePendingRecord(parsed);
        const matches =
          rec !== null &&
          rec.account.toLowerCase() === account.toLowerCase() &&
          rec.chainId === chainId &&
          rec.deploymentKey.toLowerCase() === deploymentKey.toLowerCase();
        if (!matches) {
          storage?.removeItem(key);
          return null;
        }
        return rec;
      }, null);
    },
    clear(account, chainId, deploymentKey, hash) {
      const key = pendingKey(account, chainId, deploymentKey);
      safe(() => {
        if (hash) {
          const text = storage?.getItem(key);
          const rec = text ? parsePendingRecord(JSON.parse(text)) : null;
          if (rec && rec.hash.toLowerCase() !== hash.toLowerCase()) return;
        }
        storage?.removeItem(key);
      }, undefined);
    },
    pruneOtherDeployments(account, chainId, deploymentKey) {
      const keep = pendingKey(account, chainId, deploymentKey);
      const prefix = `${PREFIX}:${chainId}:${account.toLowerCase()}:`;
      safe(() => {
        if (!storage?.key || typeof storage.length !== 'number') return;
        const stale: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && k.startsWith(prefix) && k !== keep) stale.push(k);
        }
        for (const k of stale) storage.removeItem(k);
      }, undefined);
    },
  };
}

/** In-memory storage (tests, or when localStorage is unavailable). */
export function memoryStorage(): StorageLike & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    dump: () => Object.fromEntries(m),
  };
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}
