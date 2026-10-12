// Receipt → TxView mapping (pure; shared by the gateway and the controller).

import type { ReceiptResult } from './ports';
import type { Hex, ReplacementView, TxView } from './types';

export function txViewFromReceipt(kind: TxView['kind'], r: ReceiptResult): TxView {
  return {
    kind,
    hash: r.hash,
    status: r.status === 'success' ? 'confirmed' : 'reverted',
    blockNumber: r.blockNumber,
    blockHash: r.blockHash,
    receiptStatus: r.status,
    events: r.events,
    replacedBy: null,
    replacement: null,
  };
}

/** `originalHash` = the hash that was sent (for 'repriced' it differs from the mined hash shown in TxView). */
export function replacementView(reason: ReplacementView['reason'], r: ReceiptResult, originalHash: Hex): ReplacementView {
  return { hash: r.hash, blockNumber: r.blockNumber, blockHash: r.blockHash, receiptStatus: r.status, events: r.events, reason, originalHash };
}
