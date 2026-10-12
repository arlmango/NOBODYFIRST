import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Button } from '../components/Button';
import { ExchangeResult } from '../components/ExchangeResult';
import { ArrowRightIcon } from '../components/Icons';
import { ItemIcon } from '../components/ItemIcon';
import { Portrait } from '../components/Portrait';
import {
  LEVEL_ONE,
  applyExchange,
  checkSelection,
  createInitialState,
  explainInvalid,
  explainMissing,
  formatInventory,
  formatQty,
  formatTransfer,
  inventoryEntries,
  offersFrom,
  previewExchange,
  resetDemo,
  selectionHeadline,
  type DemoState,
  type ExchangePlan,
  type Inventory,
  type LevelOneOfferId,
  type PersonId,
  type SelectionCheck,
} from '../demo';
import '../styles/level-result.css';
import './level-one.css';

type Phase = 'select' | 'review' | 'result';
type FocusTarget = 'review' | 'result' | 'title' | 'first-promise' | null;

const PEOPLE = LEVEL_ONE.people;
/** A double-click on "Run" sends a second click to whatever replaced the button. */
const CARRY_OVER_MS = 600;

const PROMPT = 'Select both promises to preview the exchange.';
const TOGETHER = 'Both transfers happen together, or neither happens.';

export interface LevelOneProps {
  onGoRooms(): void;
}

function reasonLines(check: SelectionCheck): string[] {
  switch (check.status) {
    case 'empty':
      return [PROMPT];
    case 'incomplete':
      return [...check.missing.map(explainMissing), PROMPT];
    case 'complete':
      return [TOGETHER];
    case 'invalid':
      return [explainInvalid(check.reason)];
  }
}

