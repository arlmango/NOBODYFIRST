import { describe, expect, it } from 'vitest';
import { createPendingStore, memoryStorage, pendingKey } from './pending';
import type { PendingRecord } from './types';

const ACC = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
const OTHER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;
const DEP = '0x5fbdb2315678afecb367f032d93f642f64180aa3@0xabc';
const HASH = `0x${'a'.repeat(64)}` as const;
const rec = (over: Partial<PendingRecord> = {}): PendingRecord => ({
  hash: HASH, kind: 'execute', account: ACC, chainId: 31337, deploymentKey: DEP, savedAt: '2026-10-12T00:00:00.000Z', ...over,
});

describe('pending record store', () => {
  it('is bound to account + chain + deployment', () => {
    const store = createPendingStore(memoryStorage());
    store.save(rec());
    expect(store.load(ACC, 31337, DEP)?.hash).toBe(HASH);
    expect(store.load(ACC.toLowerCase() as typeof ACC, 31337, DEP)?.hash).toBe(HASH); // account case-insensitive
    expect(store.load(OTHER, 31337, DEP)).toBeNull();
    expect(store.load(ACC, 1, DEP)).toBeNull();
    expect(store.load(ACC, 31337, `${DEP}-redeployed`)).toBeNull();
  });

  it('stores only PendingRecord fields — never a result such as `solved`', () => {
    const storage = memoryStorage();
    createPendingStore(storage).save({ ...rec(), solved: true, balances: [1] } as unknown as PendingRecord);
    const stored = Object.values(storage.dump());
    expect(stored).toHaveLength(1);
    const parsed = JSON.parse(stored[0]) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['account', 'chainId', 'deploymentKey', 'hash', 'kind', 'savedAt']);
    expect(stored[0]).not.toContain('solved');
  });

  it('drops corrupt or mismatching entries instead of trusting them', () => {
    const storage = memoryStorage();
    const key = pendingKey(ACC, 31337, DEP);
    storage.setItem(key, '{not json');
    const store = createPendingStore(storage);
    expect(store.load(ACC, 31337, DEP)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
    storage.setItem(key, JSON.stringify(rec({ account: OTHER })));
    expect(store.load(ACC, 31337, DEP)).toBeNull();
    storage.setItem(key, JSON.stringify(rec({ hash: '0x1234' as `0x${string}` })));
    expect(store.load(ACC, 31337, DEP)).toBeNull();
  });

  it('clear(hash) only removes the record for that hash', () => {
    const store = createPendingStore(memoryStorage());
    store.save(rec());
    store.clear(ACC, 31337, DEP, `0x${'b'.repeat(64)}`);
    expect(store.load(ACC, 31337, DEP)).not.toBeNull();
    store.clear(ACC, 31337, DEP, HASH);
    expect(store.load(ACC, 31337, DEP)).toBeNull();
  });

  it('works (as a no-op) without storage and survives a throwing storage', () => {
    const none = createPendingStore(null);
    none.save(rec());
    expect(none.load(ACC, 31337, DEP)).toBeNull();
    const throwing = createPendingStore({
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => throwing.save(rec())).not.toThrow();
    expect(throwing.load(ACC, 31337, DEP)).toBeNull();
  });
});

it('pruneOtherDeployments removes only this account’s records of other deployments on this chain', () => {
  const store = createPendingStore(memoryStorage());
  store.save(rec());
  store.save(rec({ deploymentKey: 'old@0x1' }));
  store.save(rec({ account: OTHER, deploymentKey: 'old@0x1' }));
  store.save(rec({ chainId: 1, deploymentKey: 'old@0x1' }));
  store.pruneOtherDeployments(ACC, 31337, DEP);
  expect(store.load(ACC, 31337, DEP)).not.toBeNull();
  expect(store.load(ACC, 31337, 'old@0x1')).toBeNull();
  expect(store.load(OTHER, 31337, 'old@0x1')).not.toBeNull();
  expect(store.load(ACC, 1, 'old@0x1')).not.toBeNull();
});
