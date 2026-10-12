// Transaction details for the Local chain mode. Real data from the controller's ProofData only;
// anything unknown is shown as "Not available". No explorer links, no placeholder hashes.
import type { ReactNode } from 'react';
import type { ChainEvent, ProofData, ReplacementView, TxStatus, TxView } from '../chain/types';
import {
  NOT_AVAILABLE,
  NPC_LETTERS,
  formatHolding,
  holdingOf,
  realAddress,
  realHash,
} from '../screens/useChainLevel';

const TX_STATUS: Readonly<Record<TxStatus, string>> = {
  'awaiting-wallet': 'Waiting for wallet confirmation (not sent yet)',
  pending: 'Sent, waiting for network confirmation',
  confirmed: 'Confirmed',
  reverted: 'Reverted',
  rejected: 'Declined in the wallet (nothing sent)',
  replaced: 'Replaced by another transaction',
  cancelled: 'Cancelled',
  unknown: 'Unknown (sent, outcome not read yet)',
};

const REPLACEMENT_REASON: Readonly<Record<ReplacementView['reason'], string>> = {
  replaced: 'Replaced by a different transaction',
  cancelled: 'Cancelled (nothing of this game executed)',
  repriced: 'repriced (same transaction resent with a different fee)',
};

function Value({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === '' ? (
    <dd className="proof__na">{NOT_AVAILABLE}</dd>
  ) : (
    <dd>
      <code className="proof__value">{children}</code>
    </dd>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="proof__row">
      <dt>{label}</dt>
      <Value>{value}</Value>
    </div>
  );
}

function EventItem({ event }: { event: ChainEvent }) {
  const args = Object.entries(event.args);
  return (
    <li>
      <code className="proof__value">
        {event.name}
        {args.length > 0 && `(${args.map(([k, v]) => `${k}: ${v}`).join(', ')})`}
      </code>
    </li>
  );
}

function EventList({ events }: { events: readonly ChainEvent[] }) {
  return events.length > 0 ? (
    <ol className="proof__events">
      {[...events]
        .sort((a, b) => a.logIndex - b.logIndex)
        .map((event) => (
          <EventItem key={`${event.logIndex}-${event.name}`} event={event} />
        ))}
    </ol>
  ) : (
    <p className="proof__na">{NOT_AVAILABLE}</p>
  );
}

function ReplacementGroup({ rep }: { rep: ReplacementView }) {
  // Repriced: the mined hash and its receipt are already the main section; only the original is new.
  const repriced = rep.reason === 'repriced';
  return (
    <div className="proof__replacement">
      <h4>Replacement</h4>
      <dl className="proof__list">
        {rep.originalHash && <Row label="Original hash" value={realHash(rep.originalHash)} />}
        <Row label="Reason" value={REPLACEMENT_REASON[rep.reason]} />
        {!repriced && (
          <>
            <Row label="Hash" value={realHash(rep.hash)} />
            <Row label="Block" value={rep.blockNumber !== null ? rep.blockNumber.toString() : null} />
            <Row label="Block hash" value={realHash(rep.blockHash)} />
            <Row label="Receipt status" value={rep.receiptStatus} />
          </>
        )}
      </dl>
      {!repriced && (
        <>
          <h4>Replacement events</h4>
          <EventList events={rep.events} />
        </>
      )}
    </div>
  );
}

function TxSection({ title, tx }: { title: string; tx: TxView | null }) {
  // A replaced/cancelled hash was never mined: no receipt fields for it; the mined tx is the replacement.
  const superseded = tx !== null && (tx.status === 'replaced' || tx.status === 'cancelled');
  return (
    <section className="proof__section" aria-label={title}>
      <h3>{title}</h3>
      {tx ? (
        <>
          <dl className="proof__list">
            <Row label={superseded ? 'Original hash' : 'Hash'} value={realHash(tx.hash)} />
            <Row label="Status" value={TX_STATUS[tx.status]} />
            {!superseded && (
              <>
                <Row label="Block" value={tx.blockNumber !== null ? tx.blockNumber.toString() : null} />
                <Row label="Block hash" value={realHash(tx.blockHash)} />
                <Row label="Receipt status" value={tx.receiptStatus} />
              </>
            )}
            {superseded && !tx.replacement && <Row label="Replaced by" value={realHash(tx.replacedBy)} />}
          </dl>
          {!superseded && (
            <>
              <h4>Events</h4>
              <EventList events={tx.events} />
            </>
          )}
          {tx.replacement && <ReplacementGroup rep={tx.replacement} />}
        </>
      ) : (
        <p className="proof__na">{NOT_AVAILABLE}</p>
      )}
    </section>
  );
}

export interface ProofPanelProps {
  proof: ProofData;
}

export function ProofPanel({ proof }: ProofPanelProps) {
  const finalBalances = proof.finalBalances;
  return (
    <details className="proof ui">
      <summary className="proof__summary">Transaction details</summary>
      <div className="proof__body">
        <dl className="proof__list">
          <Row label="Mode" value={proof.mode} />
          <Row label="Chain ID" value={proof.chainId !== null ? String(proof.chainId) : null} />
          <Row label="RPC" value={proof.rpcUrl} />
          <Row label="Coordinator" value={realAddress(proof.coordinator)} />
          <Row label="Item ledger" value={realAddress(proof.items)} />
          <Row label="NPC A" value={realAddress(proof.npcA)} />
          <Row label="NPC B" value={realAddress(proof.npcB)} />
          <Row label="NPC C" value={realAddress(proof.npcC)} />
          <Row label="Player" value={realAddress(proof.player)} />
          <Row label="Run ID" value={proof.runId !== null ? proof.runId.toString() : null} />
        </dl>
        <TxSection title="Start run transaction" tx={proof.startRunTx} />
        <TxSection title="Execute transaction" tx={proof.executeTx} />
        <section className="proof__section" aria-label="Final balances">
          <h3>Final balances (read from the ledger)</h3>
          {finalBalances ? (
            <dl className="proof__list">
              {NPC_LETTERS.map((letter, id) => (
                <Row key={letter} label={letter} value={formatHolding(holdingOf(finalBalances, id))} />
              ))}
            </dl>
          ) : (
            <p className="proof__na">{NOT_AVAILABLE}</p>
          )}
        </section>
      </div>
    </details>
  );
}
