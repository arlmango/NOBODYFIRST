// viem clients for the Local chain mode.
// Reads: public client over http(manifest.rpcUrl), loopback only. Wallet: EIP-1193 window.ethereum
// through custom(provider) — used for accounts, chain and transactions only.

import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  getAddress,
  http,
  isAddress,
  type Chain,
  type PublicClient,
  type WalletClient,
} from 'viem';
import type { WalletEvents, WalletGateway } from './ports';
import type { Address, DeploymentManifest } from './types';

/** Minimal EIP-1193 surface we rely on. */
export interface Eip1193Provider {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: never[]) => void): unknown;
  removeListener?(event: string, listener: (...args: never[]) => void): unknown;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** True only for http(s) URLs whose host is a loopback name/address. */
export function isLoopbackUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  return LOOPBACK_HOSTS.has(u.hostname.toLowerCase());
}

export function assertLoopback(url: string): void {
  if (!isLoopbackUrl(url)) throw new Error(`Refusing non-loopback RPC URL: ${url}`);
}

export function localChain(manifest: DeploymentManifest): Chain {
  assertLoopback(manifest.rpcUrl);
  return defineChain({
    id: manifest.chainId,
    name: 'Anvil (local)',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [manifest.rpcUrl] } },
  });
}

export function createReadClient(manifest: DeploymentManifest): PublicClient {
  assertLoopback(manifest.rpcUrl);
  return createPublicClient({
    chain: localChain(manifest),
    transport: http(manifest.rpcUrl, { retryCount: 1, timeout: 10_000 }),
    pollingInterval: 500,
    cacheTime: 0,
  });
}

export function createSigner(provider: Eip1193Provider, manifest: DeploymentManifest): WalletClient {
  return createWalletClient({ chain: localChain(manifest), transport: custom(provider) });
}

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as unknown as { ethereum?: unknown }).ethereum;
  if (typeof eth !== 'object' || eth === null) return null;
  if (typeof (eth as { request?: unknown }).request !== 'function') return null;
  return eth as Eip1193Provider;
}

export function parseAccounts(value: unknown): Address[] {
  if (!Array.isArray(value)) return [];
  return value.filter((a): a is string => typeof a === 'string' && isAddress(a, { strict: false })).map((a) => getAddress(a));
}

export function parseChainId(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string') {
    const n = value.startsWith('0x') || value.startsWith('0X') ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
    if (Number.isSafeInteger(n)) return n;
  }
  throw new Error(`Wallet returned an invalid chain id: ${String(value)}`);
}

function errorCode(e: unknown): unknown {
  return typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
}

export function createWalletGateway(provider: Eip1193Provider): WalletGateway {
  return {
    async accounts() {
      return parseAccounts(await provider.request({ method: 'eth_accounts' }));
    },
    async requestAccounts() {
      return parseAccounts(await provider.request({ method: 'eth_requestAccounts' }));
    },
    async chainId() {
      return parseChainId(await provider.request({ method: 'eth_chainId' }));
    },
    async switchChain(manifest) {
      assertLoopback(manifest.rpcUrl);
      const chainIdHex = `0x${manifest.chainId.toString(16)}`;
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
      } catch (e) {
        if (errorCode(e) !== 4902) throw e;
        // The wallet does not know the local chain: add it (loopback RPC only), which also switches.
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: chainIdHex,
              chainName: 'Anvil (local)',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: [manifest.rpcUrl],
            },
          ],
        });
      }
    },
    subscribe(events: WalletEvents) {
      if (typeof provider.on !== 'function') return () => {};
      const onAccounts = (a: unknown) => events.accountsChanged(parseAccounts(a));
      const onChain = (c: unknown) => {
        try {
          events.chainChanged(parseChainId(c));
        } catch {
          events.chainChanged(-1);
        }
      };
      const onDisconnect = () => events.disconnect();
      provider.on('accountsChanged', onAccounts as (...args: never[]) => void);
      provider.on('chainChanged', onChain as (...args: never[]) => void);
      provider.on('disconnect', onDisconnect as (...args: never[]) => void);
      return () => {
        provider.removeListener?.('accountsChanged', onAccounts as (...args: never[]) => void);
        provider.removeListener?.('chainChanged', onChain as (...args: never[]) => void);
        provider.removeListener?.('disconnect', onDisconnect as (...args: never[]) => void);
      };
    },
  };
}
