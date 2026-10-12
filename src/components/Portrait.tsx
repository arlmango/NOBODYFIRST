import type { CSSProperties } from 'react';
import aUrl from '../assets/portraits/a.png';
import bUrl from '../assets/portraits/b.png';
import cUrl from '../assets/portraits/c.png';

export type PortraitWho = 'A' | 'B' | 'C';
export type PortraitSize = 'sm' | 'md' | 'lg';

interface Art {
  src: string;
  /** File size in px. */
  w: number;
  h: number;
  /** Visible drawing inside the transparent file, in px (see src/assets/PROVENANCE.md). */
  drawingW: number;
  drawingH: number;
}

// Transparent RGBA crops. One CSS scale applies to all three (width = file px x --scale), so
// A, B and C keep their relative size from the source sheet. Keep the displayed drawing at
// most half its pixel width so it stays sharp at 2x density.
export const PORTRAIT_ART: Readonly<Record<PortraitWho, Art>> = {
  A: { src: aUrl, w: 490, h: 630, drawingW: 479, drawingH: 618 },
  B: { src: bUrl, w: 522, h: 637, drawingW: 511, drawingH: 624 },
  C: { src: cUrl, w: 472, h: 595, drawingW: 459, drawingH: 582 },
};

export interface PortraitProps {
  who: PortraitWho;
  size?: PortraitSize;
  className?: string;
}

/** Ink portrait (transparent PNG). Decorative: the person's name is always shown as text nearby. */
export function Portrait({ who, size = 'md', className }: PortraitProps) {
  const p = PORTRAIT_ART[who];
  return (
    <img
      className={['portrait', `portrait--${size}`, className].filter(Boolean).join(' ')}
      src={p.src}
      width={p.w}
      height={p.h}
      alt=""
      decoding="async"
      draggable={false}
      style={{ '--w': p.w } as CSSProperties}
    />
  );
}
