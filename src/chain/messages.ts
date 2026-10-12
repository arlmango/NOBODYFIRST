// One polite status sentence per phase for the live region.

import type { Phase } from './types';

const SENTENCES: Record<Phase, string> = {
  booting: 'Checking the local deployment.',
  'deployment-error': 'The local deployment could not be verified.',
  'no-wallet': 'No browser wallet found. Install or enable an EIP-1193 wallet to play on the local chain.',
  disconnected: 'Wallet not connected.',
  'wrong-network': 'The wallet is on a different network than the local Anvil chain.',
  loading: 'Reading the run from the contracts.',
  'rpc-unavailable': 'The local chain is not reachable.',
  'no-run': 'No run yet for this account. Start a run to begin.',
  'starting-run': 'Starting a run.',
  idle: 'Run active. Choose which promises to include.',
  previewing: 'Simulating the exchange on the local chain.',
  'preview-ready': 'Simulation succeeded. You can send the exchange.',
  'preview-failed': 'The simulation was rejected. Nothing was sent.',
  'stale-preview': 'The run changed since the preview. Nothing was sent; preview again.',
  executing: 'Sending the exchange.',
  verifying: 'Transaction confirmed. Reading the result back from the contracts.',
  success: 'Level solved. The contracts confirm the result.',
  reverted: 'The transaction reverted. Nothing changed.',
  'user-rejected': 'You rejected the request in the wallet. Nothing was sent.',
  'read-failed': 'The result could not be read back from the contracts. Check again.',
  'already-solved': 'This run is already solved. A repeat attempt is not supported in this version.',
};

export function announcementFor(phase: Phase): string {
  return SENTENCES[phase];
}

/** Why a preview became stale — always the true cause. */
export const STALE = {
  account: (now: string | undefined) => `The wallet account changed since the preview (now ${now ?? 'none'}). Nothing was sent; preview again.`,
  network: (now: number, expected: number) =>
    `The wallet network changed since the preview (chain ${now}, expected ${expected}). Nothing was sent.`,
  deployment: 'The deployment changed since the preview. Nothing was sent.',
  run: 'The run changed since the preview (game nonce or snapshot differs). Nothing was sent; preview again.',
  gone: 'This run no longer exists on the chain. Nothing was sent.',
  solvedElsewhere: (hash: string | null | undefined) =>
    `Your previewed exchange was not sent. This run was solved by another transaction (${hash ?? 'hash not available'}).`,
} as const;
