import { useEffect, useId, useRef, useState, type FocusEvent as ReactFocusEvent, type MouseEvent } from 'react';
import { ModeSwitch, type AppMode } from './ModeSwitch';

export interface HeaderProps {
  current: 'rooms' | 'level';
  onGoRooms(): void;
  onGoHowToPlay(): void;
  /** Demo (default) or Local chain; only changes link targets and the mode switch. */
  mode?: AppMode;
  /** Same view in each mode, for the mode switch. Defaults to each mode's rooms page. */
  modeHrefs?: Readonly<Record<AppMode, string>>;
}

const LINKS: Readonly<Record<AppMode, { rooms: string; howToPlay: string }>> = {
  demo: { rooms: '#/', howToPlay: '#how-to-play' },
  local: { rooms: '#/local', howToPlay: '#/local/how-to-play' },
};
const DEFAULT_MODE_HREFS: Readonly<Record<AppMode, string>> = { demo: '#/', local: '#/local' };

/** Same breakpoint as the CSS that swaps the inline links for the Menu button. */
const WIDE_QUERY = '(min-width: 760px)';

interface NavLinksProps {
  current: HeaderProps['current'];
  mode: AppMode;
  onRooms(event: MouseEvent<HTMLAnchorElement>): void;
  onHowToPlay(event: MouseEvent<HTMLAnchorElement>): void;
}

function NavLinks({ current, mode, onRooms, onHowToPlay }: NavLinksProps) {
  return (
    <>
      <li>
        <a href={LINKS[mode].rooms} aria-current={current === 'rooms' ? 'page' : undefined} onClick={onRooms}>
          The rooms
        </a>
      </li>
      <li>
        <a href={LINKS[mode].howToPlay} onClick={onHowToPlay}>
          How to play
        </a>
      </li>
    </>
  );
}

/**
 * Site header. Wide screens: brand left, The rooms / How to play right, always visible.
 * Below 760px: brand + a Menu disclosure (The rooms, How to play, Close). Escape and Close
 * return focus to Menu; choosing a link or tabbing out of the menu closes it.
 * Links are real hrefs, so opening in a new tab still works.
 */
export function Header({
  current,
  onGoRooms,
  onGoHowToPlay,
  mode = 'demo',
  modeHrefs = DEFAULT_MODE_HREFS,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const panelId = useId();

  // Last header control that had focus. Kept when focus drops to <body> (an element hidden by a
  // breakpoint change loses focus, sometimes before the media-query event fires); cleared when
  // focus moves to something outside the header or the user presses outside it.
  const lastHeaderFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const header = headerRef.current;
    const media = window.matchMedia?.(WIDE_QUERY);
    if (!header || !media) return;

    const onFocusIn = (event: FocusEvent) => {
      lastHeaderFocusRef.current = event.target instanceof HTMLElement ? event.target : null;
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !header.contains(next)) lastHeaderFocusRef.current = null;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!header.contains(event.target as Node)) lastHeaderFocusRef.current = null;
    };

    const isShown = (el: Element | null | undefined): el is HTMLElement =>
      el instanceof HTMLElement && el.getClientRects().length > 0;

    // On a breakpoint change, a focused header control that is no longer shown hands focus to
    // its visible counterpart: same-target inline link when wide, the Menu button when narrow,
    // otherwise the brand. Focus that was outside the header is never moved.
    const onChange = () => {
      if (media.matches) setOpen(false);
      const active = document.activeElement;
      const dropped = !active || active === document.body;
      const inHeader = active instanceof HTMLElement && header.contains(active);
      const prev = inHeader ? active : dropped ? lastHeaderFocusRef.current : null;
      if (!prev || (prev === active && isShown(prev))) return;

      const href = prev.getAttribute('href');
      const counterpart = media.matches
        ? href
          ? header.querySelector(`.site-header__nav a[href="${CSS.escape(href)}"]`)
          : null
        : menuButtonRef.current;
      const target = isShown(counterpart) ? counterpart : header.querySelector<HTMLElement>('.site-header__brand');
      target?.focus();
    };

    header.addEventListener('focusin', onFocusIn);
    header.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onPointerDown);
    media.addEventListener('change', onChange);
    return () => {
      header.removeEventListener('focusin', onFocusIn);
      header.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown);
      media.removeEventListener('change', onChange);
    };
  }, []);

  // While open: Escape (wherever focus is) closes and returns focus to Menu; a press outside
  // the menu closes it (covers browsers that do not focus links on click).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const closeAndFocusMenu = () => {
    setOpen(false);
    menuButtonRef.current?.focus();
  };

  const go = (handler: () => void) => (event: MouseEvent<HTMLAnchorElement>) => {
    setOpen(false);
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    handler();
  };

  // Tabbing out of the Menu button + panel closes it: predictable without a focus trap.
  // A null relatedTarget (e.g. a click that focuses nothing) is left to the pointer handler.
  const onBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (open && next && !event.currentTarget.contains(next)) setOpen(false);
  };

  return (
    <header ref={headerRef} className="site-header">
      <div className="container site-header__bar">
        <a className="site-header__brand" href={LINKS[mode].rooms} onClick={go(onGoRooms)}>
          NOBODY FIRST
        </a>
        <nav className="site-header__nav" aria-label="Main">
          <ul>
            <NavLinks current={current} mode={mode} onRooms={go(onGoRooms)} onHowToPlay={go(onGoHowToPlay)} />
          </ul>
        </nav>
        <div ref={menuRef} className="site-menu" onBlur={onBlur}>
          <button
            ref={menuButtonRef}
            type="button"
            className="site-menu__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            Menu
          </button>
          <div id={panelId} className="site-menu__panel" hidden={!open}>
            <nav aria-label="Main">
              <ul className="site-menu__list">
                <NavLinks current={current} mode={mode} onRooms={go(onGoRooms)} onHowToPlay={go(onGoHowToPlay)} />
              </ul>
            </nav>
            <button type="button" className="site-menu__close" onClick={closeAndFocusMenu}>
              Close
            </button>
          </div>
        </div>
      </div>
      {/* The public build has no Local chain mode, so no mode switch. */}
      {!__PUBLIC_BUILD__ && (
        <div className="container mode-switch__bar">
          <ModeSwitch mode={mode} hrefs={modeHrefs} />
        </div>
      )}
    </header>
  );
}
