import { describe, it, expect } from 'vitest';
import {
  SAVED_VENUES_MAX,
  applyEventFormDefaults,
  isRememberableVenue,
  knownCategory,
  mergeVenue,
  pickDefaults,
  venuesForRegion,
} from '../../src/utils/eventFormDefaults';

const emptyForm = {
  title: '',
  place: '',
  city: '',
  bezirk: '',
  placeRegionId: '',
  cityPicked: false,
  isOnline: false,
  contribution: 'free',
  fee: '',
  feeMax: '',
  priceCurrency: 'EUR',
  feeNote: '',
  firstSessionFree: false,
  link: '',
  registration: '',
  category: '',
  organizer: { name: 'anna', email: 'anna@test.local' },
  kontakt: 'anna@test.local',
  kontaktMessenger: [],
};

const filled = {
  ...emptyForm,
  title: 'Nicht merken',
  place: 'Hauptstraße 1',
  city: 'Dornbirn',
  bezirk: 'Dornbirn',
  cityPicked: true,
  category: 'Yoga',
  contribution: 'fee',
  fee: '20',
  feeMax: '30',
  feeNote: 'p.P.',
  firstSessionFree: true,
  link: 'https://example.com',
  registration: 'anmeldung@example.com',
  organizer: { name: 'Anna Yoga', email: 'anna@test.local' },
  kontakt: '+43 660 1234567',
  kontaktMessenger: ['whatsapp'],
};

describe('pickDefaults', () => {
  it('keeps the reusable answers and drops title, date and the like', () => {
    const d = pickDefaults(filled);
    expect(d).toMatchObject({
      organizerName: 'Anna Yoga',
      kontakt: '+43 660 1234567',
      kontaktMessenger: ['whatsapp'],
      registration: 'anmeldung@example.com',
      link: 'https://example.com',
      place: 'Hauptstraße 1',
      city: 'Dornbirn',
      cityPicked: true,
      category: 'Yoga',
      contribution: 'fee',
      fee: 20,
      feeMax: 30,
      feeNote: 'p.P.',
      firstSessionFree: true,
    });
    expect(d).not.toHaveProperty('title');
  });

  it('does not remember "online" nor an empty place for an online event', () => {
    const previous = { place: 'Alt', city: 'Bregenz', bezirk: 'Bregenz', cityPicked: true };
    const d = pickDefaults({ ...filled, isOnline: true, city: '', place: '' }, previous);
    expect(d.city).toBe('Bregenz');
    expect(d.place).toBe('Alt');
    expect(d.isOnline).toBeUndefined();
  });

  it('forgets fee values when the event is free', () => {
    const d = pickDefaults({ ...filled, contribution: 'free' });
    expect(d).toMatchObject({ contribution: 'free', fee: null, firstSessionFree: false });
  });
});

describe('mergeVenue / venues', () => {
  const venue = (n: number) => ({ place: `Straße ${n}`, city: 'Dornbirn', cityPicked: true });

  it('puts the latest venue first and removes duplicates by Ort + Adresse', () => {
    const list = mergeVenue(mergeVenue([], venue(1)), venue(2));
    const again = mergeVenue(list, { ...venue(1), place: 'STRAßE 1', city: 'dornbirn' });
    expect(again.map((v) => v.place)).toEqual(['STRAßE 1', 'Straße 2']);
  });

  it('keeps at most ten venues', () => {
    let list: unknown[] = [];
    for (let i = 0; i < 14; i++) list = mergeVenue(list, venue(i));
    expect(list).toHaveLength(SAVED_VENUES_MAX);
    expect((list[0] as { place: string }).place).toBe('Straße 13');
  });

  it('ignores a venue without Ort', () => {
    expect(mergeVenue([venue(1)], { place: 'x', city: '' })).toHaveLength(1);
  });

  it('remembers only picked, non-online places', () => {
    expect(isRememberableVenue(filled)).toBe(true);
    expect(isRememberableVenue({ ...filled, cityPicked: false })).toBe(false);
    expect(isRememberableVenue({ ...filled, isOnline: true })).toBe(false);
    expect(isRememberableVenue({ ...filled, city: '' })).toBe(false);
  });

  it('suggests only venues of the chosen region', () => {
    const list = [
      { city: 'Dornbirn', place: '' },
      { city: 'München', place: '', placeRegionId: 'muenchen' },
    ];
    const opts = { regionId: 'muenchen', defaultRegionId: 'vorarlberg' };
    expect(venuesForRegion(list, opts).map((v) => v.city)).toEqual(['München']);
    expect(venuesForRegion(list, { ...opts, regionId: 'vorarlberg' }).map((v) => v.city)).toEqual([
      'Dornbirn',
    ]);
    expect(venuesForRegion(list)).toHaveLength(2);
  });
});

describe('applyEventFormDefaults', () => {
  const defaults = pickDefaults(filled);
  const opts = { organizerDefaults: ['anna'], kontaktDefault: 'anna@test.local' };

  it('fills a fresh form with the remembered values', () => {
    const next = applyEventFormDefaults(emptyForm, defaults, opts);
    expect(next.organizer).toEqual({ name: 'Anna Yoga', email: 'anna@test.local' });
    expect(next.kontakt).toBe('+43 660 1234567');
    expect(next).toMatchObject({
      place: 'Hauptstraße 1',
      city: 'Dornbirn',
      cityPicked: true,
      contribution: 'fee',
      fee: '20',
      feeMax: '30',
      firstSessionFree: true,
      registration: 'anmeldung@example.com',
    });
    expect(next.title).toBe('');
  });

  it('keeps what the person already typed', () => {
    const typed = { ...emptyForm, city: 'Bregenz', registration: 'mein@link.at' };
    const next = applyEventFormDefaults(typed, defaults, opts);
    expect(next.city).toBe('Bregenz');
    expect(next.place).toBe('');
    expect(next.registration).toBe('mein@link.at');
  });

  it('does not take over a place the region check vetoes', () => {
    const next = applyEventFormDefaults(emptyForm, defaults, {
      ...opts,
      placeAllowed: () => false,
    });
    expect(next.city).toBe('');
    expect(next.registration).toBe('anmeldung@example.com');
  });

  it('does nothing without remembered values', () => {
    expect(applyEventFormDefaults(emptyForm, null, opts)).toBe(emptyForm);
  });
});

describe('knownCategory', () => {
  it('returns the registry spelling or nothing for a vanished category', () => {
    expect(knownCategory('yoga', ['Tanz', 'Yoga'])).toBe('Yoga');
    expect(knownCategory('Gelöscht', ['Tanz', 'Yoga'])).toBe('');
    expect(knownCategory('', ['Yoga'])).toBe('');
  });
});
