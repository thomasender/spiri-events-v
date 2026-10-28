import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  LAYOUT_TOKENS,
  LAYOUT_TOKENS_BY_NAME,
  describeValue,
  formatFluid,
  parseFluid,
  sanitizeLayoutOverrides,
  validateLayoutValue,
} from '../../src/utils/layoutTokens';

// Declared defaults of every `--name: value;` in the :root blocks.
function declaredDefaults(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of ['src/styles/tokens.css', 'src/index.css']) {
    const css = readFileSync(resolve(process.cwd(), file), 'utf8');
    const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
    for (const m of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  }
  return out;
}

describe('layout token catalogue', () => {
  it('has unique names and sane bounds', () => {
    const names = LAYOUT_TOKENS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of LAYOUT_TOKENS) {
      expect(t.min).toBeLessThan(t.max);
      expect(t.label).toBeTruthy();
    }
  });

  it('every default equals the value declared in the stylesheet', () => {
    const declared = declaredDefaults();
    for (const t of LAYOUT_TOKENS) {
      expect(declared.get(t.name), `${t.name} missing in tokens.css / index.css`).toBe(t.default);
    }
  });

  it('every default is itself valid', () => {
    for (const t of LAYOUT_TOKENS) expect(validateLayoutValue(t, t.default)).toBe(t.default);
  });

  it('the stylesheets declare no scale token the catalogue does not know', () => {
    const declared = declaredDefaults();
    const scale = [...declared.keys()].filter((k) => /^--(space-\d|text-\d)/.test(k));
    for (const name of scale) expect(LAYOUT_TOKENS_BY_NAME[name], name).toBeTruthy();
  });
});

describe('validateLayoutValue', () => {
  const pad = LAYOUT_TOKENS_BY_NAME['--card-padding'];
  const lh = LAYOUT_TOKENS_BY_NAME['--lh-body'];
  const hero = LAYOUT_TOKENS_BY_NAME['--fs-hero'];

  it('accepts and normalises lengths', () => {
    expect(validateLayoutValue(pad, ' 20px ')).toBe('20px');
    expect(validateLayoutValue(pad, '20.0px')).toBe('20px');
  });

  it('rejects wrong unit, out-of-range and junk', () => {
    expect(() => validateLayoutValue(pad, '1rem')).toThrow(/px/);
    expect(() => validateLayoutValue(pad, '500px')).toThrow(/Erlaubt/);
    expect(() => validateLayoutValue(pad, '-4px')).toThrow();
    expect(() => validateLayoutValue(pad, 'url(x)')).toThrow();
    expect(() => validateLayoutValue(pad, '')).toThrow();
    expect(() => validateLayoutValue(pad, '16px; color: red')).toThrow();
  });

  it('validates plain numbers', () => {
    expect(validateLayoutValue(lh, '1.8')).toBe('1.8');
    expect(() => validateLayoutValue(lh, '3')).toThrow();
    expect(() => validateLayoutValue(lh, '1.5px')).toThrow();
  });

  it('validates fluid clamp() values and keeps min <= max', () => {
    expect(validateLayoutValue(hero, 'clamp(2rem, 5vw + 1rem, 5rem)')).toBe(
      'clamp(2rem, 5vw + 1rem, 5rem)'
    );
    expect(() => validateLayoutValue(hero, 'clamp(5rem, 5vw + 1rem, 2rem)')).toThrow(/Minimum/);
    expect(() => validateLayoutValue(hero, 'clamp(2rem, 5vw + 1rem, 50rem)')).toThrow();
    expect(() => validateLayoutValue(hero, 'calc(100vw)')).toThrow();
  });

  it('round-trips fluid values', () => {
    const p = parseFluid(hero.default)!;
    expect(formatFluid(p)).toBe(hero.default);
  });
});

describe('sanitizeLayoutOverrides', () => {
  it('drops unknown keys, invalid values and values equal to the default', () => {
    expect(
      sanitizeLayoutOverrides({
        '--card-padding': '24px',
        '--card-gap': '6px',
        '--grid-gap': 'evil',
        '--not-a-token': '1px',
        '--btn-padding-x': 12,
      })
    ).toEqual({ '--card-padding': '24px' });
  });

  it('tolerates garbage input', () => {
    expect(sanitizeLayoutOverrides(null)).toEqual({});
    expect(sanitizeLayoutOverrides('x')).toEqual({});
  });
});

describe('describeValue', () => {
  it('formats for humans', () => {
    expect(describeValue(LAYOUT_TOKENS_BY_NAME['--card-padding'], '24px')).toBe('24 px');
    expect(describeValue(LAYOUT_TOKENS_BY_NAME['--lh-body'], '1.6')).toBe('1.6');
  });
});
