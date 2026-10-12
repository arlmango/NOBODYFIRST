// Level 01 in Local chain mode. Renders the controller's state (src/chain) only, never demo data.
// Layout and classes reuse the demo level (level-one.css, level-result.css); additions live in
// level-chain.css. All chain work happens in the controller; this file renders and forwards
// user clicks. No action is ever called from render or on load.
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { ChainLevelActions, ChainLevelState, NpcRulesView, Phase, PreviewPlan } from '../chain/types';
import { Button } from '../components/Button';
import { ArrowRightIcon } from '../components/Icons';
import { ItemIcon } from '../components/ItemIcon';
import { Portrait } from '../components/Portrait';
import { ProofPanel } from '../components/ProofPanel';
import { ChainResult, PhaseStatus, Reading, ReplacementNotice, ReviewPanel } from './LevelOneChainParts';
import {
  NPC_LETTERS,
  formatQty,
  formatTransfer,
  hasText,
  holdingOf,
  isObserver,
  npcLetter,
  runAction,
  useChainLevel,
  type Holding,
  type NpcLetter,
} from './useChainLevel';
import '../styles/level-result.css';
import './level-one.css';
import './level-chain.css';

type Offerer = 'A' | 'B';

/** Phases with an active run: the board (real rules + ledger balances) is shown. */
const BOARD: ReadonlySet<Phase> = new Set<Phase>([
  'idle', 'previewing', 'preview-ready', 'preview-failed', 'stale-preview',
  'executing', 'verifying', 'reverted', 'user-rejected',
]);
/** Phases in which the selection may change and Preview is available (as in the controller). */
const EDITABLE: ReadonlySet<Phase> = new Set<Phase>([
  'idle', 'preview-ready', 'preview-failed', 'stale-preview', 'reverted', 'user-rejected',
]);
const REVIEW: ReadonlySet<Phase> = new Set<Phase>(['preview-ready', 'executing', 'verifying']);

/** Where focus goes when the controller enters a phase (targets have tabIndex -1). */
const FOCUS_ON: Partial<Record<Phase, string>> = {
  success: 'result-title',
  'already-solved': 'result-title',
  'preview-ready': 'review-title',
  'preview-failed': 'chain-status-title',
  'stale-preview': 'chain-status-title',
  reverted: 'chain-status-title',
  'user-rejected': 'chain-status-title',
  'read-failed': 'chain-status-title',
  'rpc-unavailable': 'chain-status-title',
  'deployment-error': 'chain-status-title',
};

export interface LevelOneChainProps {
  onGoRooms(): void;
  /** Move focus to the heading on mount when nothing else holds it (lazy load after navigation). */
  focusOnMount?: boolean;
}

