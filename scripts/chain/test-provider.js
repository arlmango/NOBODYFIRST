/*
 * TEST-ONLY EIP-1193 provider for Playwright. NOT a wallet extension.
 * Never imported by src/, never part of dist/. Injected by the e2e tests with
 *   page.addInitScript({ path: 'scripts/chain/test-provider.js' })
 * after the test has set `window.__NF_TEST_RPC` (an http loopback Anvil URL, e.g. http://127.0.0.1:8545).
 * It holds NO private keys: accounts are Anvil's unlocked accounts, transactions are sent with
 * eth_sendTransaction { from }. Signing methods and any method outside the allow-list are refused.
 * Control hooks for tests: window.__nfTestProvider (see README-chain.md).
 */
(function () {
  'use strict';

  const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const rawRpc = window.__NF_TEST_RPC;
  let rpcUrl;
  try {
    rpcUrl = new URL(String(rawRpc));
  } catch (e) {
    throw new Error('NF test provider: window.__NF_TEST_RPC must be a URL');
  }
  if (rpcUrl.protocol !== 'http:' || !LOOPBACK.has(rpcUrl.hostname)) {
    throw new Error(`NF test provider: refusing non-loopback RPC host "${rpcUrl.hostname}"`);
  }
  const RPC = rpcUrl.href;

  // Read-only JSON-RPC methods forwarded unchanged to Anvil.
  const READ_ONLY = new Set([
    'eth_call', 'eth_getCode', 'eth_getBalance', 'eth_blockNumber', 'eth_getTransactionReceipt',
    'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getLogs',
    'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory',
    'eth_getTransactionCount', 'net_version',
  ]);

  const state = {
    authorized: window.__NF_TEST_PREAUTH === true,
    accountIndex: 0,
    chainOverride: null, // lowercase hex string or null (null = real Anvil chain)
    failRpc: false,
    rejectQueue: [], // { method?: string }
    nextId: 1,
  };
  const listeners = new Map();
  const requestLog = [];
  const sentTransactions = [];

  function rpcError(code, message, data) {
    const err = new Error(message);
    err.code = code;
    if (data !== undefined) err.data = data;
    return err;
  }

  function emit(event, payload) {
    for (const fn of [...(listeners.get(event) || [])]) {
      try {
        fn(payload);
      } catch (e) {
        console.error('NF test provider listener error', e);
      }
    }
  }

  async function forward(method, params) {
    if (state.failRpc) throw new TypeError('NF test provider: simulated network failure');
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: state.nextId++, method, params }),
    });
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw rpcError(-32603, 'NF test provider: invalid RPC response');
    }
    if (json.error) throw rpcError(json.error.code ?? -32603, json.error.message ?? 'RPC error', json.error.data);
    return json.result;
  }

  function normaliseChainId(value) {
    let big;
    try {
      if (typeof value === 'number' && Number.isInteger(value)) big = BigInt(value);
      else if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) big = BigInt(value);
      else if (typeof value === 'string' && /^[0-9]+$/.test(value)) big = BigInt(value);
    } catch (e) {
      big = undefined;
    }
    if (big === undefined) throw rpcError(-32602, `NF test provider: invalid chain id ${String(value)}`);
    return `0x${big.toString(16)}`;
  }

  async function realChainId() {
    return normaliseChainId(await forward('eth_chainId', []));
  }

  async function currentChainId() {
    return state.chainOverride ?? (await realChainId());
  }

  async function anvilAccounts() {
    const list = await forward('eth_accounts', []);
    return Array.isArray(list) ? list : [];
  }

  async function selectedAccount() {
    const list = await anvilAccounts();
    return list[state.accountIndex] ?? null;
  }

  const handlers = {
    async eth_accounts() {
      if (!state.authorized) return [];
      const acc = await selectedAccount();
      return acc ? [acc] : [];
    },
    async eth_requestAccounts() {
      const acc = await selectedAccount();
      if (!acc) throw rpcError(-32002, 'NF test provider: no Anvil accounts available');
      if (!state.authorized) {
        state.authorized = true;
        emit('accountsChanged', [acc]);
      }
      return [acc];
    },
    async eth_chainId() {
      return currentChainId();
    },
    async wallet_switchEthereumChain(params) {
      const want = normaliseChainId(params?.[0]?.chainId);
      const before = await currentChainId();
      const real = await realChainId();
      if (want !== real) throw rpcError(4902, 'Unrecognized chain ID: NF test provider only offers the Anvil chain');
      state.chainOverride = null;
      const after = await currentChainId();
      if (after !== before) emit('chainChanged', after);
      return null;
    },
    async eth_sendTransaction(params) {
      if (!state.authorized) throw rpcError(4100, 'Unauthorized: eth_requestAccounts has not been granted');
      const tx = params?.[0];
      if (!tx || typeof tx !== 'object') throw rpcError(-32602, 'NF test provider: invalid transaction params');
      const acc = await selectedAccount();
      if (!acc) throw rpcError(4100, 'NF test provider: no account selected');
      if (tx.from !== undefined && String(tx.from).toLowerCase() !== acc.toLowerCase()) {
        throw rpcError(-32602, 'NF test provider: "from" is not the selected account');
      }
      if (state.chainOverride !== null && state.chainOverride !== (await realChainId())) {
        throw rpcError(4901, 'Chain disconnected: the test wallet is on a different network');
      }
      const hash = await forward('eth_sendTransaction', [{ ...tx, from: acc }]);
      sentTransactions.push(hash);
      return hash;
    },
  };

  async function request(args) {
    if (!args || typeof args.method !== 'string') throw rpcError(-32600, 'NF test provider: invalid request');
    const { method } = args;
    const params = args.params ?? [];
    requestLog.push(method);
    if (/sign/i.test(method)) throw rpcError(4200, `NF test provider: signing is not available (${method})`);
    const idx = state.rejectQueue.findIndex((r) => r.method === undefined || r.method === method);
    if (idx !== -1) {
      state.rejectQueue.splice(idx, 1);
      throw rpcError(4001, 'User rejected the request.');
    }
    if (Object.prototype.hasOwnProperty.call(handlers, method)) return handlers[method](params);
    if (READ_ONLY.has(method)) return forward(method, params);
    throw rpcError(4200, `NF test provider: method not allowed (${method})`);
  }

  const provider = {
    isNfTestProvider: true,
    request,
    on(event, fn) {
      if (typeof fn !== 'function') return provider;
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return provider;
    },
    removeListener(event, fn) {
      const list = listeners.get(event);
      if (list) listeners.set(event, list.filter((f) => f !== fn));
      return provider;
    },
  };
  provider.addListener = provider.on;
  provider.off = provider.removeListener;
  provider.enable = () => request({ method: 'eth_requestAccounts' });

  const hooks = {
    async setAccountIndex(i) {
      const list = await anvilAccounts();
      if (!Number.isInteger(i) || i < 0 || i >= list.length) throw new Error(`NF test provider: account index ${i} out of range`);
      state.accountIndex = i;
      if (state.authorized) emit('accountsChanged', [list[i]]);
      return list[i];
    },
    async setChainId(value) {
      const want = normaliseChainId(value);
      const before = await currentChainId();
      state.chainOverride = want;
      if (want !== before) emit('chainChanged', want);
      return want;
    },
    rejectNext(method) {
      state.rejectQueue.push({ method: typeof method === 'string' ? method : undefined });
      return state.rejectQueue.length;
    },
    failRpc(on) {
      state.failRpc = on === true;
      return state.failRpc;
    },
    async authorize() {
      const acc = await selectedAccount();
      if (!acc) throw new Error('NF test provider: no Anvil accounts available');
      if (!state.authorized) {
        state.authorized = true;
        emit('accountsChanged', [acc]);
      }
      return acc;
    },
    disconnect() {
      state.authorized = false;
      emit('accountsChanged', []);
      emit('disconnect', rpcError(4900, 'Disconnected (NF test provider)'));
    },
    clearLog() {
      requestLog.length = 0;
      sentTransactions.length = 0;
    },
    getState() {
      return {
        authorized: state.authorized,
        accountIndex: state.accountIndex,
        chainOverride: state.chainOverride,
        failRpc: state.failRpc,
        pendingRejections: state.rejectQueue.length,
      };
    },
    get sentTransactions() {
      return sentTransactions;
    },
    get requestLog() {
      return requestLog;
    },
  };

  Object.defineProperty(window, 'ethereum', { value: provider, configurable: true, writable: true });
  Object.defineProperty(window, '__nfTestProvider', { value: hooks, configurable: true, writable: false });
})();
