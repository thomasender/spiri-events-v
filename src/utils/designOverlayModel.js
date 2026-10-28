// Pure geometry for the Design-Modus overlay: given an element's box, its
// computed pixel values and the token each property uses (designInspector),
// returns the coloured bands to paint and the clickable chips.
//
// Everything is in viewport coordinates (what getBoundingClientRect returns).

export const SIDES = ['top', 'right', 'bottom', 'left'];

const SIDE_TEXT = {
  top: 'oben',
  right: 'rechts',
  bottom: 'unten',
  left: 'links',
};

export function describeSides(sides) {
  if (sides.length === 4) return 'rundum';
  const set = new Set(sides);
  if (sides.length === 2 && set.has('top') && set.has('bottom')) return 'oben/unten';
  if (sides.length === 2 && set.has('left') && set.has('right')) return 'links/rechts';
  return sides.map((s) => SIDE_TEXT[s] || s).join(', ');
}

function paddingBands(rect, border, pad) {
  const left = rect.left + border.left;
  const top = rect.top + border.top;
  const width = rect.width - border.left - border.right;
  const height = rect.height - border.top - border.bottom;
  const midH = Math.max(0, height - pad.top - pad.bottom);
  return {
    top: { x: left, y: top, w: width, h: pad.top },
    bottom: { x: left, y: top + height - pad.bottom, w: width, h: pad.bottom },
    left: { x: left, y: top + pad.top, w: pad.left, h: midH },
    right: { x: left + width - pad.right, y: top + pad.top, w: pad.right, h: midH },
  };
}

function marginBands(rect, mar) {
  return {
    top: { x: rect.left, y: rect.top - mar.top, w: rect.width, h: mar.top },
    bottom: { x: rect.left, y: rect.bottom, w: rect.width, h: mar.bottom },
    left: { x: rect.left - mar.left, y: rect.top, w: mar.left, h: rect.height },
    right: { x: rect.right, y: rect.top, w: mar.right, h: rect.height },
  };
}

const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function groupBySide(prefix, tokens, px) {
  const groups = new Map();
  for (const side of SIDES) {
    const token = tokens[`${prefix}-${side}`];
    if (token && px[side] > 0) {
      if (!groups.has(token)) groups.set(token, []);
      groups.get(token).push(side);
    }
  }
  return groups;
}

/**
 * @param {object} input
 * @param {{left:number,top:number,right:number,bottom:number,width:number,height:number}} input.rect
 * @param {{top:number,right:number,bottom:number,left:number}} input.border
 * @param {{top:number,right:number,bottom:number,left:number}} input.padding
 * @param {{top:number,right:number,bottom:number,left:number}} input.margin
 * @param {number} input.rowGap
 * @param {number} input.columnGap
 * @param {boolean} input.isGapContainer  display: flex | grid
 * @param {boolean} input.hasText         element owns visible text
 * @param {Record<string,string|null>} input.tokens  from resolveTokens()
 */
export function buildOverlayModel({
  rect,
  border,
  padding,
  margin,
  rowGap,
  columnGap,
  isGapContainer,
  hasText,
  tokens,
}) {
  const bands = [];
  const chips = [];

  const padGeo = paddingBands(rect, border, padding);
  const marGeo = marginBands(rect, margin);
  for (const side of SIDES) {
    if (padding[side] > 0 && padGeo[side].w > 0 && padGeo[side].h > 0) {
      bands.push({ kind: 'padding', side, ...padGeo[side] });
    }
    if (margin[side] > 0 && marGeo[side].w > 0 && marGeo[side].h > 0) {
      bands.push({ kind: 'margin', side, ...marGeo[side] });
    }
  }

  for (const [kind, px, geo] of [
    ['padding', padding, padGeo],
    ['margin', margin, marGeo],
  ]) {
    for (const [token, sides] of groupBySide(kind, tokens, px)) {
      const at = center(geo[sides[0]]);
      chips.push({ id: `${kind}:${token}:${sides.join('')}`, kind, token, sides, ...at });
    }
  }

  if (isGapContainer) {
    const row = rowGap > 0 ? tokens['row-gap'] : null;
    const col = columnGap > 0 ? tokens['column-gap'] : null;
    for (const token of new Set([row, col].filter(Boolean))) {
      const sides = [];
      if (row === token) sides.push('zeilen');
      if (col === token) sides.push('spalten');
      chips.push({
        id: `gap:${token}:${sides.join('')}`,
        kind: 'gap',
        token,
        sides,
        x: rect.right - 10,
        y: rect.top + 12,
        alignRight: true,
      });
    }
  }

  const single = (kind, prop, x, y, extra = {}) => {
    const token = tokens[prop];
    if (token) chips.push({ id: `${kind}:${token}`, kind, token, sides: [], x, y, ...extra });
  };
  if (hasText) {
    single('font', 'font-size', rect.left + 12, rect.top + 12);
    single('lineheight', 'line-height', rect.left + 12, rect.top + 12);
  }
  for (const prop of ['height', 'min-height', 'max-height']) {
    single('size', prop, rect.left + 12, rect.bottom - 12);
  }
  single('radius', 'border-radius', rect.right - 12, rect.bottom - 12, { alignRight: true });

  // De-duplicate identical chips (e.g. min-height and max-height share a token)
  // and nudge chips that would sit on top of each other.
  const seen = new Set();
  const unique = chips.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
  const placed = [];
  for (const chip of unique) {
    let { y } = chip;
    while (placed.some((p) => Math.abs(p.x - chip.x) < 90 && Math.abs(p.y - y) < 22)) y += 22;
    placed.push({ ...chip, y });
  }
  return { bands, chips: placed };
}
