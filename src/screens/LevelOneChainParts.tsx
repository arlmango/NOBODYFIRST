// Local chain level: status panels, review panel and result view (split from LevelOneChain.tsx
// to keep files small). Pure presentation of the controller's state; actions arrive as props.
import type { MouseEvent, ReactNode } from 'react';
import type { ChainLevelActions, ChainLevelState, Phase, PreviewPlan, TxStatus, TxView } from '../chain/types';
import { Button } from '../components/Button';
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon } from '../components/Icons';
import { ItemIcon } from '../components/ItemIcon';
import { Portrait } from '../components/Portrait';
import {
  NOT_AVAILABLE,
  NPC_LETTERS,
  deploymentMessage,
  formatHolding,
  formatQty,
  formatTransfer,
  holdingOf,
  isObserver,
  npcLetter,
  realHash,
  runAction,
  type Holding,
} from './useChainLevel';

const START_COMMANDS = 'node scripts/chain/local-chain.mjs start && node scripts/chain/local-chain.mjs deploy';

export function Reading() {
  return (
    <ChainStatus title="Reading the local chain">
      <p>Reading the deployment, your wallet and your run from the contracts.</p>
    </ChainStatus>
  );
}

export function ChainStatus({ title, tone = 'info', children }: { title: string; tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <section className={`chain-status chain-status--${tone}`} aria-labelledby="chain-status-title">
      <h2 id="chain-status-title" tabIndex={-1}>
        {title}
      </h2>
      <div className="chain-status__body ui">{children}</div>
    </section>
  );
}

export interface ReviewPanelProps {
  plan: PreviewPlan;
  phase: Phase;
  txStatus: TxStatus | null;
  /** Execute was pressed for this preview; the controller is checking the run before sending. */
  sent: boolean;
  onExecute(): void;
  onEdit: (() => void) | null;
}

