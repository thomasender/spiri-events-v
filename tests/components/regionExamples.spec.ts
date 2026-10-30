import { describe, it, expect } from 'vitest';
import {
  EXAMPLE_MAX_LENGTH,
  LEGACY_EXAMPLES,
  NEUTRAL_EXAMPLES,
  formExamples,
  sanitizeTexts,
} from '../../src/utils/regionExamples';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';

const tirol = (texts?: unknown) => ({
  id: 'tirol',
  bezirke: ['Innsbruck', 'Kufstein'],
  ...(texts ? { texts } : {}),
});

describe('formExamples', () => {
  it('dark launch: byte-identical legacy strings whatever is stored', () => {
    const stored = { examples: { place: 'Essen', contact: 'x' } };
    expect(formExamples(null)).toEqual(LEGACY_EXAMPLES);
    expect(formExamples({ id: 'vorarlberg', texts: stored })).toEqual(LEGACY_EXAMPLES);
    expect(formExamples(tirol(stored), { regionSpecific: false })).toEqual(LEGACY_EXAMPLES);
    expect(LEGACY_EXAMPLES).toEqual({
      place: 'z.B. Lindau',
      organizer: 'z.B. Peter Mathis oder Yoga Studio Dornbirn',
      address: 'z.B. Yogastudio Mitte, Stadtstraße 12, 6900 Bregenz',
      contact: 'z.B. 0676 1234567 oder kontakt@email.de',
    });
  });

  it('other region: stored text > first Bezirk (Ort) > neutral', () => {
    const r = formExamples(tirol({ examples: { organizer: 'Studio Inn' } }), {
      regionSpecific: true,
    });
    expect(r).toEqual({
      place: 'z.B. Innsbruck',
      organizer: 'z.B. Studio Inn',
      address: NEUTRAL_EXAMPLES.address,
      contact: NEUTRAL_EXAMPLES.contact,
    });
    expect(
      formExamples(tirol({ examples: { place: 'Hall' } }), { regionSpecific: true }).place
    ).toBe('z.B. Hall');
    expect(formExamples({ id: 'tirol', bezirke: [] }, { regionSpecific: true }).place).toBe(
      NEUTRAL_EXAMPLES.place
    );
  });

  it('a German region: the first Landkreis / Stadt of the CSV without its kind', () => {
    const place = (id: string) =>
      formExamples(
        STATIC_REGIONS.find((r) => r.id === id),
        { regionSpecific: true }
      ).place;
    expect(place('region-stuttgart')).toBe('z.B. Stuttgart');
    expect(place('bodensee')).toBe('z.B. Konstanz');
    expect(place('muenchen')).toBe('z.B. München');
    expect(place('hannover')).toBe('z.B. Region Hannover');
  });

  it('Vorarlberg with several regions keeps legacy unless overridden', () => {
    expect(formExamples({ id: 'vorarlberg' }, { regionSpecific: true })).toEqual(LEGACY_EXAMPLES);
    expect(
      formExamples(
        { id: 'vorarlberg', texts: { examples: { contact: 'a@b.at' } } },
        { regionSpecific: true }
      ).contact
    ).toBe('z.B. a@b.at');
  });

  it('empty strings fall through to the default', () => {
    expect(
      formExamples(tirol({ examples: { place: '  ', address: '' } }), { regionSpecific: true })
    ).toMatchObject({ place: 'z.B. Innsbruck', address: NEUTRAL_EXAMPLES.address });
  });
});

describe('sanitizeTexts / mergeRegions texts', () => {
  it('keeps known keys only, trims, strips line breaks, caps the length', () => {
    const long = 'a'.repeat(200);
    expect(
      sanitizeTexts({
        examples: { place: '  Essen\nRuhr ', organizer: long, bogus: 'x', contact: 5 },
        other: 1,
      })
    ).toEqual({ examples: { place: 'Essen Ruhr', organizer: 'a'.repeat(EXAMPLE_MAX_LENGTH) } });
  });

  it('returns undefined when nothing usable is left', () => {
    expect(sanitizeTexts(undefined)).toBeUndefined();
    expect(sanitizeTexts('x')).toBeUndefined();
    expect(sanitizeTexts({ examples: { place: ' ' } })).toBeUndefined();
  });

  it('mergeRegions copies sanitised texts and leaves regions without texts untouched', () => {
    const merged = mergeRegions([
      { id: 'tirol', texts: { examples: { place: ' Hall ', junk: 'x' } } },
      { id: 'salzburg', texts: 'kaputt' },
    ]);
    expect(merged.find((r) => r.id === 'tirol')?.texts).toEqual({ examples: { place: 'Hall' } });
    expect(merged.find((r) => r.id === 'salzburg')).not.toHaveProperty('texts');
    expect(STATIC_REGIONS[0]).not.toHaveProperty('texts');
  });
});
