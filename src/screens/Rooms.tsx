import type { CSSProperties } from 'react';
import { Button } from '../components/Button';
import { ArrowRightIcon, LockIcon } from '../components/Icons';
import { ITEM_ART, ItemIcon } from '../components/ItemIcon';
import { PORTRAIT_ART, Portrait } from '../components/Portrait';
import './rooms.css';

export interface RoomsProps {
  onEnterRoom: (room: 1) => void;
  /** Demo (default) or Local chain: only changes the note under How to play. */
  mode?: 'demo' | 'local';
}

const STEPS = [
  { title: 'Read the promises', detail: 'See what each person gives and needs.' },
  { title: 'Build your deal', detail: 'Choose one promise for each active person.' },
  { title: 'Preview the exchange', detail: 'Check that every promise is satisfied.' },
] as const;

// Public build (`__PUBLIC_BUILD__`) copy. Rooms 02 and 03 are not playable there.
const PUBLIC_DESCRIPTION =
  'Play the first level in your browser. The Solidity prototype has been tested locally; public testnet play is not available yet.';
const PUBLIC_LOCKED = 'Coming soon';
const PUBLIC_NOTE = 'This is a browser demo. Blockchain execution is not part of this public version.';

/* ---------- Diagram geometry ----------
   Each diagram has one coordinate system (its viewBox). The portraits, the key and the
   circles are placed from the same boxes the SVG lines are computed from, so the lines stay
   anchored to the art at every width (the container keeps the viewBox aspect ratio). */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pt {
  x: number;
  y: number;
}

/** Percentage placement of a box inside a w x h frame. */
function boxStyle(b: Box, frame: { w: number; h: number }): CSSProperties {
  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
  return { left: pct(b.x, frame.w), top: pct(b.y, frame.h), width: pct(b.w, frame.w) };
}

const n = (v: number) => Number(v.toFixed(2));

/** Point at fractional position (fx, fy) of a box. */
const at = (b: Box, fx: number, fy: number): Pt => ({ x: b.x + b.w * fx, y: b.y + b.h * fy });

/** Straight line from p to q, pulled in at each end so it stops just short of the art. */
function segment(p: Pt, q: Pt, gapStart: number, gapEnd = gapStart): string {
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const ux = (q.x - p.x) / len;
  const uy = (q.y - p.y) / len;
  return `M${n(p.x + ux * gapStart)} ${n(p.y + uy * gapStart)} L${n(q.x - ux * gapEnd)} ${n(q.y - uy * gapEnd)}`;
}

// Portrait boxes are the transparent files at one scale (natural aspect ratios and relative
// size, see Portrait.tsx). The files are cropped tight to the drawing, so a line trimmed to a
// box edge (plus a small gap) ends at the figure. A sits on top; B and C sit fully below A's
// box, so every line runs between figures, never across one.
const PORTRAIT_SCALE = 0.2;
const art = (who: 'A' | 'B' | 'C') => ({
  w: PORTRAIT_ART[who].w * PORTRAIT_SCALE,
  h: PORTRAIT_ART[who].h * PORTRAIT_SCALE,
});
const CIRCLE_W = 380;
const CIRCLE_ROW_GAP = 10;
const CIRCLE_B_TOP = art('A').h + CIRCLE_ROW_GAP;
const CIRCLE_H = CIRCLE_B_TOP + art('B').h;
const CIRCLE = {
  w: CIRCLE_W,
  h: CIRCLE_H,
  people: {
    A: { x: (CIRCLE_W - art('A').w) / 2, y: 0, ...art('A') },
    B: { x: 0, y: CIRCLE_B_TOP, ...art('B') },
    // C shares B's vertical centre so the B-C line is level.
    C: { x: CIRCLE_W - art('C').w, y: CIRCLE_B_TOP + (art('B').h - art('C').h) / 2, ...art('C') },
  } satisfies Record<'A' | 'B' | 'C', Box>,
};
const CIRCLE_ORDER = ['A', 'B', 'C'] as const;
// Line ends sit on the drawn edge of each figure (fractions of the file box, read from the
// alpha channel): A's coat corners, B's hair and coat edge, C's hat brim and sleeve. So every
// line touches a figure instead of ending in the transparent corner of a box.
const { A: CA, B: CB, C: CC } = CIRCLE.people;
const B_SIDE_Y = 0.72; // B's coat edge; C's matching point is taken at the same page height
// End gaps (viewBox units) are tuned per end against the alpha edge, measured in the browser:
// each end lands about 1.5-2 CSS px from the nearest drawn pixel at 1440 (a bit less at 390).
const CIRCLE_LINES = [
  segment(at(CA, 0.07, 0.86), at(CB, 0.8, 0.18), 4, 4.8),
  segment(at(CA, 0.94, 0.86), at(CC, 0.246, 0.22), 4.4, 3),
  segment(at(CB, 0.96, B_SIDE_Y), { x: CC.x + CC.w * 0.04, y: CB.y + CB.h * B_SIDE_Y }, 3),
];

