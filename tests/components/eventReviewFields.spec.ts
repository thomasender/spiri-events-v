import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  FREE_EDIT_FIELDS,
  OWNER_APPROVED_PATCH_FIELDS,
  REVIEW_REQUIRED_FIELDS,
  reviewEditChanges,
} from '../../src/utils/eventReviewFields';

// An approved event as stored (an older one: no endDate, feeMax, customDates, ...).
const stored = {
  title: 'Yoga am See',
  description: '<p>Beschreibung</p>',
  date: '2026-12-10',
  time: '10:00',
  endTime: '',
  place: 'Seebühne',
  contribution: 'free',
  fee: null,
  link: '',
  recurrence: 'none',
  recurrenceEndDate: '',
  category: 'Yoga',
  bezirk: 'Bregenz',
  city: 'Bregenz',
  regionId: 'vorarlberg',
  organizer: { firstName: 'Anna', lastName: 'Muster', email: 'a@b.c' },
  kontakt: 'a@b.c',
  imageUrl: 'https://x/cover.jpg',
  imageThumbUrl: 'https://x/cover-thumb.webp',
  status: 'approved',
};

// What EventForm's buildEventData sends for that event when nothing changed.
const unchangedPayload = {
  title: 'Yoga am See',
  date: '2026-12-10',
  time: '10:00',
  endTime: '',
  endDate: '',
  place: 'Seebühne',
  contribution: 'free',
  fee: null,
  feeMax: null,
  priceCurrency: null,
  feeNote: '',
  firstSessionFree: false,
  description: '<p>Beschreibung</p>',
  link: '',
  recurrence: 'none',
  recurrenceEndDate: '',
  customDates: [],
  category: 'Yoga',
  bezirk: 'Bregenz',
  city: 'Bregenz',
  isOnline: false,
  regionId: 'vorarlberg',
  organizer: { firstName: 'Anna', lastName: 'Muster', email: 'a@b.c', photoURL: null },
  kontakt: 'a@b.c',
  registration: '',
  instagramConsent: false,
  imageUrl: 'https://x/cover.jpg',
  imageThumbUrl: 'https://x/cover-thumb.webp',
  imageFocalPoint: null,
  imageZoom: null,
  status: 'approved',
};

const edit = (changes: Record<string, unknown>, options?: { coverChanged?: boolean }) =>
  reviewEditChanges(stored, { ...unchangedPayload, ...changes }, options);

