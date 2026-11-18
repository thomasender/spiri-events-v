import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSOCIATION_IMPRINT,
  IMPORT_RETENTION_DAYS,
  renderOutreachMail,
  type OutreachMailInput,
} from '../../functions/src/importOutreachMail';
import { MAILGUN_EU_BASE, sendMailgunMessage } from '../../functions/src/mailgun';

const input = (over: Partial<OutreachMailInput> = {}): OutreachMailInput => ({
  to: 'info@yoga-tirol.at',
  organizerName: 'Yogaverein <Tirol>',
  website: 'https://www.yoga-tirol.at',
  contactEmail: 'info@yoga-tirol.at',
  regionName: 'Tirol',
  events: [
    { title: 'Kakaozeremonie', date: '2026-12-05', link: 'https://www.yoga-tirol.at/kakao' },
  ],
  previewUrl: 'https://tribe-vbg-staging.web.app/vorschau/import/TOKEN',
  declineUrl: 'https://tribe-vbg-staging.web.app/vorschau/import/TOKEN?aktion=ablehnen',
  privacyUrl: 'https://tribe-vbg-staging.web.app/datenschutz-import',
  linkValidUntil: '2026-11-25T10:00:00.000Z',
  deleteAfter: '2027-02-16T10:00:00.000Z',
  ...over,
});

describe('outreach mail', () => {
  const mail = renderOutreachMail(input());

  it('contains who we are, the events with links, the source of the address and both links', () => {
    for (const part of [
      'gemeinnützigen Vereins Tribe Vorarlberg',
      '05.12.2026: Kakaozeremonie (https://www.yoga-tirol.at/kakao)',
      'aus dem Impressum bzw. den Kontaktangaben dieser Website',
      'https://tribe-vbg-staging.web.app/vorschau/import/TOKEN',
      'https://tribe-vbg-staging.web.app/vorschau/import/TOKEN?aktion=ablehnen',
      'Ohne deine Zustimmung veröffentlichen wir nichts.',
      `nach ${IMPORT_RETENTION_DAYS} Tagen (am 16.02.2027)`,
      'gültig bis 25.11.2026',
      'Dies ist unsere einzige E-Mail an dich.',
    ]) {
      expect(mail.text).toContain(part);
    }
    expect(mail.html).toContain(
      'href="https://tribe-vbg-staging.web.app/vorschau/import/TOKEN?aktion=ablehnen"'
    );
  });

  it('carries the Art. 14 GDPR block and the full imprint', () => {
    for (const part of [
      'Datenschutzinformation (Art. 14 DSGVO)',
      'Verantwortlich:',
      'Zweck:',
      'Art. 6 Abs. 1 lit. f DSGVO',
      'Daten:',
      'Quelle:',
      'Speicherdauer:',
      'Widerspruch',
      'Art. 21 DSGVO',
      'Österreichische Datenschutzbehörde',
      'https://tribe-vbg-staging.web.app/datenschutz-import',
      'Impressum',
      ASSOCIATION_IMPRINT.name,
      `ZVR-Zahl: ${ASSOCIATION_IMPRINT.zvr}`,
      ASSOCIATION_IMPRINT.street,
      ASSOCIATION_IMPRINT.city,
      ASSOCIATION_IMPRINT.email,
    ]) {
      expect(mail.text).toContain(part);
    }
    expect(mail.html).toContain('Datenschutzinformation (Art. 14 DSGVO)');
    expect(mail.html).toContain(`ZVR-Zahl: ${ASSOCIATION_IMPRINT.zvr}`);
  });

  it('has no reminder and no marketing wording', () => {
    const all = `${mail.subject}\n${mail.text}`.toLowerCase();
    for (const word of [
      'erinner',
      'nochmals',
      'noch einmal melden',
      'letzte chance',
      'gratis',
      'kostenlos',
      'exklusiv',
      'angebot',
      'rabatt',
      'jetzt',
      'newsletter',
      'reichweite',
      'sichtbarkeit',
      '!',
    ]) {
      expect(all).not.toContain(word);
    }
    expect(mail.html).not.toMatch(/<img\b/i); // no tracking pixel, no images
  });

  it('escapes organizer data in the HTML and marks test sends', () => {
    expect(mail.html).toContain('Yogaverein &lt;Tirol&gt;');
    expect(mail.html).not.toContain('Yogaverein <Tirol>');
    expect(mail.subject).toBe('Anfrage von tribe: Veranstaltungen von Yogaverein <Tirol>');
    expect(renderOutreachMail(input({ test: true })).subject.startsWith('[TEST] ')).toBe(true);
  });

  it('lists at most ten events', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      title: `E${i}`,
      date: '2026-12-05',
      link: `https://www.yoga-tirol.at/${i}`,
    }));
    const text = renderOutreachMail(input({ events: many })).text;
    expect(text).toContain('E9 ');
    expect(text).not.toContain('E10 ');
    expect(text).toContain('und 3 weitere');
  });

  it('uses the imprint data of the legal page', () => {
    const legal = readFileSync(join(__dirname, '../../src/pages/LegalPage.jsx'), 'utf8');
    for (const value of [
      ASSOCIATION_IMPRINT.name,
      ASSOCIATION_IMPRINT.zvr,
      ASSOCIATION_IMPRINT.street,
      ASSOCIATION_IMPRINT.phone,
    ]) {
      expect(legal).toContain(value);
    }
    // The static privacy page of the import names the same essentials.
    for (const value of [
      'Art. 6 Abs. 1 lit. f DSGVO',
      'Österreichische Datenschutzbehörde',
      '90 Tagen',
    ]) {
      expect(legal).toContain(value);
    }
  });
});

describe('Mailgun tracking switch', () => {
  it('turns open and click tracking off for mails with private links', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { body: string }) =>
        new Response(JSON.stringify({ id: 'x' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    await sendMailgunMessage(MAILGUN_EU_BASE, {
      apiKey: 'k',
      domain: 'mg.example',
      from: 'a@mg.example',
      to: 'b@example.org',
      subject: 's',
      text: 't',
      html: 'h',
      tracking: false,
    });
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('o:tracking')).toBe('no');
    expect(body.get('o:tracking-clicks')).toBe('no');
    expect(body.get('o:tracking-opens')).toBe('no');
  });
});