/** Quadratic curve with a chevron head at its end, as one path (head follows the end tangent). */
function arrow(start: Pt, ctrl: Pt, end: Pt, head: number): string {
  const back = Math.atan2(ctrl.y - end.y, ctrl.x - end.x);
  const spread = (32 * Math.PI) / 180;
  const leg = (s: number) => `${n(end.x + head * Math.cos(back + s))} ${n(end.y + head * Math.sin(back + s))}`;
  return `M${n(start.x)} ${n(start.y)} Q${n(ctrl.x)} ${n(ctrl.y)} ${n(end.x)} ${n(end.y)} M${leg(spread)} L${n(end.x)} ${n(end.y)} L${leg(-spread)}`;
}

const DOOR_W = 220;
const DOOR_H = 180;
const DOOR_R = 27;
const DOOR_KEY_W = 84;
const DOOR = {
  w: DOOR_W,
  h: DOOR_H,
  // Key box keeps key.png's aspect ratio (diagonal key, see ItemIcon.tsx).
  key: { x: (DOOR_W - DOOR_KEY_W) / 2, y: 0, w: DOOR_KEY_W, h: (DOOR_KEY_W * ITEM_ART.KEY.h) / ITEM_ART.KEY.w },
};
const DOOR_CIRCLES = [
  { label: 'B', c: { x: 52, y: DOOR_H - DOOR_R - 1 } },
  { label: 'C', c: { x: DOOR_W - 52, y: DOOR_H - DOOR_R - 1 } },
].map(({ label, c }) => ({ label, c, box: { x: c.x - DOOR_R, y: c.y - DOOR_R, w: DOOR_R * 2, h: DOOR_R * 2 } }));
// Head length in viewBox units. The art is drawn small below 760px (about 140-160 CSS px wide),
// so it gets a longer head there to keep the chevron legs at 8+ CSS px; CSS shows one set.
// Arrow starts sit on the key's drawn underside (fractions of key.png, read from its alpha):
// the bow's lowest point for B (left), the bit's lowest point for C (right). The diagonal key
// leans left-up to right-down, so each arrow leaves from the part of the key nearest its door.
const KEY_EDGE = { B: { fx: 0.28, fy: 0.54 }, C: { fx: 0.8, fy: 0.961 } } as const;
const DOOR_START_GAP = 2.5; // viewBox units: about 2-3 CSS px at every width
const doorArrows = (head: number) =>
  DOOR_CIRCLES.map(({ label, c }) => {
    const edge = at(DOOR.key, KEY_EDGE[label as 'B' | 'C'].fx, KEY_EDGE[label as 'B' | 'C'].fy);
    const ctrl = { x: c.x + (label === 'B' ? 2 : -2), y: edge.y + (label === 'B' ? 22 : 12) };
    const len = Math.hypot(ctrl.x - edge.x, ctrl.y - edge.y);
    const start = {
      x: edge.x + ((ctrl.x - edge.x) / len) * DOOR_START_GAP,
      y: edge.y + ((ctrl.y - edge.y) / len) * DOOR_START_GAP,
    };
    return arrow(start, ctrl, { x: c.x, y: c.y - DOOR_R - 7 }, head);
  });
const DOOR_ARROW_SETS = [
  { size: 'compact', paths: doorArrows(13) },
  { size: 'wide', paths: doorArrows(9) },
] as const;

