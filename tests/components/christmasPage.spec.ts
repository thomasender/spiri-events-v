import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTENT,
  contentEquals,
  mergeContent,
  registrationsToCsv,
  sanitizeContent,
  summarizeRegistrations,
  seatStatus,
  validateRegistration,
} from '../../src/lib/christmasPage';

describe('christmasPage content', () => {
  it('falls back to the defaults for missing or malformed fields', () => {
    expect(mergeContent(null)).toEqual(DEFAULT_CONTENT);
    const merged = mergeContent({ title: 5, steps: 'x', bringIdeas: [1, 'Brot'], place: 'Halle' });
    expect(merged.title).toBe(DEFAULT_CONTENT.title);
    expect(merged.steps).toEqual(DEFAULT_CONTENT.steps);
    expect(merged.bringIdeas).toEqual(['Brot']);
    expect(merged.place).toBe('Halle');
  });

  it('trims, drops empty ideas and steps, and compares sanitized', () => {
    const out = sanitizeContent({
      ...DEFAULT_CONTENT,
      title: '  Fest  ',
      bringIdeas: ['Brot', '  ', 'Kekse '],
      steps: [
        { title: '', text: '' },
        { title: 'A', text: ' b ' },
      ],
    });
    expect(out.title).toBe('Fest');
    expect(out.bringIdeas).toEqual(['Brot', 'Kekse']);
    expect(out.steps).toEqual([{ title: 'A', text: 'b' }]);
    expect(
      contentEquals(DEFAULT_CONTENT, { ...DEFAULT_CONTENT, title: ` ${DEFAULT_CONTENT.title} ` })
    ).toBe(true);
    expect(contentEquals(DEFAULT_CONTENT, { ...DEFAULT_CONTENT, place: 'Anderswo' })).toBe(false);
  });
});

describe('validateRegistration', () => {
  const valid = {
    name: ' Anna ',
    contact: 'anna@example.com',
    persons: 2,
    bring: ['Brot', 'brot', ' '],
    note: '',
  };

  it('normalizes a valid registration (dedupes the list, trims)', () => {
    const r = validateRegistration(valid);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({
      name: 'Anna',
      contact: 'anna@example.com',
      persons: 2,
      bring: ['Brot'],
      note: '',
      showPublic: false,
    });
  });

  it('accepts a phone number and rejects junk, empty names and bad head counts', () => {
    expect(validateRegistration({ ...valid, contact: '+43 664 1234567' }).ok).toBe(true);
    expect(validateRegistration({ ...valid, contact: 'hallo' }).errors.contact).toBeTruthy();
    expect(validateRegistration({ ...valid, name: ' ' }).errors.name).toBeTruthy();
    expect(validateRegistration({ ...valid, persons: 0 }).errors.persons).toBeTruthy();
    expect(validateRegistration({ ...valid, persons: 11 }).errors.persons).toBeTruthy();
    expect(validateRegistration({ ...valid, persons: 1.5 }).errors.persons).toBeTruthy();
  });
});

describe('registrations overview', () => {
  const list = [
    { name: 'A', contact: 'a@b.at', persons: 2, bring: ['Brot', 'Salat'] },
    { name: 'B', contact: '+43123456', persons: 3, bring: ['brot'], note: '=cmd' },
  ];

  it('sums persons and counts the Mitbringliste case-insensitively', () => {
    const s = summarizeRegistrations(list);
    expect(s.registrations).toBe(2);
    expect(s.persons).toBe(5);
    expect(s.bring[0]).toEqual({ label: 'Brot', count: 2 });
  });

  it('exports CSV without formula injection', () => {
    const csv = registrationsToCsv(list);
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv).toContain(`"'=cmd"`);
  });
});

describe('seatStatus and the opt-in photo', () => {
  it('maps head counts to open / few / full', () => {
    expect([0, 59, 60, 79, 80, 95].map(seatStatus)).toEqual([
      'open',
      'open',
      'few',
      'few',
      'full',
      'full',
    ]);
  });

  it('keeps showPublic only when exactly true and drops photo URLs the rules would refuse', () => {
    const base = { name: 'A', contact: 'a@b.at', persons: 1, bring: [], note: '' };
    expect(validateRegistration({ ...base, showPublic: 'yes' }).value.showPublic).toBe(false);
    expect(validateRegistration({ ...base, showPublic: true }).value.showPublic).toBe(true);
    expect(
      validateRegistration({ ...base, photoURL: 'https://evil.example/x.jpg' }).value
    ).not.toHaveProperty('photoURL');
    expect(
      validateRegistration({
        ...base,
        photoURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg',
      }).value.photoURL
    ).toContain('firebasestorage');
  });
});
