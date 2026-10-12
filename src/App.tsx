import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { DemoNotice } from './components/DemoNotice';
import { Header } from './components/Header';
import type { AppMode } from './components/ModeSwitch';
import { LevelOne } from './screens/LevelOne';
import { PublicLocalNotice } from './screens/PublicLocalNotice';
import { Rooms } from './screens/Rooms';

// Local chain mode (viem, wallet) loads only when its room is opened; Demo never downloads it.
// The public build (`__PUBLIC_BUILD__`) has no Local chain mode: the branch and its chunk are
// removed at compile time.
const LevelOneChain = __PUBLIC_BUILD__
  ? null
  : lazy(() => import('./screens/LevelOneChain').then((m) => ({ default: m.LevelOneChain })));

type View = 'rooms' | 'level-1';
/** Public build only: any #/local… route shows an explanation instead of the Local chain mode. */
const PUBLIC_LOCAL_TITLE = 'Local chain mode not available — NOBODY FIRST';
interface Route {
  /** Demo (design preview, no chain) or Local chain (Anvil). Derived from the hash only. */
  mode: AppMode;
  view: View;
  /** Public build only: a #/local… route was opened. */
  localUnavailable?: boolean;
  /** Section to bring into view on the rooms page. */
  anchor: 'how-to-play' | null;
}

// Demo: #/, #/room/1, #how-to-play (unchanged). Local chain: #/local, #/local/room/1, #/local/how-to-play.
const HASH: Readonly<Record<AppMode, Record<View, string>>> = {
  demo: { rooms: '#/', 'level-1': '#/room/1' },
  local: { rooms: '#/local', 'level-1': '#/local/room/1' },
};
const HOW_TO_PLAY: Readonly<Record<AppMode, string>> = { demo: '#how-to-play', local: '#/local/how-to-play' };
const TITLE: Readonly<Record<AppMode, Record<View, string>>> = {
  demo: { rooms: 'NOBODY FIRST', 'level-1': 'Room 01 · You First — NOBODY FIRST' },
  local: {
    rooms: 'Local chain — NOBODY FIRST',
    'level-1': 'Room 01 · You First · Local chain — NOBODY FIRST',
  },
};

function parseHash(hash: string): Route {
  if (__PUBLIC_BUILD__ && hash.startsWith(HASH.local.rooms)) {
    return { mode: 'demo', view: 'rooms', anchor: null, localUnavailable: true };
  }
  if (hash === HASH.demo['level-1']) return { mode: 'demo', view: 'level-1', anchor: null };
  if (hash === HOW_TO_PLAY.demo) return { mode: 'demo', view: 'rooms', anchor: 'how-to-play' };
  if (hash === HASH.local['level-1']) return { mode: 'local', view: 'level-1', anchor: null };
  if (hash === HOW_TO_PLAY.local) return { mode: 'local', view: 'rooms', anchor: 'how-to-play' };
  if (hash === HASH.local.rooms || hash === `${HASH.local.rooms}/`) return { mode: 'local', view: 'rooms', anchor: null };
  return { mode: 'demo', view: 'rooms', anchor: null };
}

function hashFor(route: Route): string {
  return route.anchor ? HOW_TO_PLAY[route.mode] : HASH[route.mode][route.view];
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function focusWithoutScroll(el: HTMLElement) {
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const shownRoute = useRef<Route | null>(null);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // After a view change: title, scroll and focus follow the new content.
  useEffect(() => {
    if (shownRoute.current === route) return; // StrictMode re-run of the same route
    const initial = shownRoute.current === null;
    shownRoute.current = route;
    document.title = route.localUnavailable ? PUBLIC_LOCAL_TITLE : TITLE[route.mode][route.view];

    if (route.anchor) {
      const target = document.getElementById(route.anchor);
      if (target) {
        target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        focusWithoutScroll(target);
      }
      return;
    }
    if (initial) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    const heading = document.querySelector<HTMLElement>('#view h1');
    if (heading) focusWithoutScroll(heading);
  }, [route]);

  const navigate = useCallback((next: Route) => {
    const hash = hashFor(next);
    if (window.location.hash === hash || (hash === HASH.demo.rooms && window.location.hash === '')) {
      setRoute({ ...next }); // same hash: re-run scroll/focus without a history entry
    } else {
      window.location.hash = hash; // hashchange updates the route; back/forward work
    }
  }, []);

  const { mode } = route;
  const goRooms = useCallback(() => navigate({ mode, view: 'rooms', anchor: null }), [navigate, mode]);
  const goHowToPlay = useCallback(() => navigate({ mode, view: 'rooms', anchor: 'how-to-play' }), [navigate, mode]);
  const enterRoom = useCallback(() => navigate({ mode, view: 'level-1', anchor: null }), [navigate, mode]);

  // The mode switch keeps the current view (rooms or room 1) in the other mode.
  const modeHrefs = { demo: HASH.demo[route.view], local: HASH.local[route.view] };

  let content;
  if (__PUBLIC_BUILD__ && route.localUnavailable) content = <PublicLocalNotice />;
  else if (route.view === 'rooms') content = <Rooms onEnterRoom={enterRoom} mode={mode} />;
  else if (mode === 'local' && LevelOneChain)
    content = (
      <Suspense
        fallback={
          <main className="level container" aria-busy="true">
            <p className="ui">Loading the Local chain mode.</p>
          </main>
        }
      >
        {/* Focus the heading on mount only after an in-app navigation (never on first page load). */}
        <LevelOneChain key="local-level-1" onGoRooms={goRooms} focusOnMount={shownRoute.current !== null} />
      </Suspense>
    );
  else content = <LevelOne onGoRooms={goRooms} />;

  return (
    <>
      <Header
        current={route.view === 'rooms' && !route.localUnavailable ? 'rooms' : 'level'}
        mode={mode}
        modeHrefs={modeHrefs}
        onGoRooms={goRooms}
        onGoHowToPlay={goHowToPlay}
      />
      <DemoNotice mode={mode} />
      <div id="view">{content}</div>
    </>
  );
}