export function Rooms({ onEnterRoom, mode = 'demo' }: RoomsProps) {
  return (
    <main className="rooms container" aria-labelledby="rooms-title">
      <header className="rooms__head">
        <h1 id="rooms-title" tabIndex={-1}>
          Three rooms. One rule.
        </h1>
        <p className="rooms__sub">Everyone gets what they need, or nothing moves.</p>
        {__PUBLIC_BUILD__ && <p className="rooms__desc">{PUBLIC_DESCRIPTION}</p>}
      </header>

      <div className="rooms__grid">
        <section className="room room--first" aria-labelledby="room-1-title">
          <div className="room__head">
            <p className="caps room__eyebrow">Room 01</p>
            <h2 id="room-1-title" className="room__title">
              You First
            </h2>
          </div>
          <div className="room__art room__art--pair" aria-hidden="true">
            <div className="pair__person">
              <Portrait who="A" size="sm" />
              <ItemIcon item="KEY" />
            </div>
            <div className="pair__person">
              <Portrait who="B" size="sm" />
              <ItemIcon item="COIN" />
            </div>
          </div>
          <div className="room__copy">
            <p className="room__lead">Two people. Two promises.</p>
            <p className="room__detail">Find an exchange that works for both.</p>
          </div>
          <div className="room__action">
            <Button onClick={() => onEnterRoom(1)}>
              Enter room <ArrowRightIcon />
            </Button>
          </div>
        </section>

        <section className="room" aria-labelledby="room-2-title">
          <div className="room__head">
            <p className="caps room__eyebrow">Room 02</p>
            <h2 id="room-2-title" className="room__title">
              The Circle
            </h2>
          </div>
          <div
            className="room__art room__art--circle"
            aria-hidden="true"
            style={{ aspectRatio: `${CIRCLE.w} / ${n(CIRCLE.h)}` }}
          >
            <svg
              className="circle__lines"
              viewBox={`0 0 ${CIRCLE.w} ${CIRCLE.h}`}
              preserveAspectRatio="none"
              focusable="false"
            >
              {CIRCLE_LINES.map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
            {CIRCLE_ORDER.map((who) => (
              <div className="circle__person" key={who} style={boxStyle(CIRCLE.people[who], CIRCLE)}>
                <Portrait who={who} size="sm" />
              </div>
            ))}
          </div>
          <div className="room__copy">
            <p className="room__lead">Three people. One circle.</p>
            <p className="room__detail">Connect all three promises.</p>
          </div>
          <p className="room__locked">
            <LockIcon />
            <span>{__PUBLIC_BUILD__ ? PUBLIC_LOCKED : 'Complete Room 01 first.'}</span>
          </p>
        </section>

        <section className="room" aria-labelledby="room-3-title">
          <div className="room__head">
            <p className="caps room__eyebrow">Room 03</p>
            <h2 id="room-3-title" className="room__title">
              The Wrong Door
            </h2>
          </div>
          <div
            className="room__art room__art--door"
            role="img"
            aria-label="One key, two possible doors: B and C"
            style={{ aspectRatio: `${DOOR.w} / ${DOOR.h}` }}
          >
            <div className="door__key" style={boxStyle(DOOR.key, DOOR)}>
              <ItemIcon item="KEY" />
            </div>
            <svg
              className="door__arrows"
              viewBox={`0 0 ${DOOR.w} ${DOOR.h}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {DOOR_ARROW_SETS.map((set) => (
                <g key={set.size} className={`door__arrows-${set.size}`}>
                  {set.paths.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </g>
              ))}
            </svg>
            {DOOR_CIRCLES.map((c) => (
              <span className="door__circle" key={c.label} aria-hidden="true" style={boxStyle(c.box, DOOR)}>
                {c.label}
              </span>
            ))}
          </div>
          <div className="room__copy">
            <p className="room__lead">One key. Two possible doors.</p>
            <p className="room__detail">Check who receives each item.</p>
          </div>
          <p className="room__locked">
            <LockIcon />
            <span>{__PUBLIC_BUILD__ ? PUBLIC_LOCKED : 'Complete Room 02 first.'}</span>
          </p>
        </section>
      </div>

      <section id="how-to-play" className="how" tabIndex={-1} aria-labelledby="how-title">
        <h2 id="how-title" className="how__title">
          How to play
        </h2>
        <ol className="steps">
          {STEPS.map((step, index) => (
            <li className="step" key={step.title}>
              <span className="step__num">{String(index + 1).padStart(2, '0')}</span>
              <div className="step__text">
                <p className="step__title">{step.title}</p>
                <p className="step__detail">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="how__note">
          {__PUBLIC_BUILD__
            ? PUBLIC_NOTE
            : mode === 'local'
            ? 'This build talks to a local test chain (Anvil). Nothing here is public or real money.'
            : 'This demo runs locally. Blockchain execution is not implemented yet.'}
        </p>
        <p className="how__close">Nobody has to go first.</p>
      </section>
    </main>
  );
}
