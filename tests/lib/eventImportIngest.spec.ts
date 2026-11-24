import { describe, expect, it } from 'vitest';
import * as server from '../../functions/src/eventImport';
import { generateEventSlug as serverSlug } from '../../functions/src/eventSlug';
import * as copy from '../../src/utils/eventImportServer.js';
import { generateEventSlug as clientSlug } from '../../src/lib/slug-helpers.js';
import { CATEGORY_COLORS } from '../../src/utils/categoryColors.js';
import {
  candidateIdOf,
  countSkipReasons,
  isFuzzyDuplicate,
  mapCategory,
  organizerIdFromWebsite,
  planIngest,
  planOrganizer,
  resolveImportOptions,
  titleSimilarity,
  validateCandidate,
  validateDiscoveryFile,
  validateOrganizer,
} from '../../src/utils/eventImportIngest.js';

const NOW = new Date('2026-11-18T10:00:00Z');
const TODAY = '2026-11-18';

const organizer = (over: Record<string, unknown> = {}) => ({
  key: 'soul',
  name: 'Soul City',
  website: 'https://www.soulcity.ch/',
  contactEmail: 'info@soulcity.ch',
  legalForm: 'company',
  sourceUrls: ['https://www.soulcity.ch/events'],
  imprintUrl: null,
  ...over,
});
const candidate = (over: Record<string, unknown> = {}) => ({
  organizerKey: 'soul',
  title: 'Kakao-Zeremonie',
  date: '2026-12-01',
  time: '19:00',
  endDate: null,
  place: 'Studio 1',
  city: 'Zürich',
  contribution: 'fee',
  fee: 35,
  currency: 'CHF',
  description: 'Ein Abend mit Kakao.',
  link: 'https://www.soulcity.ch/events/kakao',
  imageUrl: null,
  categoryGuess: 'Meditation',
  sourceUrl: 'https://www.soulcity.ch/events/kakao',
  sourceType: 'llm',
  dateQuote: 'Dienstag, 1. Dezember, 19 Uhr',
  confidence: 0.9,
  ...over,
});
const file = (candidates = [candidate()], organizers = [organizer()], region = 'zuerich') => ({
  region,
  generatedAt: '2026-11-18T09:00:00Z',
  organizers,
  candidates,
  notes: {},
});
const plan = (f: unknown, ctx: Record<string, unknown> = {}) =>
  planIngest(f, { now: NOW, today: TODAY, ...ctx }) as any;

describe('validateDiscoveryFile', () => {
  it('accepts a valid region and lists', () => {
    expect(validateDiscoveryFile(file())).toMatchObject({ ok: true, region: 'zuerich' });
    expect(validateDiscoveryFile(file([], [], 'tirol')).ok).toBe(true);
  });

  it('rejects other shapes, unknown regions and missing lists', () => {
    expect(validateDiscoveryFile(null).ok).toBe(false);
    expect(validateDiscoveryFile([]).ok).toBe(false);
    expect(validateDiscoveryFile({ ...file(), region: 'atlantis' }).ok).toBe(false);
    expect(validateDiscoveryFile({ region: 'tirol', organizers: [] }).ok).toBe(false);
    expect(plan({ region: 'tirol' })).toMatchObject({ ok: false });
  });
});

