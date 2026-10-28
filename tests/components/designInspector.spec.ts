import { describe, it, expect } from 'vitest';
import {
  expandDeclaration,
  parseDeclarations,
  resolveTokens,
  specificity,
  splitTopLevel,
  tokenOf,
} from '../../src/utils/designInspector';

describe('splitTopLevel', () => {
  it('does not split inside parentheses', () => {
    expect(splitTopLevel('var(--a, 4px) 12px calc(1px + 2px)', ' ')).toEqual([
      'var(--a, 4px)',
      '12px',
      'calc(1px + 2px)',
    ]);
    expect(splitTopLevel('.a, .b:not(.c, .d)', ',')).toEqual(['.a', '.b:not(.c, .d)']);
  });
});

describe('specificity', () => {
  it('counts ids, classes and types', () => {
    expect(specificity('.a')).toEqual([0, 1, 0]);
    expect(specificity('.a .b > li')).toEqual([0, 2, 1]);
    expect(specificity('#x .a:hover')).toEqual([1, 2, 0]);
    expect(specificity('a[href].b')).toEqual([0, 2, 1]);
    expect(specificity('.page-container.directory-page')).toEqual([0, 2, 0]);
  });
});

describe('parseDeclarations', () => {
  it('reads shorthands that contain var() and !important', () => {
    const css = '.a { padding: var(--space-3) var(--card-padding); gap: 4px !important; }';
    expect(parseDeclarations(css)).toEqual([
      { prop: 'padding', value: 'var(--space-3) var(--card-padding)', important: false },
      { prop: 'gap', value: '4px', important: true },
    ]);
  });

  it('ignores nested blocks', () => {
    expect(
      parseDeclarations('.a { color: red; .b { padding: 1px; } margin: 0; }').map((d) => d.prop)
    ).toEqual(['color', 'margin']);
  });
});

describe('expandDeclaration', () => {
  it('expands 1-4 value box shorthands like CSS does', () => {
    const sides = (v: string) => Object.fromEntries(expandDeclaration('padding', v));
    expect(sides('A')).toEqual({
      'padding-top': 'A',
      'padding-right': 'A',
      'padding-bottom': 'A',
      'padding-left': 'A',
    });
    expect(sides('A B')).toEqual({
      'padding-top': 'A',
      'padding-right': 'B',
      'padding-bottom': 'A',
      'padding-left': 'B',
    });
    expect(sides('A B C')).toEqual({
      'padding-top': 'A',
      'padding-right': 'B',
      'padding-bottom': 'C',
      'padding-left': 'B',
    });
    expect(sides('A B C D')).toEqual({
      'padding-top': 'A',
      'padding-right': 'B',
      'padding-bottom': 'C',
      'padding-left': 'D',
    });
  });

  it('expands gap, inline and block', () => {
    expect(Object.fromEntries(expandDeclaration('gap', 'A B'))).toEqual({
      'row-gap': 'A',
      'column-gap': 'B',
    });
    expect(Object.fromEntries(expandDeclaration('margin-inline', 'A'))).toEqual({
      'margin-left': 'A',
      'margin-right': 'A',
    });
    expect(expandDeclaration('color', 'red')).toEqual([]);
  });
});

describe('tokenOf', () => {
  it('only reports catalogue tokens', () => {
    expect(tokenOf('var(--card-padding)')).toBe('--card-padding');
    expect(tokenOf('var(--space-4)')).toBe('--space-4');
    expect(tokenOf('var(--accent-primary)')).toBeNull();
    expect(tokenOf('16px')).toBeNull();
  });
});

