// Demo / Local chain switch. Two plain links: the mode lives in the URL hash, so reload keeps it
// and back/forward work. The active mode carries aria-current. Always visible (also below the
// mobile breakpoint), outside the Menu disclosure.
import '../screens/level-chain.css';

export type AppMode = 'demo' | 'local';

export interface ModeSwitchProps {
  mode: AppMode;
  /** Hash of the same view in each mode, e.g. { demo: '#/room/1', local: '#/local/room/1' }. */
  hrefs: Readonly<Record<AppMode, string>>;
}

const LABEL: Readonly<Record<AppMode, string>> = { demo: 'Demo', local: 'Local chain' };
const ORDER: readonly AppMode[] = ['demo', 'local'];

export function ModeSwitch({ mode, hrefs }: ModeSwitchProps) {
  return (
    <nav className="mode-switch" aria-label="Mode">
      <span className="mode-switch__label" aria-hidden="true">
        Mode
      </span>
      <ul className="mode-switch__list">
        {ORDER.map((m) => (
          <li key={m}>
            <a className="mode-switch__link" href={hrefs[m]} aria-current={m === mode ? 'true' : undefined}>
              {LABEL[m]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
