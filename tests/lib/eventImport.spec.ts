import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as server from '../../functions/src/eventImport';
import {
  BLOCKLIST_KINDS,
  CANDIDATE_STATUSES,
  CONSENT_STATES,
  candidateToEventData,
  blocklistId,
  blocklistKind,
  countsForActivation,
  fingerprint,
  isBlocked,
  isCuratedEvent,
  isCuratedWithoutConsent,
  isImageUrlAllowed,
  registrableHost,
  type ImportCandidate,
  type ImportOrganizer,
} from '../../functions/src/eventImport';
import * as client from '../../src/utils/eventImport.js';
import { STAGING_PROJECT_ID, PROD_PROJECT_ID } from '../../src/utils/projectTargets.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('fingerprint', () => {
  const base = fingerprint('https://www.example.ch/events/kakao', '2026-12-01', 'Kakao-Zeremonie');

  it('is a sha256 hex string and stable', () => {
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(
      fingerprint('https://www.example.ch/events/kakao', '2026-12-01', 'Kakao-Zeremonie')
    ).toBe(base);
  });

  it('ignores cosmetic differences in URL, date and title', () => {
    expect(
      fingerprint(
        'http://Example.CH/events/kakao/?utm_source=x&fbclid=y#top',
        '2026-12-01T19:00:00+01:00',
        '  KAKAO   zeremonie! '
      )
    ).toBe(base);
    expect(fingerprint('example.ch/events/kakao', '2026-12-01', 'Kakao Zeremonie')).toBe(base);
  });

  it('treats accents and ß alike', () => {
    expect(fingerprint('https://a.at/x', '2026-12-01', 'Klangreise für Groß')).toBe(
      fingerprint('https://a.at/x', '2026-12-01', 'klangreise fur gross')
    );
  });

  it('changes with a different date, title, path or meaningful parameter', () => {
    expect(
      fingerprint('https://example.ch/events/kakao', '2026-12-02', 'Kakao-Zeremonie')
    ).not.toBe(base);
    expect(fingerprint('https://example.ch/events/kakao', '2026-12-01', 'Kakao-Abend')).not.toBe(
      base
    );
    expect(fingerprint('https://example.ch/events/tee', '2026-12-01', 'Kakao-Zeremonie')).not.toBe(
      base
    );
    expect(
      fingerprint('https://example.ch/events/kakao?id=2', '2026-12-01', 'Kakao-Zeremonie')
    ).not.toBe(base);
  });

  it('sorts query parameters', () => {
    expect(fingerprint('https://a.at/x?b=2&a=1', '2026-12-01', 'T')).toBe(
      fingerprint('https://a.at/x?a=1&b=2', '2026-12-01', 'T')
    );
  });
});

describe('blocklist hashing', () => {
  it('blocklistId is the sha256 of the lower-cased address or domain', () => {
    expect(blocklistId('  Info@Example.CH ')).toBe(sha('info@example.ch'));
    expect(blocklistId('example.ch')).toBe(sha('example.ch'));
    expect(blocklistId('https://www.Example.ch/kontakt')).toBe(sha('example.ch'));
    expect(blocklistId('@example.ch')).toBe(sha('example.ch'));
  });

  it('never returns the plain value and refuses empty input', () => {
    expect(blocklistId('info@example.ch')).not.toContain('example');
    expect(() => blocklistId('  ')).toThrow();
  });

  it('blocklistKind tells e-mail from domain', () => {
    expect(blocklistKind('info@example.ch')).toBe('email');
    expect(blocklistKind('example.ch')).toBe('domain');
    expect(BLOCKLIST_KINDS).toEqual(['email', 'domain']);
  });

  it('isBlocked matches the address, its domain and the website domain (incl. parents)', () => {
    const ids = new Set([blocklistId('stop@yoga.ch')]);
    expect(isBlocked({ email: 'STOP@yoga.ch' }, ids)).toBe(true);
    expect(isBlocked({ email: 'info@yoga.ch' }, ids)).toBe(false);

    const domainIds = [blocklistId('yoga.ch')];
    expect(isBlocked({ email: 'info@yoga.ch' }, domainIds)).toBe(true);
    expect(isBlocked({ website: 'https://www.kurse.yoga.ch/termine' }, domainIds)).toBe(true);
    expect(isBlocked({ email: 'info@yoga.at', website: 'https://yoga.at' }, domainIds)).toBe(false);
    expect(isBlocked({ email: 'info@yoga.ch' }, [])).toBe(false);
  });

  it('does not block a whole TLD by accident', () => {
    expect(isBlocked({ email: 'a@yoga.ch' }, [sha('ch')])).toBe(false);
  });
});