describe('reviewEditChanges', () => {
  it('nothing changed: no review, empty patch (empty defaults of old events are no change)', () => {
    expect(edit({})).toEqual({ needsReview: false, reviewFields: [], patch: {} });
  });

  it('date, time, price, link, contact, registration and category are free', () => {
    const result = edit({
      date: '2026-12-17',
      time: '11:00',
      contribution: 'fee',
      fee: 20,
      priceCurrency: 'EUR',
      link: 'https://neu.example',
      kontakt: '0664 123',
      registration: 'Bitte anmelden',
      category: 'Meditation',
    });
    expect(result.needsReview).toBe(false);
    expect(result.patch).toEqual({
      date: '2026-12-17',
      time: '11:00',
      contribution: 'fee',
      fee: 20,
      priceCurrency: 'EUR',
      link: 'https://neu.example',
      kontakt: '0664 123',
      registration: 'Bitte anmelden',
      category: 'Meditation',
    });
  });

  it('a new Ort in the same region sends all position fields (lat / lng follow)', () => {
    const result = edit({ city: 'Hard', place: 'Halle' });
    expect(result.needsReview).toBe(false);
    expect(result.patch).toEqual({
      city: 'Hard',
      place: 'Halle',
      bezirk: 'Bregenz',
      isOnline: false,
      regionId: 'vorarlberg',
    });
  });

  it('a legacy event without regionId gets no regionId in the patch', () => {
    const legacy = { ...stored, regionId: undefined };
    const result = reviewEditChanges(legacy, { ...unchangedPayload, city: 'Hard' });
    expect(result.needsReview).toBe(false);
    expect(result.patch).not.toHaveProperty('regionId');
  });

  it('the whole series is free: recurrence, end date, more custom dates', () => {
    const result = edit({
      recurrence: 'custom',
      customDates: ['2026-12-10', '2026-12-17', '2026-12-24'],
    });
    expect(result.needsReview).toBe(false);
    expect(result.patch).toEqual({
      recurrence: 'custom',
      customDates: ['2026-12-10', '2026-12-17', '2026-12-24'],
    });
    expect(edit({ recurrence: 'weekly', recurrenceEndDate: '2027-06-30' }).needsReview).toBe(false);
  });

  it('the organizer name is free and keeps the stored photo', () => {
    const result = edit({
      organizer: { firstName: 'Anna', lastName: 'Neu', email: 'a@b.c', photoURL: null },
    });
    expect(result.needsReview).toBe(false);
    expect(result.patch).toEqual({
      organizer: { firstName: 'Anna', lastName: 'Neu', email: 'a@b.c', photoURL: null },
    });
  });

  it('a legacy organizer.name split by the form is no change', () => {
    const legacy = { ...stored, organizer: { name: 'Anna Maria Muster', email: 'a@b.c' } };
    const result = reviewEditChanges(legacy, {
      ...unchangedPayload,
      organizer: { firstName: 'Anna', lastName: 'Maria Muster', email: 'a@b.c', photoURL: null },
    });
    expect(result.patch).toEqual({});
  });

  it('cover crop (focal point / zoom) is free', () => {
    const result = edit({ imageFocalPoint: { x: 0.2, y: 0.4 }, imageZoom: 1.5 });
    expect(result.needsReview).toBe(false);
    expect(result.patch).toEqual({ imageFocalPoint: { x: 0.2, y: 0.4 }, imageZoom: 1.5 });
  });

  it.each([
    ['title', { title: 'Neuer Titel' }, ['title']],
    ['description', { description: '<p>anders</p>' }, ['description']],
    ['removed cover', { imageUrl: null, imageThumbUrl: null }, ['imageUrl', 'imageThumbUrl']],
    ['other region', { regionId: 'tirol' }, ['regionId']],
    [
      'organizer photo',
      {
        organizer: {
          firstName: 'Anna',
          lastName: 'Muster',
          email: 'a@b.c',
          photoURL: 'https://x/me.jpg',
        },
      },
      ['organizer.photoURL'],
    ],
  ])('%s needs a review', (_name, changes, fields) => {
    const result = edit(changes);
    expect(result.needsReview).toBe(true);
    expect(result.reviewFields).toEqual(fields);
  });

  it('a newly picked cover needs a review, also on an event without a cover', () => {
    expect(edit({}, { coverChanged: true }).needsReview).toBe(true);
    const noCover = { ...stored, imageUrl: undefined, imageThumbUrl: undefined };
    const payload = { ...unchangedPayload, imageUrl: null, imageThumbUrl: null };
    expect(reviewEditChanges(noCover, payload).needsReview).toBe(false);
    expect(reviewEditChanges(noCover, payload, { coverChanged: true }).needsReview).toBe(true);
  });

  it('whitespace around an unchanged title is no change', () => {
    expect(reviewEditChanges({ ...stored, title: 'Yoga am See ' }, unchangedPayload)).toEqual({
      needsReview: false,
      reviewFields: [],
      patch: {},
    });
  });

  it('never puts a review field into the patch', () => {
    const result = edit({ title: 'X', description: 'Y', date: '2027-01-01' });
    for (const field of REVIEW_REQUIRED_FIELDS) expect(result.patch).not.toHaveProperty(field);
  });
});

// The rules (isOwnerApprovedPatch) and the client must agree on which fields
// are free, else a "kept approved" save is rejected or a review is skipped.
describe('eventReviewFields stays in sync with firestore.rules', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const body = rules.slice(
    rules.indexOf('function isOwnerApprovedPatch('),
    rules.indexOf('function isOwnerOrganizerNameChange(')
  );
  const listAfter = (marker: string) => {
    const start = body.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const list = body.slice(start + marker.length, body.indexOf('])', start));
    return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  it('the whitelist equals OWNER_APPROVED_PATCH_FIELDS', () => {
    expect([...listAfter('changed.hasOnly([')].sort()).toEqual(
      [...OWNER_APPROVED_PATCH_FIELDS].sort()
    );
  });

  it('the blocked fields equal REVIEW_REQUIRED_FIELDS and are not free', () => {
    expect([...listAfter('changed.hasAny([')].sort()).toEqual([...REVIEW_REQUIRED_FIELDS].sort());
    for (const field of REVIEW_REQUIRED_FIELDS) {
      expect(OWNER_APPROVED_PATCH_FIELDS).not.toContain(field);
      expect(FREE_EDIT_FIELDS).not.toContain(field);
    }
  });
});
