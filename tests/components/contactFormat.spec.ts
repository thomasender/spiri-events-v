import { describe, it, expect } from 'vitest';
import { parseContactText, parseRegistrationText } from '../../src/utils/contactFormat';

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

describe('parseRegistrationText', () => {
  it('returns no segments for empty or blank input', () => {
    expect(parseRegistrationText('')).toEqual([]);
    expect(parseRegistrationText('   ')).toEqual([]);
    expect(parseRegistrationText(null)).toEqual([]);
    expect(parseRegistrationText(undefined)).toEqual([]);
  });

  it('turns a booking link into a link segment', () => {
    expect(parseRegistrationText('https://example.com/buchen')).toEqual([
      { type: 'link', value: 'https://example.com/buchen', href: 'https://example.com/buchen' },
    ]);
  });

  it('adds https to www links and keeps trailing punctuation out of the link', () => {
    const segments = parseRegistrationText('Buchen auf www.example.com/kurs.');
    expect(segments.find((s) => s.type === 'link')).toEqual({
      type: 'link',
      value: 'www.example.com/kurs',
      href: 'https://www.example.com/kurs',
    });
    expect(segments[0]).toEqual({ type: 'text', value: 'Buchen auf ' });
    expect(segments[segments.length - 1]).toEqual({ type: 'text', value: '.' });
  });

  it('mixes text, link, email and phone and keeps the blanks between them', () => {
    const segments = parseRegistrationText(
      'Online https://example.com/x oder per Mail anmeldung@example.com oder 0676 1234567'
    );
    expect(segments.map((s) => s.type)).toEqual(['text', 'link', 'text', 'email', 'text', 'phone']);
    expect(segments.map((s) => s.value).join('')).toBe(
      'Online https://example.com/x oder per Mail anmeldung@example.com oder 06761234567'
    );
  });

  it('does not make javascript: or other schemes clickable', () => {
    const segments = parseRegistrationText('javascript:alert(1)');
    expect(segments.some((s) => s.type === 'link')).toBe(false);
  });
});