describe('validateCandidate', () => {
  const v = (over: Record<string, unknown> = {}) =>
    validateCandidate(candidate(over), { today: TODAY }) as any;

  it('accepts a complete candidate and normalises it', () => {
    const r = v();
    expect(r.ok).toBe(true);
    expect(r.candidate).toMatchObject({
      title: 'Kakao-Zeremonie',
      date: '2026-12-01',
      time: '19:00',
      contribution: 'fee',
      fee: 35,
      priceCurrency: 'CHF',
    });
  });

  it.each([
    [{ dateQuote: '' }, 'missing-dateQuote'],
    [{ dateQuote: undefined }, 'missing-dateQuote'],
    [{ title: ' ' }, 'missing-title'],
    [{ sourceUrl: null }, 'invalid-sourceUrl'],
    [{ sourceUrl: 'http://www.soulcity.ch/x' }, 'invalid-sourceUrl'],
    [{ sourceUrl: 'https://www.instagram.com/p/abc' }, 'invalid-sourceUrl'],
    [{ sourceUrl: 'https://m.facebook.com/events/1' }, 'invalid-sourceUrl'],
    [{ date: '2026-02-30' }, 'invalid-date'],
    [{ date: '01.12.2026' }, 'invalid-date'],
    [{ date: null }, 'invalid-date'],
    [{ date: '2026-11-18' }, 'past-date'],
    [{ date: '2026-01-05' }, 'past-date'],
  ])('rejects %j as %s', (over, reason) => {
    expect(v(over)).toEqual({ ok: false, reason });
  });

  it('drops a disallowed image URL instead of failing', () => {
    for (const imageUrl of [
      'https://scontent.cdninstagram.com/a.jpg',
      'https://other.example.org/a.jpg',
      'http://www.soulcity.ch/a.jpg',
      'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg',
    ]) {
      const r = v({ imageUrl });
      expect(r.ok).toBe(true);
      expect(r.candidate.imageUrl).toBeNull();
      expect(r.imageDropped).toBe(true);
    }
    const ok = v({ imageUrl: 'https://cdn.soulcity.ch/a.jpg' });
    expect(ok.candidate.imageUrl).toBe('https://cdn.soulcity.ch/a.jpg');
    expect(ok.imageDropped).toBe(false);
  });

  it('keeps a donation and the end time (Spendenbasis, 10:00 to 17:30)', () => {
    const r = v({ contribution: 'donation', fee: 5, time: '10:00', endTime: '17:30' });
    expect(r.candidate).toMatchObject({
      contribution: 'donation',
      fee: null,
      time: '10:00',
      endTime: '17:30',
    });
    expect(v({ endTime: '5pm' }).candidate.endTime).toBe('');
  });

  it('keeps unknown contribution, replaces a social link by the source page', () => {
    const r = v({ contribution: 'unknown', fee: 5, link: 'https://instagram.com/x' });
    expect(r.candidate.contribution).toBe('unknown');
    expect(r.candidate.fee).toBeNull();
    expect(r.candidate.link).toBe('https://www.soulcity.ch/events/kakao');
  });
});

describe('validateOrganizer / planOrganizer', () => {
  it('derives a deterministic id from the website host', () => {
    expect(organizerIdFromWebsite('https://www.Soulcity.ch/events')).toBe('soulcity-ch');
    expect(organizerIdFromWebsite('https://yanantintribe.com/')).toBe('yanantintribe-com');
    expect(organizerIdFromWebsite('nonsense')).toBe('');
  });

  it('rejects an organizer without a usable website', () => {
    expect(validateOrganizer(organizer({ website: null }))).toMatchObject({ ok: false });
    expect(validateOrganizer(organizer({ website: 'https://instagram.com/x' }))).toMatchObject({
      ok: false,
    });
  });

  it('creates with consent none / curated_once and never stores a mail for individuals', () => {
    const company = (validateOrganizer(organizer()) as any).organizer;
    expect(planOrganizer(company, 'zuerich', undefined, NOW)).toMatchObject({
      action: 'create',
      data: {
        consent: 'none',
        syncMode: 'curated_once',
        legalForm: 'company',
        contactEmail: 'info@soulcity.ch',
        regionId: 'zuerich',
      },
    });
    const person = (validateOrganizer(organizer({ legalForm: 'individual' })) as any).organizer;
    const created = planOrganizer(person, 'zuerich', undefined, NOW);
    expect(created.data).not.toHaveProperty('contactEmail');
    // ... not even later, when an existing individual lacks one.
    const updated = planOrganizer(
      person,
      'zuerich',
      { legalForm: 'individual', sourceUrls: [] },
      NOW
    );
    expect(JSON.stringify(updated)).not.toContain('soulcity.ch/info');
    expect((updated.data as any).contactEmail).toBeUndefined();
  });

  it('updates only new source URLs / a missing mail and keeps consent', () => {
    const o = (validateOrganizer(organizer()) as any).organizer;
    const existing = {
      consent: 'asked',
      legalForm: 'verein',
      contactEmail: 'x@soulcity.ch',
      sourceUrls: ['https://www.soulcity.ch/events'],
    };
    expect(planOrganizer(o, 'zuerich', existing, NOW).action).toBe('unchanged');
    const more = (
      validateOrganizer(organizer({ sourceUrls: ['https://www.soulcity.ch/b'] })) as any
    ).organizer;
    const r = planOrganizer(more, 'zuerich', existing, NOW);
    expect(r.action).toBe('update');
    expect(Object.keys(r.data).sort()).toEqual(['sourceUrls', 'updatedAt']);
  });
});