export function LevelOne({ onGoRooms }: LevelOneProps) {
  const [demo, setDemo] = useState<DemoState>(() => createInitialState(LEVEL_ONE));
  // Mirrors `demo` synchronously so a second click in the same frame sees the applied state.
  const demoRef = useRef(demo);
  const [selected, setSelected] = useState<readonly LevelOneOfferId[]>([]);
  const [phase, setPhase] = useState<Phase>('select');
  const [plan, setPlan] = useState<ExchangePlan | null>(null);
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
  // Removes the document-level carry-over guard (see armCarryOverGuard); also run on unmount.
  const disarmGuardRef = useRef<(() => void) | null>(null);
  const focusRef = useRef<FocusTarget>(null);

  const check = useMemo(() => checkSelection(LEVEL_ONE, selected), [selected]);
  const complete = check.status === 'complete';

  useEffect(() => {
    const target = focusRef.current;
    if (!target) return;
    focusRef.current = null;
    const id = { review: 'review-title', result: 'result-title', title: 'level-title', 'first-promise': 'promise-A' }[
      target
    ];
    document.getElementById(id)?.focus();
  });

  // Alternating zero-width suffix: an identical message (e.g. Reset twice) still changes the
  // region's text, so screen readers announce it again. One update per user action, no timers.
  const announce = (text: string) => setAnnouncement((prev) => ({ text, count: prev.count + 1 }));
  useEffect(() => () => disarmGuardRef.current?.(), []);

  // After "Run" replaces the review with the result, the second press of a double-click lands on
  // whatever is now under the pointer (inside or outside <main>). For CARRY_OVER_MS only, swallow
  // follow-up presses of that multi-click (detail > 1) at document capture: no focus loss, no
  // stray activation. Single clicks and later double-clicks (word selection) are untouched.
  const armCarryOverGuard = () => {
    disarmGuardRef.current?.();
    const swallow = (event: globalThis.MouseEvent) => {
      if (event.detail < 2) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const types = ['mousedown', 'mouseup', 'click', 'dblclick'] as const;
    for (const type of types) document.addEventListener(type, swallow, true);
    const timer = window.setTimeout(() => disarmGuardRef.current?.(), CARRY_OVER_MS);
    disarmGuardRef.current = () => {
      window.clearTimeout(timer);
      for (const type of types) document.removeEventListener(type, swallow, true);
      disarmGuardRef.current = null;
    };
  };

  const toggle = (offerId: LevelOneOfferId, on: boolean) => {
    if (demoRef.current.applied) return;
    const next = LEVEL_ONE.offers
      .map((offer) => offer.id)
      .filter((id) => (id === offerId ? on : selected.includes(id)));
    setSelected(next);
    const closingPreview = phase === 'review';
    if (closingPreview) {
      setPhase('select');
      setPlan(null);
    }
    const nextCheck = checkSelection(LEVEL_ONE, next);
    const detail = nextCheck.status === 'incomplete' ? ` ${nextCheck.missing.map(explainMissing).join(' ')}` : '';
    const prefix = closingPreview ? 'Preview closed because the selection changed. ' : '';
    announce(`${prefix}${selectionHeadline(nextCheck, LEVEL_ONE.offers.length)}.${detail}`);
  };

  const preview = () => {
    const result = previewExchange(LEVEL_ONE, demoRef.current, selected);
    if (!result.ok) return;
    setPlan(result.plan);
    setPhase('review');
    focusRef.current = 'review';
    announce('Preview ready. Nothing has moved yet.');
  };

  const run = () => {
    if (phase !== 'review') return;
    const result = applyExchange(LEVEL_ONE, demoRef.current, selected);
    if (!result.ok) return; // e.g. already applied by an earlier click
    armCarryOverGuard();
    demoRef.current = result.state;
    setDemo(result.state);
    setPlan(result.plan);
    setPhase('result');
    focusRef.current = 'result';
    announce('Simulated result. No blockchain transaction was sent. Everyone kept their promise.');
  };

  const editSelection = () => {
    setPhase('select');
    setPlan(null);
    focusRef.current = 'first-promise';
    announce('Preview closed. You can change your selection.');
  };

  const reset = () => {
    const fresh = resetDemo(LEVEL_ONE);
    demoRef.current = fresh;
    setDemo(fresh);
    setSelected([]);
    setPlan(null);
    setPhase('select');
    focusRef.current = 'title';
    announce('Demo reset. A has 1 key, B has 1 coin, C has nothing.');
  };

  const backToRooms = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onGoRooms();
  };

  const showResult = phase === 'result' && plan !== null;

  return (
    <main className="level container" aria-labelledby={showResult ? 'result-title' : 'level-title'}>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement.text}
        {announcement.count % 2 === 1 ? '\u200b' : ''}
      </p>

      {showResult ? (
        <ExchangeResult
          plan={plan}
          roomLabel="Room 01 — You First"
          onBack={backToRooms}
          onReset={reset}
        />
      ) : (
        <>
          <header className="level__head">
            <p className="caps level__eyebrow">LEVEL 01</p>
            <h1 id="level-title" tabIndex={-1}>
              You First
            </h1>
            <p className="level__sub">Choose both promises to complete the exchange.</p>
          </header>

          <div className="board">
            {PEOPLE.map((person) => (
              <PersonColumn
                key={person}
                person={person}
                inventory={demo.holdings[person]}
                check={check}
                selected={selected}
                locked={demo.applied}
                onToggle={toggle}
              />
            ))}
          </div>

          <section className="exchange" aria-labelledby="exchange-title">
            <div className="exchange__body">
              <h2 id="exchange-title">Your exchange</h2>
              <ul className="exchange__lines">
                {LEVEL_ONE.offers.map((offer) => {
                  const on = selected.includes(offer.id);
                  return (
                    <li key={offer.id} className={on ? 'is-on' : 'is-off'}>
                      {formatTransfer({ from: offer.from, to: offer.to, ...offer.gives })}
                      {!on && <span className="exchange__pending"> · not promised</span>}
                    </li>
                  );
                })}
              </ul>
              <hr className="exchange__rule" />
              <p className="exchange__status ui">{selectionHeadline(check, LEVEL_ONE.offers.length)}</p>
              <div id="exchange-reason" className="exchange__reason ui">
                {reasonLines(check).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
            <div className="exchange__actions">
              <Button
                variant={phase === 'review' ? 'quiet' : 'primary'}
                aria-disabled={!complete || undefined}
                aria-describedby="exchange-reason"
                onClick={preview}
              >
                Preview exchange <ArrowRightIcon />
              </Button>
              <Button variant="quiet" onClick={reset}>
                Reset demo
              </Button>
            </div>
          </section>

          {phase === 'review' && plan && (
            <ReviewPanel plan={plan} applied={demo.applied} onRun={run} onEdit={editSelection} />
          )}
        </>
      )}
    </main>
  );
}