describe('isImageUrlAllowed', () => {
  const page = 'https://www.yoga-zuerich.ch/events/kakao';

  it('allows https images on the same registrable host or a subdomain', () => {
    expect(isImageUrlAllowed('https://www.yoga-zuerich.ch/img/a.jpg', page)).toBe(true);
    expect(isImageUrlAllowed('https://yoga-zuerich.ch/img/a.jpg', page)).toBe(true);
    expect(isImageUrlAllowed('https://cdn.yoga-zuerich.ch/a.jpg', page)).toBe(true);
  });

  it('rejects http, other hosts, look-alikes and garbage', () => {
    expect(isImageUrlAllowed('http://www.yoga-zuerich.ch/a.jpg', page)).toBe(false);
    expect(isImageUrlAllowed('https://other.ch/a.jpg', page)).toBe(false);
    expect(isImageUrlAllowed('https://yoga-zuerich.ch.evil.com/a.jpg', page)).toBe(false);
    expect(isImageUrlAllowed('https://evilyoga-zuerich.ch/a.jpg', page)).toBe(false);
    expect(isImageUrlAllowed('https://user:pw@yoga-zuerich.ch/a.jpg', page)).toBe(false);
    expect(isImageUrlAllowed('not a url', page)).toBe(false);
    expect(isImageUrlAllowed(null, page)).toBe(false);
    expect(isImageUrlAllowed('https://yoga-zuerich.ch/a.jpg', 'http://yoga-zuerich.ch/')).toBe(
      false
    );
    expect(isImageUrlAllowed('https://192.168.0.1/a.jpg', 'https://192.168.0.1/')).toBe(false);
  });

  it('rejects Instagram, Facebook and their CDNs, even from a social page', () => {
    for (const url of [
      'https://scontent-zrh1-1.cdninstagram.com/v/t51/a.jpg',
      'https://instagram.fzrh1-1.fna.fbcdn.net/a.jpg',
      'https://scontent.xx.fbcdn.net/a.jpg',
      'https://www.facebook.com/photo.jpg',
      'https://www.instagram.com/p/abc/media',
    ]) {
      expect(isImageUrlAllowed(url, page)).toBe(false);
    }
    expect(
      isImageUrlAllowed('https://www.facebook.com/a.jpg', 'https://www.facebook.com/events/1')
    ).toBe(false);
    expect(
      isImageUrlAllowed('https://www.instagram.com/a.jpg', 'https://www.instagram.com/yoga')
    ).toBe(false);
  });

  it('treats ccTLD second levels and site builders as public suffixes', () => {
    expect(registrableHost('events.verein.or.at')).toBe('verein.or.at');
    expect(registrableHost('a.b.example.ch')).toBe('example.ch');
    expect(registrableHost('yogastudio.wixsite.com')).toBe('yogastudio.wixsite.com');
    expect(
      isImageUrlAllowed('https://other.wixsite.com/a.jpg', 'https://yogastudio.wixsite.com/x')
    ).toBe(false);
    expect(isImageUrlAllowed('https://img.verein.or.at/a.jpg', 'https://verein.or.at/x')).toBe(
      true
    );
    expect(isImageUrlAllowed('https://other.or.at/a.jpg', 'https://verein.or.at/x')).toBe(false);
  });
});