export function LevelOneChain({ onGoRooms, focusOnMount = false }: LevelOneChainProps) {
  const { state, actions } = useChainLevel();
  const phase: Phase = state?.phase ?? 'booting';
  const replacedTx = state?.tx?.status === 'replaced' || state?.tx?.status === 'cancelled';
  const prevPhaseRef = useRef<Phase | null>(null);
  const pendingFocusRef = useRef<string | null>(null);
  // The preview an Execute click was already forwarded for: any further click for the same
  // preview (double click, or a click before the controller's next state renders) is ignored.
  const executedPreviewRef = useRef<PreviewPlan | null>(null);
  const [, setSentCount] = useState(0); // re-render at once so Execute shows as disabled
  const markSent = (plan: PreviewPlan) => {
    executedPreviewRef.current = plan;
    setSentCount((n) => n + 1);
  };

  useEffect(() => {
    const active = document.activeElement;
    if (focusOnMount && (!active || active === document.body)) document.getElementById('level-title')?.focus();
    // Mount only: later focus follows phase transitions below.
  }, []);

  useEffect(() => {
    // A finished or abandoned send frees Execute for the next preview.
    if (!REVIEW.has(phase)) executedPreviewRef.current = null;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev === null || prev === phase) return;
    // A requested target (e.g. promise-A) may appear only after an intermediate phase (loading):
    // keep it pending until it exists, unless this phase has its own focus target.
    const pending = pendingFocusRef.current;
    let id: string | null = null;
    if (pending && document.getElementById(pending)) id = pending;
    else id = FOCUS_ON[phase] ?? (replacedTx && document.getElementById('chain-replaced-title') ? 'chain-replaced-title' : null);
    if (id || !pending) pendingFocusRef.current = null;
    const active = document.activeElement;
    // The transition removed the focused control (Connect wallet, Start run, ...): stay in the level.
    if (!id && (!active || active === document.body)) id = 'level-title';
    if (id) document.getElementById(id)?.focus();
  }, [phase]);

  const backToRooms = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onGoRooms();
  };

  const solved = state !== null && state.run !== null && (phase === 'success' || phase === 'already-solved');

  return (
    <main className="level container chain-level" aria-labelledby={solved ? 'result-title' : 'level-title'}>
      <p className="visually-hidden" role="status" aria-live="polite">
        {state?.announcement ?? ''}
      </p>

      {state?.invalidatedOperation && (
        <p className="chain-note chain-note--warn ui">
          Your wallet account or network changed during the last operation. Its result was discarded; this page
          now shows the current account and network.
        </p>
      )}

      {state?.tx && <ReplacementNotice tx={state.tx} />}

      {solved && state ? (
        <ChainResult state={state} onBack={backToRooms} />
      ) : (
        <>
          <header className="level__head">
            <p className="caps level__eyebrow">LEVEL 01</p>
            <h1 id="level-title" tabIndex={-1}>
              You First
            </h1>
            <p className="level__sub">Choose both promises to complete the exchange.</p>
          </header>
          {state && actions ? (
            <LevelBody
              state={state}
              actions={actions}
              sentRef={executedPreviewRef}
              markSent={markSent}
              requestFocus={(id) => (pendingFocusRef.current = id)}
            />
          ) : (
            <Reading />
          )}
        </>
      )}

      {state && <ProofPanel proof={state.proof} />}
    </main>
  );
}

interface LevelBodyProps {
  state: ChainLevelState;
  actions: ChainLevelActions;
  /** Preview whose Execute click was already forwarded (null when none). Read synchronously. */
  sentRef: { readonly current: PreviewPlan | null };
  markSent(plan: PreviewPlan): void;
  requestFocus(id: string): void;
}

