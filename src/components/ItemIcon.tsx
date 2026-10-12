import type { CSSProperties } from 'react';
import coinUrl from '../assets/items/coin.png';
import keyUrl from '../assets/items/key.png';

export type ItemIconItem = 'KEY' | 'COIN';

// Transparent RGBA crops (see src/assets/PROVENANCE.md). The key is drawn on a diagonal and is
// wider than the coin; free-standing icons share one scale (width = file px x --item-scale) so
// both keep their relative size. Fixed-box contexts use object-fit: contain instead.
export const ITEM_ART: Readonly<
  Record<ItemIconItem, { src: string; w: number; h: number; drawingW: number; drawingH: number }>
> = {
  KEY: { src: keyUrl, w: 288, h: 255, drawingW: 275, drawingH: 242 },
  COIN: { src: coinUrl, w: 234, h: 238, drawingW: 221, drawingH: 225 },
};

export interface ItemIconProps {
  item: ItemIconItem;
  className?: string;
}

/** Small item drawing. Decorative: a text label ("1 key") is always shown next to it. */
export function ItemIcon({ item, className }: ItemIconProps) {
  const it = ITEM_ART[item];
  return (
    <img
      className={['item-icon', `item-icon--${item.toLowerCase()}`, className].filter(Boolean).join(' ')}
      src={it.src}
      width={it.w}
      height={it.h}
      alt=""
      decoding="async"
      draggable={false}
      style={{ '--iw': it.w } as CSSProperties}
    />
  );
}