describe('curated event predicates', () => {
  it('isCuratedEvent / isCuratedWithoutConsent / countsForActivation', () => {
    const plain = { status: 'approved' };
    const curated = { status: 'pending', curation: { organizerRef: 'o1', claimable: true } };
    const consented = {
      status: 'approved',
      curation: { organizerRef: 'o1', consentAt: new Date('2026-11-01') },
    };
    expect(isCuratedEvent(plain)).toBe(false);
    expect(isCuratedEvent(curated)).toBe(true);
    expect(isCuratedWithoutConsent(plain)).toBe(false);
    expect(isCuratedWithoutConsent(curated)).toBe(true);
    expect(isCuratedWithoutConsent({ curation: { consentAt: null } })).toBe(true);
    expect(isCuratedWithoutConsent(consented)).toBe(false);
    expect(isCuratedWithoutConsent(null)).toBe(false);
    expect(countsForActivation(plain)).toBe(true);
    expect(countsForActivation(curated)).toBe(false);
    expect(countsForActivation(consented)).toBe(true);
  });

  it('the client copy agrees with the server module', () => {
    for (const ev of [
      null,
      { status: 'approved' },
      { curation: {} },
      { curation: { consentAt: 1 } },
      { curation: 'x' },
      { curation: { claimable: true } },
      { curation: { claimable: false } },
    ]) {
      expect(client.isUnclaimedCuratedEvent(ev)).toBe(server.isUnclaimedCuratedEvent(ev));
      expect(client.isCuratedEvent(ev)).toBe(server.isCuratedEvent(ev));
      expect(client.isCuratedWithoutConsent(ev)).toBe(server.isCuratedWithoutConsent(ev));
    }
  });

  it('the client copy keeps the same constants', () => {
    for (const key of [
      'IMPORT_ORGANIZERS',
      'IMPORT_CANDIDATES',
      'IMPORT_RUNS',
      'IMPORT_BLOCKLIST',
      'IMPORT_OUTREACH',
      'IMPORT_SETTINGS_DOC',
      'IMPORT_REGION_IDS',
      'LEGAL_FORMS',
      'CONSENT_STATES',
      'SYNC_MODES',
      'SOURCE_TYPES',
      'CANDIDATE_STATUSES',
      'OUTREACH_STATUSES',
      'BLOCKLIST_KINDS',
      'PUBLISHABLE_CONSENT_STATES',
    ] as const) {
      expect([key, client[key]]).toEqual([key, server[key]]);
    }
    expect(CONSENT_STATES).toContain('declined');
    expect(CANDIDATE_STATUSES).toContain('duplicate');
  });
});