describe('category mapping', () => {
  const names = Object.keys(CATEGORY_COLORS);

  it('maps exact names, synonyms and title keywords to existing categories only', () => {
    expect(mapCategory('Yoga')).toBe('Yoga');
    expect(mapCategory('tanz')).toBe('Tanz');
    expect(mapCategory('Klang')).toBe('Soundhealing');
    expect(mapCategory('Kirtan')).toBe('Singen');
    expect(mapCategory('Breathwork')).toBe('Breathwork');
    expect(mapCategory('Workshop', 'Ecstatic Dance Innsbruck')).toBe('Tanz');
  });

  it('falls back to the generic category and never invents one', () => {
    expect(mapCategory('Retreat', 'Year-end retreat')).toBe('Sonstiges');
    expect(mapCategory('', '')).toBe('Sonstiges');
    expect(mapCategory(undefined as unknown as string)).toBe('Sonstiges');
    for (const g of ['Kreis', 'Zeremonie', 'Retreat', 'Yoga', 'xyz', 'Heilung']) {
      expect(names).toContain(mapCategory(g, g));
    }
  });
});

describe('titleSimilarity / isFuzzyDuplicate', () => {
  it('scores near-identical titles high and different ones low', () => {
    expect(titleSimilarity('Kakao-Zeremonie', 'kakao zeremonie!')).toBe(1);
    expect(titleSimilarity('Ecstatic Dance Zürich', 'Ecstatic Dance Zuerich')).toBeGreaterThan(0.8);
    expect(titleSimilarity('Kakao Zeremonie', 'Kakao-Zeremonie mit Live Musik')).toBeGreaterThan(
      0.8
    );
    expect(titleSimilarity('Kakao Zeremonie', 'Yin Yoga')).toBeLessThan(0.4);
    expect(titleSimilarity('', 'x')).toBe(0);
  });

  it('needs the same day and compatible start times', () => {
    const a = { title: 'Ecstatic Dance', date: '2026-12-01', time: '19:00' };
    expect(isFuzzyDuplicate(a, { ...a })).toBe(true);
    expect(isFuzzyDuplicate(a, { ...a, date: '2026-12-02' })).toBe(false);
    expect(isFuzzyDuplicate(a, { ...a, time: '10:00' })).toBe(false);
    expect(isFuzzyDuplicate(a, { ...a, time: undefined })).toBe(true);
  });
});