describe('resolveTokens (cascade)', () => {
  const decl = (prop: string, token: string | null, important = false) => ({
    prop,
    token,
    important,
  });
  const rule = (order: number, sel: string, spec: number[], decls: ReturnType<typeof decl>[]) => ({
    selectors: [{ text: sel, spec }],
    decls,
    order,
  });

  it('later and more specific rules win, a raw value clears the token', () => {
    document.body.innerHTML = '<div class="card hot"></div>';
    const el = document.querySelector('.card')!;
    const compiled = {
      usage: new Map(),
      rules: [
        rule(
          1,
          '.card',
          [0, 1, 0],
          [decl('padding-top', '--card-padding'), decl('padding-left', '--card-padding')]
        ),
        rule(2, '.card.hot', [0, 2, 0], [decl('padding-left', null)]),
        // more specific but earlier in the file beats nothing: order only breaks ties
        rule(3, '.nope', [0, 1, 0], [decl('padding-top', '--space-9')]),
      ],
    };
    expect(resolveTokens(el, compiled)).toEqual({
      'padding-top': '--card-padding',
      'padding-left': null,
    });
  });

  it('lower specificity does not override even when it comes later', () => {
    document.body.innerHTML = '<p class="a"></p>';
    const el = document.querySelector('p')!;
    const compiled = {
      usage: new Map(),
      rules: [
        rule(1, 'p.a', [0, 1, 1], [decl('row-gap', '--grid-gap')]),
        rule(2, 'p', [0, 0, 1], [decl('row-gap', '--space-2')]),
      ],
    };
    expect(resolveTokens(el, compiled)).toEqual({ 'row-gap': '--grid-gap' });
  });

  it('!important beats specificity', () => {
    document.body.innerHTML = '<p class="a"></p>';
    const el = document.querySelector('p')!;
    const compiled = {
      usage: new Map(),
      rules: [
        rule(1, 'p.a', [0, 1, 1], [decl('row-gap', '--grid-gap')]),
        rule(2, 'p', [0, 0, 1], [decl('row-gap', '--space-2', true)]),
      ],
    };
    expect(resolveTokens(el, compiled)).toEqual({ 'row-gap': '--space-2' });
  });

  it('ignores invalid selectors without throwing', () => {
    document.body.innerHTML = '<p></p>';
    const compiled = {
      usage: new Map(),
      rules: [rule(1, '!!bad((', [0, 0, 0], [decl('row-gap', '--space-2')])],
    };
    expect(resolveTokens(document.querySelector('p')!, compiled)).toEqual({});
  });
});

import { buildOverlayModel, describeSides } from '../../src/utils/designOverlayModel';

describe('buildOverlayModel', () => {
  const rect = { left: 100, top: 200, right: 300, bottom: 400, width: 200, height: 200 };
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  const base = {
    rect,
    border: zero,
    padding: zero,
    margin: zero,
    rowGap: 0,
    columnGap: 0,
    isGapContainer: false,
    hasText: false,
    tokens: {} as Record<string, string | null>,
  };

  it('describes sides in German', () => {
    expect(describeSides(['top', 'right', 'bottom', 'left'])).toBe('rundum');
    expect(describeSides(['top', 'bottom'])).toBe('oben/unten');
    expect(describeSides(['left', 'right'])).toBe('links/rechts');
    expect(describeSides(['top'])).toBe('oben');
  });

  it('groups equal tokens across sides into one chip and paints a band per side', () => {
    const m = buildOverlayModel({
      ...base,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      tokens: {
        'padding-top': '--card-padding',
        'padding-right': '--card-padding',
        'padding-bottom': '--card-padding',
        'padding-left': '--card-padding',
      },
    });
    expect(m.bands.filter((b) => b.kind === 'padding')).toHaveLength(4);
    expect(m.chips).toHaveLength(1);
    expect(m.chips[0]).toMatchObject({ kind: 'padding', token: '--card-padding' });
    expect(m.chips[0].sides).toHaveLength(4);
    expect(m.bands.find((b) => b.side === 'top')).toMatchObject({ x: 100, y: 200, w: 200, h: 16 });
  });

  it('shows no chip for sides without a token or without size', () => {
    const m = buildOverlayModel({
      ...base,
      padding: { top: 0, right: 12, bottom: 0, left: 12 },
      tokens: { 'padding-top': '--space-3', 'padding-left': null, 'padding-right': '--space-3' },
    });
    expect(m.chips.map((c) => c.sides)).toEqual([['right']]);
  });

  it('puts margins outside the box and skips negative margins', () => {
    const m = buildOverlayModel({
      ...base,
      margin: { top: 0, right: 0, bottom: 24, left: -8 },
      tokens: { 'margin-bottom': '--space-6', 'margin-left': '--space-2' },
    });
    expect(m.bands).toEqual([{ kind: 'margin', side: 'bottom', x: 100, y: 400, w: 200, h: 24 }]);
    expect(m.chips).toHaveLength(1);
  });

  it('adds gap, font and size chips only when they apply', () => {
    const none = buildOverlayModel({
      ...base,
      tokens: { 'row-gap': '--grid-gap', 'font-size': '--text-85' },
    });
    expect(none.chips).toHaveLength(0);
    const m = buildOverlayModel({
      ...base,
      isGapContainer: true,
      rowGap: 20,
      columnGap: 20,
      hasText: true,
      tokens: {
        'row-gap': '--grid-gap',
        'column-gap': '--grid-gap',
        'font-size': '--text-85',
        'max-height': '--card-image-height',
        'min-height': '--card-image-height',
      },
    });
    expect(m.chips.map((c) => c.kind).sort()).toEqual(['font', 'gap', 'size']);
  });

  it('nudges chips that would overlap', () => {
    const m = buildOverlayModel({
      ...base,
      hasText: true,
      tokens: { 'font-size': '--text-85', 'line-height': '--lh-body' },
    });
    expect(m.chips).toHaveLength(2);
    expect(Math.abs(m.chips[0].y - m.chips[1].y)).toBeGreaterThanOrEqual(22);
  });
});