describe('candidateToEventData', () => {
  const organizer: ImportOrganizer = {
    name: 'Yogaverein Zürich',
    contactEmail: 'info@yoga-zuerich.ch',
    legalForm: 'verein',
    regionId: 'zuerich',
    consent: 'none',
    syncMode: 'curated_once',
  };
  const candidate: ImportCandidate = {
    regionId: 'zuerich',
    organizerRef: 'org1',
    sourceUrl: 'https://www.yoga-zuerich.ch/events/kakao',
    sourceType: 'jsonld',
    imageUrl: 'https://www.yoga-zuerich.ch/img/kakao.jpg',
    rawExtract: {
      title: '  Kakao-Zeremonie ',
      date: '2026-12-01',
      time: '19:00',
      endTime: '21:00',
      place: 'Studio Licht',
      city: 'Zürich',
      lat: 47.37,
      lng: 8.54,
      contribution: 'fee',
      fee: 35,
      priceCurrency: 'CHF',
      description: 'Herzöffnende Zeremonie.\n\nMit <b>Kakao</b> & Musik.',
      category: 'Zeremonie',
    },
  };
  const now = new Date('2026-11-18T10:00:00Z');

  it('maps the facts into the event form shape, pending and owned by the curator', () => {
    const data = candidateToEventData(candidate, organizer, 'curatorUid', { now });
    expect(data).toMatchObject({
      title: 'Kakao-Zeremonie',
      date: '2026-12-01',
      time: '19:00',
      endTime: '21:00',
      endDate: '',
      place: 'Studio Licht',
      city: 'Zürich',
      lat: 47.37,
      lng: 8.54,
      isOnline: false,
      contribution: 'fee',
      fee: 35,
      feeMax: null,
      priceCurrency: 'CHF',
      link: 'https://www.yoga-zuerich.ch/events/kakao',
      recurrence: 'none',
      category: 'Zeremonie',
      regionId: 'zuerich',
      status: 'pending',
      createdBy: 'curatorUid',
      instagramConsent: false,
      organizer: { name: 'Yogaverein Zürich', email: '' },
      curation: {
        organizerRef: 'org1',
        sourceUrl: 'https://www.yoga-zuerich.ch/events/kakao',
        importedAt: now,
        claimable: true,
      },
    });
    expect(data.description).toBe(
      '<p>Herzöffnende Zeremonie.</p><p>Mit &lt;b&gt;Kakao&lt;/b&gt; &amp; Musik.</p>'
    );
  });

  it('carries no image fields, no consent and no e-mail', () => {
    const data = candidateToEventData(candidate, organizer, 'curatorUid', { now });
    for (const key of Object.keys(data)) expect(key.toLowerCase()).not.toContain('image');
    expect(JSON.stringify(data)).not.toContain('kakao.jpg');
    expect(JSON.stringify(data)).not.toContain('info@yoga-zuerich.ch');
    expect((data.curation as Record<string, unknown>).consentAt).toBeUndefined();
    expect(isCuratedWithoutConsent(data)).toBe(true);
  });

  it('shows no personal name for individuals or an unknown legal form', () => {
    for (const legalForm of ['individual', 'unknown'] as const) {
      const data = candidateToEventData(
        candidate,
        { ...organizer, name: 'Anna Muster', legalForm },
        'curatorUid',
        { now }
      );
      expect(data.organizer).toEqual({ name: '', email: '' });
      expect(JSON.stringify(data)).not.toContain('Anna');
    }
  });

  it('falls back to safe defaults for odd extracts', () => {
    const data = candidateToEventData(
      {
        ...candidate,
        rawExtract: {
          title: 'Abend',
          date: '2026-12-01',
          time: '7pm',
          contribution: 'whatever',
          fee: 10,
          lat: 200,
          lng: 8,
          link: 'javascript:alert(1)',
          endDate: '2026-11-01',
        },
      },
      organizer,
      'curatorUid',
      { now }
    );
    expect(data).toMatchObject({
      time: '',
      contribution: 'free',
      fee: null,
      priceCurrency: null,
      category: 'Sonstiges',
      endDate: '',
      link: 'https://www.yoga-zuerich.ch/events/kakao',
    });
    expect('lat' in data).toBe(false);
  });

  it('refuses a candidate without title, date, https source or curator', () => {
    const noTitle = { ...candidate, rawExtract: { date: '2026-12-01' } };
    expect(() => candidateToEventData(noTitle, organizer, 'u', { now })).toThrow();
    const badDate = { ...candidate, rawExtract: { title: 'T', date: '1.12.2026' } };
    expect(() => candidateToEventData(badDate, organizer, 'u', { now })).toThrow();
    const ftp = { ...candidate, sourceUrl: 'ftp://x.ch/a' };
    expect(() => candidateToEventData(ftp, organizer, 'u', { now })).toThrow();
    expect(() => candidateToEventData(candidate, organizer, '', { now })).toThrow();
  });
});

describe('ensure-curator-account options', () => {
  const { resolveCuratorAccountOptions, buildImportSettingsDoc } = client;

  it('defaults to a dry run on staging with the placeholder address', () => {
    expect(resolveCuratorAccountOptions([])).toEqual({
      projectId: STAGING_PROJECT_ID,
      email: 'curator@thetribe.at',
      apply: false,
      allowProd: false,
      target: 'staging',
    });
    expect(
      resolveCuratorAccountOptions(['--apply', '--email', 'Redaktion@thetribe.at'])
    ).toMatchObject({ apply: true, email: 'redaktion@thetribe.at', target: 'staging' });
  });

  it('refuses production without --allow-prod and any other project', () => {
    expect(() => resolveCuratorAccountOptions(['--project', PROD_PROJECT_ID])).toThrow(
      /--allow-prod/
    );
    expect(
      resolveCuratorAccountOptions(['--project', PROD_PROJECT_ID, '--allow-prod'])
    ).toMatchObject({ target: 'production', projectId: PROD_PROJECT_ID });
    expect(() => resolveCuratorAccountOptions(['--project', 'demo-x', '--allow-prod'])).toThrow(
      /verweigert/
    );
    expect(() => resolveCuratorAccountOptions(['--project'])).toThrow();
    expect(() => resolveCuratorAccountOptions(['--email', 'kein-mail'])).toThrow();
    expect(() => resolveCuratorAccountOptions(['--force'])).toThrow();
  });

  it('builds app_settings/import with the curator uid', () => {
    const now = new Date();
    expect(buildImportSettingsDoc('uid1', { now })).toEqual({ curatorUid: 'uid1', updatedAt: now });
    expect(() => buildImportSettingsDoc('', { now })).toThrow();
  });
});