export function ReviewPanel({ plan, phase, txStatus, sent, onExecute, onEdit }: ReviewPanelProps) {
  const executeDisabled = phase !== 'preview-ready' || sent;
  let note = 'Sends one transaction from your wallet to the local chain. One transaction: if any check fails, all of it is reverted.';
  if (phase === 'preview-ready' && sent) note = 'Checking the run on the chain before sending.';
  else if (phase === 'executing') note = txStatus === 'awaiting-wallet' ? 'Confirm in your wallet.' : 'Waiting for network confirmation.';
  else if (phase === 'verifying') note = 'Transaction confirmed. Reading the result back from the contracts.';
  return (
    <section id="review" className="review" aria-labelledby="review-title">
      <h2 id="review-title" tabIndex={-1}>
        Review your exchange
      </h2>
      <p className="review__note ui">
        {phase === 'preview-ready' ? 'Simulated on the local chain. Nothing has moved yet.' : 'Simulated on the local chain.'}
      </p>
      <div className="review__grid">
        <div>
          <h3>Transfers</h3>
          <ul className="review__transfers">
            {plan.transfers.map((t) => (
              <li key={`${t.fromNpc}-${t.toNpc}-${t.item}`}>{formatTransfer(t)}</li>
            ))}
          </ul>
        </div>
        <div className="table-scroll">
          <h3 id="review-holdings">Before and expected after</h3>
          <table className="holdings-table ui" aria-labelledby="review-holdings">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Before</th>
                <th scope="col">Expected after</th>
              </tr>
            </thead>
            <tbody>
              {NPC_LETTERS.map((letter, npcId) => (
                <tr key={letter}>
                  <th scope="row">{letter}</th>
                  <td>{formatHolding(holdingOf(plan.before, npcId))}</td>
                  <td>{formatHolding(holdingOf(plan.expectedAfter, npcId))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="review__actions">
        <Button aria-disabled={executeDisabled || undefined} aria-describedby="review-sim" onClick={onExecute}>
          Execute deal
        </Button>
        <Button variant="quiet" aria-disabled={!onEdit || undefined} onClick={() => onEdit?.()}>
          Edit selection
        </Button>
      </div>
      <p id="review-sim" className="review__sim ui">
        {note}
      </p>
    </section>
  );
}

export interface PhaseStatusProps {
  state: ChainLevelState;
  actions: ChainLevelActions;
  /** Leaves an outcome (declined / reverted); focus moves to the given id when known. */
  onDismiss(focusId: string | null): void;
}

/** Everything that is not the board: gates (deployment, wallet, network, run) and outcomes. */
export function PhaseStatus({ state, actions, onDismiss }: PhaseStatusProps) {
  const { phase, deployment, failure, tx, run, preview } = state;
  const manifest = deployment?.ok ? deployment.manifest : null;
  const chainLabel = manifest ? ` (chain ID ${manifest.chainId})` : '';
  const recheck = () => runAction(actions.recheck);
  const detail = failure ? <p className="chain-detail">{failure.message}</p> : null;
  // A declined Execute returns to the same review; anything else returns to the selection.
  const backToReview = phase === 'user-rejected' && tx?.kind === 'execute' && preview !== null;
  const back = (
    <Button variant="quiet" onClick={() => onDismiss(backToReview ? null : run ? 'promise-A' : null)}>
      {backToReview ? 'Back to review' : run ? 'Back to selection' : 'Back'}
    </Button>
  );

  switch (phase) {
    case 'deployment-error':
      return (
        <ChainStatus title="Local deployment not usable" tone="error">
          <p>{deploymentMessage(deployment)}</p>
          {deployment && !deployment.ok && <p className="chain-detail">{deployment.detail}</p>}
          <p>Start Anvil and deploy the contracts from the project folder, then check again:</p>
          <pre className="chain-code">
            <code>{START_COMMANDS}</code>
          </pre>
          <Button onClick={recheck}>Check again</Button>
        </ChainStatus>
      );
    case 'no-wallet':
      return (
        <ChainStatus title="No wallet found" tone="error">
          <p>
            This mode needs a browser wallet (EIP-1193) connected to the local chain{chainLabel}. Enable one and
            reload this page.
          </p>
        </ChainStatus>
      );
    case 'disconnected':
      return (
        <ChainStatus title="Connect your wallet">
          <p>Your wallet is asked for an account only when you press the button.</p>
          <Button onClick={() => runAction(actions.connect)}>Connect wallet</Button>
        </ChainStatus>
      );
    case 'wrong-network':
      return (
        <ChainStatus title="Wrong network" tone="error">
          <p>
            Your wallet is on chain ID {state.walletChainId ?? 'unknown'}. This room runs on the local chain
            {chainLabel}.
          </p>
          <Button onClick={() => runAction(actions.switchNetwork)}>Switch network</Button>
        </ChainStatus>
      );
    case 'rpc-unavailable':
      return (
        <ChainStatus title="Local chain unavailable" tone="error">
          <p>
            Could not read from the local chain{manifest ? ` at ${manifest.rpcUrl}` : ''}. Nothing is shown until
            it answers.
          </p>
          {detail}
          <Button onClick={recheck}>Retry</Button>
        </ChainStatus>
      );
    case 'no-run':
      return (
        <ChainStatus title="Start a run">
          <p>This account has no run yet. Starting one sends a transaction that sets up A, B and C on the local chain.</p>
          {failure && (
            <p className="chain-detail" role="note">
              The last Start run attempt did not go through: {failure.message}
            </p>
          )}
          <Button onClick={() => runAction(actions.startRun)}>Start run</Button>
        </ChainStatus>
      );
    case 'starting-run':
      return (
        <ChainStatus title="Starting your run">
          <p>{tx?.status === 'awaiting-wallet' ? 'Confirm in your wallet.' : 'Waiting for network confirmation.'}</p>
          <Button aria-disabled="true" aria-describedby="start-run-wait">
            Start run
          </Button>
          <p id="start-run-wait" className="chain-detail">
            A run is already being started. No second request is sent.
          </p>
        </ChainStatus>
      );
    case 'preview-failed':
      if (failure?.kind === 'rpc') {
        // Not a contract rejection: the chain could not be reached (preview or pre-send recheck).
        return (
          <ChainStatus title="Local chain unreachable" tone="error">
            <p>Nothing was sent. The local chain could not be reached: {failure.message.replace(/\.\s*$/, '')}.</p>
            <Button onClick={() => runAction(actions.preview)}>Retry</Button>
          </ChainStatus>
        );
      }
      return (
        <ChainStatus title="This exchange would not work" tone="error">
          <p>{failure?.message ?? 'The simulation was rejected by the contracts.'}</p>
          {failure?.errorName ? (
            <p className="chain-detail">
              Contract error: {failure.errorName}
              {failure.errorArgs?.length ? `(${failure.errorArgs.join(', ')})` : ''}
            </p>
          ) : (
            failure?.rawData && <p className="chain-detail">Raw revert data: {failure.rawData}</p>
          )}
          <p>Nothing was sent. Change your selection and preview again.</p>
        </ChainStatus>
      );
    case 'stale-preview':
      return (
        <ChainStatus title="The preview is out of date" tone="error">
          <p>{failure?.message ?? 'The game state on the chain changed since your preview, so nothing was sent.'}</p>
          <Button onClick={() => runAction(actions.preview)}>Refresh preview</Button>
          <Button variant="quiet" onClick={() => onDismiss(null)}>
            Re-read the chain
          </Button>
        </ChainStatus>
      );
    case 'user-rejected':
      return (
        <ChainStatus title="Wallet request">
          <p>Request declined. Nothing was sent.</p>
          {back}
        </ChainStatus>
      );
    case 'reverted': {
      // "No game items moved" only when the receipt itself says reverted (the EVM rolled back every change).
      const unchanged = tx?.receiptStatus === 'reverted';
      return (
        <ChainStatus title="The transaction was reverted" tone="error">
          <p>
            {unchanged
              ? 'No game items moved: the receipt reports a revert, so the chain undid the whole transaction.'
              : 'The transaction did not go through. Its receipt could not confirm the outcome; see the transaction details.'}
          </p>
          {detail}
          {back}
        </ChainStatus>
      );
    }
    case 'read-failed':
      return (
        <ChainStatus title="Result not readable" tone="error">
          <p>Could not read the result; the outcome is unknown.</p>
          {detail}
          <Button onClick={recheck}>Recheck</Button>
          <Button variant="quiet" onClick={() => onDismiss(null)}>
            Re-read the chain
          </Button>
        </ChainStatus>
      );
    case 'idle':
    case 'previewing':
    case 'preview-ready':
    case 'executing':
    case 'verifying':
      // Rendered by the board / review panel once rules and run are known.
      return run && state.rules ? null : <Reading />;
    default:
      return <Reading />;
  }
}

// ---------- Result (success / restored from the contracts) ----------

function HoldingView({ holding }: { holding: Holding }) {
  const icon = holding.key > 0n ? 'KEY' : holding.coin > 0n ? 'COIN' : null;
  return (
    <span className="holding">
      {icon ? <ItemIcon item={icon} /> : <span className="holding__empty" aria-hidden="true" />}
      <span>{formatHolding(holding)}</span>
    </span>
  );
}

export interface ChainResultProps {
  state: ChainLevelState;
  onBack(event: MouseEvent<HTMLAnchorElement>): void;
}

export function ChainResult({ state, onBack }: ChainResultProps) {
  const after = state.run!.balances; // real balances read from the ledger
  const restored = state.phase === 'already-solved';
  const plan = restored ? null : state.preview;
  const arrivals = plan
    ? [...plan.transfers]
        .sort((x, y) => x.toNpc - y.toNpc)
        .map((t) => `${npcLetter(t.toNpc)} received ${formatQty(t.item, t.qty)}.`)
        .join(' ')
    : null;

  return (
    <section className="result" aria-labelledby="result-title">
      <header className="result__head">
        <p className="caps result__eyebrow">LOCAL CHAIN · {restored ? 'RESTORED RESULT' : 'CONFIRMED RESULT'}</p>
        <p className="result__disclaimer ui">
          {restored ? 'Restored from the local chain. This run was solved earlier.' : 'Confirmed on the local chain.'}
        </p>
        <p className="caps result__room">Room 01 — You First</p>
        <h1 id="result-title" className="result__title" tabIndex={-1}>
          Everyone kept their promise. <CheckCircleIcon className="result__ok" />
        </h1>
        {arrivals && <p className="result__lead">{arrivals}</p>}
      </header>

      {restored && state.failure?.kind === 'already-solved' && (
        <p className="chain-note chain-note--warn ui" role="note">
          {state.failure.message}
        </p>
      )}

      <ul className="result__people">
        {NPC_LETTERS.map((letter, npcId) => {
          const rule = state.rules?.find((r) => r.npcId === npcId);
          const observer = !rule || isObserver(rule);
          return (
            <li key={letter} className={`result__person result__person--${letter}`}>
              <Portrait who={letter} size="lg" className="person__portrait" />
              <div className="result__person-text">
                <h2 className="person__name">
                  {letter}
                  {observer && <span className="result__role"> · Observer</span>}
                </h2>
                <p className={plan ? 'before-after' : 'before-after before-after--single'}>
                  {plan && (
                    <>
                      <span className="before-after__cell">
                        <span className="before-after__label">Before</span>
                        <HoldingView holding={holdingOf(plan.before, npcId)} />
                      </span>
                      <ArrowRightIcon className="before-after__arrow" />
                    </>
                  )}
                  <span className="before-after__cell">
                    <span className="before-after__label">{plan ? 'After' : 'Now'}</span>
                    <HoldingView holding={holdingOf(after, npcId)} />
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {plan && (
        <section className="changed" aria-labelledby="changed-title">
          <h2 id="changed-title">What changed</h2>
          <table className="changed__table ui" aria-labelledby="changed-title">
            <thead className="visually-hidden">
              <tr>
                <th scope="col">From → to</th>
                <th scope="col">Item</th>
              </tr>
            </thead>
            <tbody>
              {plan.transfers.map((t) => (
                <tr key={`${t.fromNpc}-${t.toNpc}-${t.item}`}>
                  <th scope="row">
                    {npcLetter(t.fromNpc)} → {npcLetter(t.toNpc)}
                  </th>
                  <td>{formatQty(t.item, t.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="changed__note ui">The After column is read back from the item ledger after the receipt.</p>
        </section>
      )}

      <p className="chain-note ui">A repeat attempt is not supported in this version.</p>

      <div className="result__actions">
        <a className="back-link" href="#/local" onClick={onBack}>
          <ArrowLeftIcon /> Back to rooms
        </a>
      </div>
    </section>
  );
}

/** Visible outcome of a transaction the wallet replaced or cancelled (not only in the live region). */
export function ReplacementNotice({ tx }: { tx: TxView }) {
  if (tx.status !== 'replaced' && tx.status !== 'cancelled') return null;
  const rep = tx.replacement;
  const what = tx.kind === 'execute' ? 'exchange' : 'Start run';
  return (
    <section className="chain-note chain-note--warn chain-replaced ui" aria-labelledby="chain-replaced-title">
      <h2 id="chain-replaced-title" className="chain-replaced__title" tabIndex={-1}>
        {tx.status === 'cancelled' ? 'Transaction cancelled' : 'Transaction replaced'}
      </h2>
      <p>
        {tx.status === 'cancelled'
          ? 'Your transaction was cancelled; nothing was executed.'
          : `Your transaction was replaced by another transaction from your wallet, so this ${what} was not executed as sent. The page shows what the contracts report now.`}
      </p>
      <dl className="chain-replaced__list">
        <div>
          <dt>Original transaction</dt>
          <dd>
            <code className="proof__value">{realHash(tx.hash) ?? NOT_AVAILABLE}</code>
          </dd>
        </div>
        <div>
          <dt>Replacement transaction</dt>
          <dd>
            <code className="proof__value">{realHash(rep?.hash ?? tx.replacedBy) ?? NOT_AVAILABLE}</code>
          </dd>
        </div>
        <div>
          <dt>Replacement block</dt>
          <dd>{rep?.blockNumber != null ? rep.blockNumber.toString() : NOT_AVAILABLE}</dd>
        </div>
        <div>
          <dt>Replacement receipt status</dt>
          <dd>{rep?.receiptStatus ?? NOT_AVAILABLE}</dd>
        </div>
      </dl>
    </section>
  );
}