describe('planIngest', () => {
  it('turns a valid file into organizers and found candidates', () => {
    const r = plan(file());
    expect(r.ok).toBe(true);
    expect(r.counts).toMatchObject({ organizersCreate: 1, accepted: 1, duplicates: 0 });
    expect(r.organizers[0]).toMatchObject({ id: 'soulcity-ch', action: 'create' });
    const c = r.candidates[0];
    expect(c.id).toBe(
      candidateIdOf(server.fingerprint(c.data.sourceUrl, '2026-12-01', 'Kakao-Zeremonie'))
    );
    expect(c.data).toMatchObject({
      regionId: 'zuerich',
      organizerRef: 'soulcity-ch',
      status: 'found',
      eventId: null,
      imageUrl: null,
      rawExtract: {
        title: 'Kakao-Zeremonie',
        category: 'Meditation',
        contribution: 'fee',
        fee: 35,
      },
    });
    expect(c.data).not.toHaveProperty('pilotExcluded');
    expect(c.data.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sets the district through the injected resolver', () => {
    const r = plan(file(), {
      districtOf: (city: string) => (city === 'Zürich' ? 'Stadt Zürich' : ''),
    });
    expect(r.candidates[0].data.rawExtract.bezirk).toBe('Stadt Zürich');
  });

  it('flags individuals as pilotExcluded but still imports them', () => {
    const r = plan(file([candidate()], [organizer({ legalForm: 'individual' })]));
    expect(r.candidates[0].data).toMatchObject({ status: 'found', pilotExcluded: true });
    expect(r.organizers[0].data).not.toHaveProperty('contactEmail');
    expect(r.counts.pilotExcluded).toBe(1);
  });

  it('skips invalid candidates with a reason and unknown organizers', () => {
    const r = plan(
      file([
        candidate({ dateQuote: '' }),
        candidate({ title: 'Anderes', organizerKey: 'ghost' }),
        candidate({ title: 'Gestern', date: '2026-11-01' }),
        candidate({ title: 'Gut' }),
      ])
    );
    expect(r.candidates).toHaveLength(1);
    expect(countSkipReasons(r.skipped)).toEqual({
      'missing-dateQuote': 1,
      'unknown-organizer': 1,
      'past-date': 1,
    });
  });

  it('skips blocklisted organizers (by mail, mail domain or website domain) and counts them', () => {
    for (const blocked of ['info@soulcity.ch', 'soulcity.ch']) {
      const r = plan(file(), { blockedIds: new Set([server.blocklistId(blocked)]) });
      expect(r.counts).toMatchObject({ organizersBlocked: 1, accepted: 0, organizersCreate: 0 });
      expect(r.organizers).toHaveLength(0);
      expect(r.candidates).toHaveLength(0);
      expect(countSkipReasons(r.skipped)).toEqual({ blocked: 1 });
    }
    const other = plan(file(), { blockedIds: new Set([server.blocklistId('other.ch')]) });
    expect(other.counts.accepted).toBe(1);
  });

  it('dedupes by fingerprint: the same event twice in a file and against existing candidates', () => {
    const twice = plan(file([candidate(), candidate({ link: 'https://www.soulcity.ch/other' })]));
    expect(twice.candidates).toHaveLength(1);
    expect(countSkipReasons(twice.skipped)).toEqual({ exists: 1 });

    const first = plan(file());
    const existing = new Map(first.candidates.map((c: any) => [c.id, c.data]));
    const again = plan(file(), { existingCandidates: existing });
    expect(again.candidates).toHaveLength(0);
    expect(countSkipReasons(again.skipped)).toEqual({ exists: 1 });
  });

  it('marks a fuzzy match with an existing event of the region as duplicate with a reference', () => {
    const r = plan(file(), {
      existingEvents: [{ id: 'ev1', title: 'Kakao Zeremonie', date: '2026-12-01', time: '19:00' }],
    });
    expect(r.candidates[0].data).toMatchObject({
      status: 'duplicate',
      duplicateOf: { kind: 'event', id: 'ev1' },
    });
    expect(r.counts).toMatchObject({ accepted: 0, duplicates: 1 });
  });

  it('does not treat other days or different events as duplicates', () => {
    const r = plan(file(), {
      existingEvents: [
        { id: 'a', title: 'Kakao Zeremonie', date: '2026-12-02' },
        { id: 'b', title: 'Yin Yoga', date: '2026-12-01' },
      ],
    });
    expect(r.candidates[0].data.status).toBe('found');
  });

  it('marks the same event found on a second page (other URL) as duplicate of the first candidate', () => {
    const r = plan(
      file([
        candidate(),
        candidate({
          title: 'Kakao Zeremonie',
          sourceUrl: 'https://www.soulcity.ch/kalender',
          link: 'https://www.soulcity.ch/kalender',
        }),
      ])
    );
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[1].data).toMatchObject({
      status: 'duplicate',
      duplicateOf: { kind: 'candidate', id: r.candidates[0].id },
    });
  });

  it('is idempotent: planning again on what was written plans nothing new', () => {
    const f = file([
      candidate(),
      candidate({ title: 'Yin Yoga', sourceUrl: 'https://www.soulcity.ch/yin' }),
    ]);
    const first = plan(f);
    const existingOrganizers = new Map(first.organizers.map((o: any) => [o.id, o.data]));
    const existingCandidates = new Map(first.candidates.map((c: any) => [c.id, c.data]));
    const second = plan(f, { existingOrganizers, existingCandidates });
    expect(second.candidates).toHaveLength(0);
    expect(second.organizers.every((o: any) => o.action === 'unchanged')).toBe(true);
    expect(second.counts).toMatchObject({ accepted: 0, organizersUnchanged: 1 });
  });
});

