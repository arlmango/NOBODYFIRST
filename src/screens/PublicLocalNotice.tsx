import './rooms.css';

/**
 * Public build only: shown for any #/local… route. Static copy and two plain hash links;
 * no network requests, no wallet, no chain code.
 */
export function PublicLocalNotice() {
  return (
    <main className="rooms container" aria-labelledby="local-unavailable-title">
      <header className="rooms__head">
        <h1 id="local-unavailable-title" tabIndex={-1}>
          Local chain mode is not part of the public demo.
        </h1>
        <p className="rooms__sub">It needs a developer machine running a local test chain.</p>
        <p className="rooms__actions">
          <a className="btn btn--primary" href="#/room/1">
            Play the demo
          </a>
          <a className="btn btn--quiet" href="#/">
            The rooms
          </a>
        </p>
      </header>
    </main>
  );
}