function LevelBody({ state, actions, sentRef, markSent, requestFocus }: LevelBodyProps) {
  const { phase, rules, run, choice, preview, tx } = state;
  const sent = preview !== null && sentRef.current === preview;
  // While Execute's pre-send check runs the phase is still preview-ready: the selection is frozen.
  const editable = EDITABLE.has(phase) && !sent;

  const toggle = (letter: Offerer, on: boolean) => {
    if (editable) actions.setChoice({ ...choice, [letter]: on });
  };
  const doPreview = () => {
    if (editable) runAction(actions.preview);
  };
  const doExecute = () => {
    if (phase !== 'preview-ready' || !preview || sentRef.current === preview) return;
    markSent(preview);
    runAction(actions.execute);
  };
  // Closes the preview (same selection, back to idle) and returns to the first promise.
  const editSelection = () => {
    if (phase !== 'preview-ready' || sentRef.current === preview) return;
    requestFocus('promise-A');
    actions.setChoice({ ...choice });
  };
  const dismiss = (focusId: string | null) => {
    if (focusId) requestFocus(focusId);
    actions.dismiss();
  };

  const status = <PhaseStatus state={state} actions={actions} onDismiss={dismiss} />;
  if (!BOARD.has(phase) || rules === null || run === null) return status;

  const offers = rules.filter((r) => !isObserver(r) && r.npcId !== 2);
  const isOn = (r: NpcRulesView) => choice[npcLetter(r.npcId) as Offerer] === true;
  const chosen = offers.filter(isOn).length;
  const headline =
    chosen === 0
      ? 'No promises selected'
      : chosen === offers.length
        ? 'Both promises selected'
        : `${chosen} of ${offers.length} promises selected`;
  const reason = editable
    ? 'Preview simulates this exact exchange on the local chain. Nothing is sent.'
    : phase === 'previewing'
      ? 'Simulating this exchange on the local chain.'
      : 'Wait until the current transaction finishes.';

  return (
    <>
      <div className="board">
        {NPC_LETTERS.map((letter, npcId) => (
          <ChainPerson
            key={letter}
            letter={letter}
            rule={rules.find((r) => r.npcId === npcId) ?? null}
            holding={holdingOf(run.balances, npcId)}
            checked={letter !== 'C' && choice[letter]}
            disabled={!editable}
            onToggle={toggle}
          />
        ))}
      </div>

      <section className="exchange" aria-labelledby="exchange-title">
        <div className="exchange__body">
          <h2 id="exchange-title">Your exchange</h2>
          <ul className="exchange__lines">
            {offers.map((r) => (
              <li key={r.npcId} className={isOn(r) ? 'is-on' : 'is-off'}>
                {formatTransfer({ fromNpc: r.npcId, toNpc: r.giveTo, item: r.giveItem, qty: r.giveQty })}
                {!isOn(r) && <span className="exchange__pending"> · not promised</span>}
              </li>
            ))}
          </ul>
          <hr className="exchange__rule" />
          <p className="exchange__status ui">{headline}</p>
          <div id="exchange-reason" className="exchange__reason ui">
            <p>{reason}</p>
          </div>
        </div>
        <div className="exchange__actions">
          <Button
            variant={REVIEW.has(phase) ? 'quiet' : 'primary'}
            aria-disabled={!editable || undefined}
            aria-describedby="exchange-reason"
            onClick={doPreview}
          >
            Preview exchange <ArrowRightIcon />
          </Button>
        </div>
      </section>

      {REVIEW.has(phase) && preview ? (
        <ReviewPanel
          plan={preview}
          phase={phase}
          txStatus={tx?.status ?? null}
          sent={sent}
          onExecute={doExecute}
          onEdit={phase === 'preview-ready' && !sent ? editSelection : null}
        />
      ) : (
        status
      )}
    </>
  );
}

interface ChainPersonProps {
  letter: NpcLetter;
  rule: NpcRulesView | null;
  holding: Holding;
  checked: boolean;
  disabled: boolean;
  onToggle(letter: Offerer, on: boolean): void;
}

function ChainPerson({ letter, rule, holding, checked, disabled, onToggle }: ChainPersonProps) {
  const nameId = `person-${letter}-name`;
  const offer = letter !== 'C' && rule !== null && !isObserver(rule) ? rule : null;
  const icon = holding.key > 0n ? 'KEY' : holding.coin > 0n ? 'COIN' : null;
  return (
    <div className={`person person--${letter}`} role="group" aria-labelledby={nameId}>
      <Portrait who={letter} size="lg" className="person__portrait" />
      <div className="person__text">
        <h2 id={nameId} className="person__name">
          {letter}
        </h2>
        <p className="person__has">
          {icon && <ItemIcon item={icon} />}
          <span>{offer ? hasText(holding) : `Observer · ${hasText(holding)}`}</span>
        </p>
        {offer ? (
          <>
            <dl className="terms ui">
              <div>
                <dt>Gives to {npcLetter(offer.giveTo)}</dt>
                <dd>{formatQty(offer.giveItem, offer.giveQty)}</dd>
              </div>
              <div>
                <dt>Needs from {npcLetter(offer.needFrom)}</dt>
                <dd>{formatQty(offer.needItem, offer.needQty)}</dd>
              </div>
            </dl>
            <label className="promise ui">
              <input
                id={`promise-${letter}`}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onToggle(letter as Offerer, event.currentTarget.checked)}
              />
              <span>
                <span className="visually-hidden">{letter}: </span>Select promise
              </span>
            </label>
          </>
        ) : (
          <p className="person__idle">No exchange this round.</p>
        )}
      </div>
    </div>
  );
}