describe('resolveImportOptions', () => {
  it('defaults to a dry run on staging and collects --file', () => {
    expect(resolveImportOptions(['--file', 'a.json', '--file', 'b.json'])).toMatchObject({
      files: ['a.json', 'b.json'],
      apply: false,
      target: 'staging',
      projectId: 'tribe-vbg-staging',
    });
    expect(resolveImportOptions(['--file', 'a.json', '--apply']).apply).toBe(true);
  });

  it('needs a file, refuses unknown options and any other project', () => {
    expect(() => resolveImportOptions([])).toThrow(/--file/);
    expect(() => resolveImportOptions(['--file', 'a.json', '--wat'])).toThrow(/Unbekannte/);
    expect(() => resolveImportOptions(['--file', 'a.json', '--project', 'other'])).toThrow(
      /verweigert/
    );
    expect(() => resolveImportOptions(['--file', 'a.json', '--project', 'spirieventsvbg'])).toThrow(
      /--allow-prod/
    );
    expect(
      resolveImportOptions(['--file', 'a.json', '--project', 'spirieventsvbg', '--allow-prod'])
        .target
    ).toBe('production');
  });
});

describe('synced copies', () => {
  const urls = [
    'http://Example.CH/events/kakao/?utm_source=x&fbclid=y#top',
    'https://www.example.co.at/a?b=2&a=1',
    'example.ch/x',
  ];
  const titles = ['Klangreise für Groß', '  KAKAO   zeremonie! ', 'Yoga & Co.'];

  it('eventImportServer.js matches functions/src/eventImport.ts', () => {
    for (const u of urls) {
      expect(copy.normalizeSourceUrl(u)).toBe(server.normalizeSourceUrl(u));
      for (const t of titles) {
        expect(copy.fingerprint(u, '2026-12-01T19:00:00Z', t)).toBe(
          server.fingerprint(u, '2026-12-01T19:00:00Z', t)
        );
      }
    }
    for (const t of titles) expect(copy.normalizeTitle(t)).toBe(server.normalizeTitle(t));
    for (const v of ['Info@Example.CH', 'https://www.example.ch/x', '@a.at', 'example.ch']) {
      expect(copy.blocklistId(v)).toBe(server.blocklistId(v));
      expect(copy.blocklistKind(v)).toBe(server.blocklistKind(v));
    }
    const ids = new Set([server.blocklistId('example.ch')]);
    for (const org of [
      { email: 'a@events.example.ch' },
      { website: 'https://shop.example.ch' },
      { website: 'https://other.ch' },
    ]) {
      expect(copy.isBlocked(org, ids)).toBe(server.isBlocked(org, ids));
    }
    const pairs = [
      ['https://cdn.example.ch/a.jpg', 'https://www.example.ch/e'],
      ['https://scontent.cdninstagram.com/a.jpg', 'https://www.example.ch/e'],
      ['https://x.example.co.at/a.jpg', 'https://example.co.at/e'],
      ['http://example.ch/a.jpg', 'https://example.ch/e'],
      ['https://evil.com/a.jpg', 'https://example.ch/e'],
    ];
    for (const [img, page] of pairs) {
      expect(copy.isImageUrlAllowed(img, page)).toBe(server.isImageUrlAllowed(img, page));
    }
    for (const h of ['events.example.co.at', 'a.b.wixsite.com', '10.0.0.1', 'localhost']) {
      expect(copy.registrableHost(h)).toBe(server.registrableHost(h));
    }
  });

  it('generateEventSlug in functions matches src/lib/slug-helpers.js', () => {
    const cases: Array<[string, string, string, string]> = [
      ['Lasst uns singen', 'Singkreis', 'Hohenems', '2026-11-02'],
      ['Ecstatic Dance & Cacao', 'Sonstiges', 'Zürich', '2026-12-01'],
      ['x'.repeat(200), '', '', '2026-12-01'],
      ['Große Klangreise mit Öl', 'Soundhealing', 'Innsbruck', '2027-01-29'],
    ];
    for (const [t, c, p, d] of cases) expect(serverSlug(t, c, p, d)).toBe(clientSlug(t, c, p, d));
  });
});
