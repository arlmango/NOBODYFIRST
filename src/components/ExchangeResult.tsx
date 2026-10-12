// Simulated result for a level (mockup 05). Pure presentation of an ExchangePlan.
import type { MouseEvent } from 'react';
import {
  LEVEL_ONE,
  describeArrivals,
  formatInventory,
  formatQty,
  inventoryEntries,
  offersFrom,
  type ExchangePlan,
  type Inventory,
} from '../demo';
import { Button } from './Button';
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon } from './Icons';
import { ItemIcon } from './ItemIcon';
import { Portrait } from './Portrait';

function Holding({ inventory }: { inventory: Inventory }) {
  const entry = inventoryEntries(inventory)[0];
  return (
    <span className="holding">
      {entry ? <ItemIcon item={entry.item} /> : <span className="holding__empty" aria-hidden="true" />}
      <span>{formatInventory(inventory)}</span>
    </span>
  );
}

export interface ExchangeResultProps {
  plan: ExchangePlan;
  /** Room label shown above the headline, e.g. "Room 01 — You First". */
  roomLabel: string;
  onBack(event: MouseEvent<HTMLAnchorElement>): void;
  onReset(): void;
}

export function ExchangeResult({ plan, roomLabel, onBack, onReset }: ExchangeResultProps) {
  const people = LEVEL_ONE.people;
  return (
    <section className="result" aria-labelledby="result-title">
      <header className="result__head">
        <p className="caps result__eyebrow">
          {__PUBLIC_BUILD__ ? 'INTERACTIVE DEMO · SIMULATED RESULT' : 'DESIGN PREVIEW · SIMULATED RESULT'}
        </p>
        <p className="result__disclaimer ui">Simulated result. No blockchain transaction was sent.</p>
        <p className="caps result__room">{roomLabel}</p>
        <h1 id="result-title" className="result__title" tabIndex={-1}>
          Everyone kept their promise. <CheckCircleIcon className="result__ok" />
        </h1>
        <p className="result__lead">{describeArrivals(plan.transfers)}</p>
      </header>

      <ul className="result__people">
        {people.map((person) => {
          const observer = offersFrom(LEVEL_ONE, person).length === 0;
          return (
            <li key={person} className={`result__person result__person--${person}`}>
              <Portrait who={person} size="lg" className="person__portrait" />
              <div className="result__person-text">
                <h2 className="person__name">
                  {person}
                  {observer && <span className="result__role"> · Observer</span>}
                </h2>
                <p className="before-after">
                  <span className="before-after__cell">
                    <span className="before-after__label">Before</span>
                    <Holding inventory={plan.before[person]} />
                  </span>
                  <ArrowRightIcon className="before-after__arrow" />
                  <span className="before-after__cell">
                    <span className="before-after__label">After</span>
                    <Holding inventory={plan.after[person]} />
                  </span>
                </p>
                {observer && <p className="result__unchanged ui">Unchanged.</p>}
              </div>
            </li>
          );
        })}
      </ul>

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
              <tr key={`${t.from}-${t.to}-${t.item}`}>
                <th scope="row">
                  {t.from} → {t.to}
                </th>
                <td>{formatQty(t.item, t.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="changed__note ui">Both promises were fulfilled in this demonstration.</p>
      </section>

      <dl className="details ui">
        <dt>Transaction details</dt>
        <dd>{__PUBLIC_BUILD__ ? 'Unavailable in this demo' : 'Unavailable in design preview'}</dd>
      </dl>

      <div className="result__actions">
        <a className="back-link" href="#/" onClick={onBack}>
          <ArrowLeftIcon /> Back to rooms
        </a>
        <Button variant="quiet" onClick={onReset}>
          Reset demo
        </Button>
      </div>
    </section>
  );
}