interface PersonColumnProps {
  person: PersonId;
  inventory: Inventory;
  check: SelectionCheck;
  selected: readonly LevelOneOfferId[];
  locked: boolean;
  onToggle(offerId: LevelOneOfferId, on: boolean): void;
}

function PersonColumn({ person, inventory, check, selected, locked, onToggle }: PersonColumnProps) {
  const offer = offersFrom(LEVEL_ONE, person)[0];
  const nameId = `person-${person}-name`;
  const held = inventoryEntries(inventory)[0];
  const waiting = check.status === 'incomplete' ? check.missing.find((m) => m.from === person) : undefined;
  const noteId = `promise-${person}-note`;

  return (
    <div className={`person person--${person}`} role="group" aria-labelledby={nameId}>
      <Portrait who={person} size="lg" className="person__portrait" />
      <div className="person__text">
        <h2 id={nameId} className="person__name">
          {person}
        </h2>
        {offer ? (
          <p className="person__has">
            {held && <ItemIcon item={held.item} />}
            <span>Has {formatInventory(inventory)}</span>
          </p>
        ) : (
          <p className="person__has">Observer</p>
        )}

        {offer ? (
          <>
            <dl className="terms ui">
              <div>
                <dt>Gives to {offer.to}</dt>
                <dd>{formatQty(offer.gives.item, offer.gives.qty)}</dd>
              </div>
              <div>
                <dt>Needs from {offer.requires.from}</dt>
                <dd>{formatQty(offer.requires.item, offer.requires.qty)}</dd>
              </div>
            </dl>
            <label className="promise ui">
              <input
                id={`promise-${person}`}
                type="checkbox"
                checked={selected.includes(offer.id)}
                disabled={locked}
                aria-describedby={waiting ? noteId : undefined}
                onChange={(event) => onToggle(offer.id, event.currentTarget.checked)}
              />
              <span>
                <span className="visually-hidden">{person}: </span>Select promise
              </span>
            </label>
            {waiting && (
              <p id={noteId} className="promise__note ui">
                {waiting.to} is waiting for this promise.
              </p>
            )}
          </>
        ) : (
          <p className="person__idle">No exchange this round.</p>
        )}
      </div>
    </div>
  );
}

interface ReviewPanelProps {
  plan: ExchangePlan;
  applied: boolean;
  onRun(): void;
  onEdit(): void;
}

function ReviewPanel({ plan, applied, onRun, onEdit }: ReviewPanelProps) {
  return (
    <section id="review" className="review" aria-labelledby="review-title">
      <h2 id="review-title" tabIndex={-1}>
        Review your exchange
      </h2>
      <p className="review__note ui">Nothing has moved yet. This is what the demo would do.</p>
      <div className="review__grid">
        <div>
          <h3>Transfers</h3>
          <ul className="review__transfers">
            {plan.transfers.map((t) => (
              <li key={`${t.from}-${t.to}-${t.item}`}>{formatTransfer(t)}</li>
            ))}
          </ul>
        </div>
        <div className="table-scroll">
          <h3 id="review-holdings">Before and after</h3>
          <table className="holdings-table ui" aria-labelledby="review-holdings">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
              </tr>
            </thead>
            <tbody>
              {PEOPLE.map((person) => (
                <tr key={person}>
                  <th scope="row">{person}</th>
                  <td>{formatInventory(plan.before[person])}</td>
                  <td>{formatInventory(plan.after[person])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="review__actions">
        <Button aria-disabled={applied || undefined} aria-describedby="review-sim" onClick={onRun}>
          Run demo exchange
        </Button>
        <Button variant="quiet" onClick={onEdit}>
          Edit selection
        </Button>
      </div>
      <p id="review-sim" className="review__sim ui">
        Runs on this page only. No blockchain transaction is sent.
      </p>
    </section>
  );
}
