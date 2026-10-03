import { describe, it, expect } from 'vitest';
import { parseContactText } from '../../src/utils/contactFormat';

describe('parseContactText', () => {
  it('returns no segments for empty input', () => {
    expect(parseContactText('')).toEqual([]);
    expect(parseContactText(null)).toEqual([]);
  });

  it('recognises a bare email', () => {
    expect(parseContactText('  anna@example.com ')).toEqual([
      { type: 'email', value: 'anna@example.com' },
    ]);
  });

  it('recognises a bare phone number and strips whitespace from the value', () => {
    expect(parseContactText('+43 676 555 0000')).toEqual([
      { type: 'phone', value: '+436765550000' },
    ]);
  });

  it('splits mixed text into text, email and phone segments in order', () => {
    expect(parseContactText('Anmeldung unter anna@example.com oder 0676 5550000')).toEqual([
      { type: 'text', value: 'Anmeldung unter ' },
      { type: 'email', value: 'anna@example.com' },
      { type: 'text', value: ' oder ' },
      { type: 'phone', value: '06765550000' },
    ]);
  });

  it('does not turn digits inside an email into a separate phone segment', () => {
    const segments = parseContactText('Mail: kurs1234567@example.com');
    expect(segments.filter((s) => s.type === 'phone')).toEqual([]);
    expect(segments.find((s) => s.type === 'email')?.value).toBe('kurs1234567@example.com');
  });

  it('keeps plain text without contact data as one text segment', () => {
    expect(parseContactText('Einfach vorbeikommen')).toEqual([
      { type: 'text', value: 'Einfach vorbeikommen' },
    ]);
  });
});
