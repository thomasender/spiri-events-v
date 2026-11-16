import { describe, it, expect } from 'vitest';
import {
  contactPhone,
  messengerLinks,
  normalizeMessengerSelection,
  parseContactText,
  parseRegistrationText,
  toInternationalPhone,
} from '../../src/utils/contactFormat';

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

describe('toInternationalPhone', () => {
  it('keeps a +43 number and drops blanks, brackets, dashes and slashes', () => {
    expect(toInternationalPhone('+43 676 555 0000')).toBe('+436765550000');
    expect(toInternationalPhone('+43 (676) 555-00/00')).toBe('+436765550000');
    expect(toInternationalPhone('+43 (0) 676 555 0000')).toBe('+436765550000');
    expect(toInternationalPhone('+43 0676 555 0000')).toBe('+436765550000');
  });

  it('turns 0043 into +43', () => {
    expect(toInternationalPhone('0043 676 5550000')).toBe('+436765550000');
    expect(toInternationalPhone('0049 171 2345678')).toBe('+491712345678');
  });

  it('reads a leading 0 as an Austrian number', () => {
    expect(toInternationalPhone('0676 555 0000')).toBe('+436765550000');
    expect(toInternationalPhone('0664/1234567')).toBe('+436641234567');
  });

  it('returns null when the number is not clearly international or no number', () => {
    expect(toInternationalPhone('676 5550000')).toBeNull();
    expect(toInternationalPhone('0676')).toBeNull();
    expect(toInternationalPhone('+0676 5550000')).toBeNull();
    expect(toInternationalPhone('anna@example.com')).toBeNull();
    expect(toInternationalPhone('Bitte anrufen')).toBeNull();
    expect(toInternationalPhone('')).toBeNull();
    expect(toInternationalPhone(null)).toBeNull();
    expect(toInternationalPhone('+1234567890123456')).toBeNull();
  });
});

describe('contactPhone', () => {
  it('finds the phone number in the contact text', () => {
    expect(contactPhone('0676 555 0000')).toBe('+436765550000');
    expect(contactPhone('Anna, Tel. +43 664 1234567')).toBe('+436641234567');
  });

  it('is null for an e-mail or free text', () => {
    expect(contactPhone('anna@example.com')).toBeNull();
    expect(contactPhone('Einfach vorbeikommen')).toBeNull();
    expect(contactPhone('')).toBeNull();
    expect(contactPhone(undefined)).toBeNull();
  });
});

describe('normalizeMessengerSelection', () => {
  it('keeps known ids once, in display order', () => {
    expect(normalizeMessengerSelection(['signal', 'whatsapp', 'signal', 'sms'])).toEqual([
      'whatsapp',
      'signal',
    ]);
    expect(normalizeMessengerSelection(undefined)).toEqual([]);
    expect(normalizeMessengerSelection('whatsapp')).toEqual([]);
  });
});

describe('messengerLinks', () => {
  it('builds the links for the chosen messengers', () => {
    expect(messengerLinks('0676 555 0000', ['whatsapp', 'telegram', 'signal'])).toEqual([
      { id: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/436765550000' },
      { id: 'telegram', label: 'Telegram', href: 'https://t.me/+436765550000' },
      { id: 'signal', label: 'Signal', href: 'https://signal.me/#p/+436765550000' },
    ]);
  });

  it('links only the chosen ones', () => {
    expect(messengerLinks('+436765550000', ['signal']).map((l) => l.id)).toEqual(['signal']);
    expect(messengerLinks('+436765550000', [])).toEqual([]);
    expect(messengerLinks('+436765550000', undefined)).toEqual([]);
  });

  it('gives no links for an e-mail, free text or a number it cannot place', () => {
    expect(messengerLinks('anna@example.com', ['whatsapp'])).toEqual([]);
    expect(messengerLinks('Bitte anrufen', ['whatsapp'])).toEqual([]);
    expect(messengerLinks('676 5550000', ['whatsapp'])).toEqual([]);
    expect(messengerLinks(null, ['whatsapp'])).toEqual([]);
  });
});
