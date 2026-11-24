import { describe, it, expect } from 'vitest';
import {
  buildUserAgent,
  extractJsonLdEvents,
  icsHasEvent,
  htmlToText,
  isPathAllowed,
  parseIcsDate,
  parseIcsEvents,
  parseRobots,
  quoteOnPage,
  upcoming,
} from '../../src/utils/importScrape.js';

describe('user agent', () => {
  it('is generic by default and carries a contact only when one is given', () => {
    expect(buildUserAgent(undefined)).toBe('TribeEventBot/1.0 (manual research)');
    expect(buildUserAgent('  ')).toBe('TribeEventBot/1.0 (manual research)');
    expect(buildUserAgent('team@example.org')).toBe(
      'TribeEventBot/1.0 (manual research; contact: team@example.org)'
    );
  });
});

describe('robots.txt', () => {
  const robots = parseRobots(`
User-agent: *
Disallow: /admin/
Disallow: /*.pdf$
Allow: /admin/public/
Crawl-delay: 10

User-agent: GPTBot
Disallow: /
`);
  it('applies the * group, longest match wins, allow beats disallow on a tie', () => {
    expect(isPathAllowed(robots, '/events')).toBe(true);
    expect(isPathAllowed(robots, '/admin/x')).toBe(false);
    expect(isPathAllowed(robots, '/admin/public/page')).toBe(true);
    expect(isPathAllowed(robots, '/files/a.pdf')).toBe(false);
    expect(isPathAllowed(robots, '/files/a.pdf?x=1')).toBe(true);
    expect(robots.crawlDelayMs).toBe(10000);
  });
  it('a group that names our bot replaces the * group; an empty Disallow allows everything', () => {
    const own = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: TribeEventBot\nDisallow: /private/\n'
    );
    expect(isPathAllowed(own, '/events')).toBe(true);
    expect(isPathAllowed(own, '/private/a')).toBe(false);
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow:\n'), '/x')).toBe(true);
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow: /\n'), '/x')).toBe(false);
    expect(isPathAllowed(parseRobots(''), '/x')).toBe(true);
  });
  it('caps an absurd crawl delay', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: 9999\n').crawlDelayMs).toBe(30000);
  });
});

describe('htmlToText', () => {
  it('drops scripts and styles, decodes entities, keeps line breaks of blocks', () => {
    const text = htmlToText(
      '<style>a{}</style><h1>Kakao &amp; Tanz</h1><p>Sa, 19.12.&nbsp;18 Uhr</p><script>x()</script>'
    );
    expect(text).toBe('Kakao & Tanz\nSa, 19.12. 18 Uhr');
  });
});

describe('quoteOnPage', () => {
  const page = 'Yin Yoga am Abend\nDienstag, 22. Dezember 2026 | 19:00 – 20:15 Uhr\nStudio Mitte';
  it('finds an exact quote regardless of case and punctuation', () => {
    expect(quoteOnPage('dienstag, 22. dezember 2026 | 19:00 – 20:15 uhr', page)).toEqual({
      ok: true,
      how: 'exact',
    });
  });
  it('accepts a nearly verbatim quote (80 % of the words), refuses an invented date', () => {
    expect(quoteOnPage('Dienstag 22. Dezember 19:00 20:15 Uhr im Studio', page).ok).toBe(true);
    expect(quoteOnPage('Mittwoch, 23. Dezember 2026, 20:00 Uhr', page).ok).toBe(false);
    expect(quoteOnPage('', page)).toEqual({ ok: false, how: 'no-quote' });
    expect(quoteOnPage('22. Dez', page).how).toBe('too-short');
  });
});

describe('structured events', () => {
  it('reads schema.org events from JSON-LD, also in @graph and nested lists', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"MusicEvent","name":"Kirtan","startDate":"2026-12-20T10:00","location":{"name":"Nanda","address":{"addressLocality":"Zürich","streetAddress":"Klingenstr. 42"}},"offers":{"price":"25","priceCurrency":"CHF"},"url":"https://x.ch/k"}]}</script>
<script type="application/ld+json">not json</script>`;
    expect(extractJsonLdEvents(html)).toEqual([
      {
        title: 'Kirtan',
        start: '2026-12-20T10:00',
        end: '',
        place: 'Nanda',
        city: 'Zürich',
        url: 'https://x.ch/k',
        description: '',
        price: '25',
        currency: 'CHF',
      },
    ]);
  });
  it('parses iCal events with folded lines and escapes', () => {
    const ics =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1@x\r\nSUMMARY:Sound\\, Bath\r\nDTSTART;TZID=Europe/Berlin:20261219T180000\r\nDESCRIPTION:Zeile eins\\n\r\n  zwei\r\nLOCATION:Berlin\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    const [e] = parseIcsEvents(ics);
    expect(e).toMatchObject({ title: 'Sound, Bath', uid: '1@x', place: 'Berlin' });
    expect(e.description).toBe('Zeile eins\n zwei');
    expect(parseIcsDate(e.start)).toEqual({ date: '2026-12-19', time: '18:00' });
    expect(parseIcsDate('20261224')).toEqual({ date: '2026-12-24', time: '' });
    expect(parseIcsDate('x')).toBeNull();
  });
  it('icsHasEvent: same date and a similar title, otherwise not', () => {
    const feed = parseIcsEvents(
      'BEGIN:VEVENT\r\nSUMMARY:Tara- und Chenrezig-Praxis\r\nDTSTART:20261214T190000\r\nEND:VEVENT\r\n'
    );
    expect(icsHasEvent({ title: 'Tara- und Chenrezig- Praxis', date: '2026-12-14' }, feed).ok).toBe(
      true
    );
    expect(icsHasEvent({ title: 'Tara- und Chenrezig- Praxis', date: '2026-12-15' }, feed).ok).toBe(
      false
    );
    expect(icsHasEvent({ title: 'Kakao Zeremonie', date: '2026-12-14' }, feed).ok).toBe(false);
  });
  it('upcoming: strictly after today', () => {
    expect(upcoming('2026-12-19T18:00', '2026-11-24')).toBe(true);
    expect(upcoming('2026-11-24', '2026-11-24')).toBe(false);
    expect(upcoming('', '2026-11-24')).toBe(false);
  });
});
