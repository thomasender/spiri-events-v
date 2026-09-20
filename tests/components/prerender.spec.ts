import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

type PrerenderModule = typeof import('../../scripts/prerender.mjs');

async function importPrerender(): Promise<PrerenderModule> {
  return import('../../scripts/prerender.mjs');
}

async function makeFixtureDir(prefix: string): Promise<string> {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function setupFakeDist(distPath: string): Promise<void> {
  fs.mkdirSync(path.join(distPath, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(distPath, 'assets', 'index-AbCdEfGh.js'), '// fake js bundle');
  fs.writeFileSync(path.join(distPath, 'assets', 'index-AbCdEfGh.css'), '/* fake css */');
  fs.writeFileSync(
    path.join(distPath, 'assets', 'RichTextEditor-XyZwVuTq.css'),
    '/* fake lazy chunk css */'
  );
  fs.writeFileSync(
    path.join(distPath, 'assets', 'RichTextEditor-LmNoPqRs.js'),
    '// fake lazy chunk js'
  );
  fs.writeFileSync(path.join(distPath, 'robots.txt'), 'User-agent: *\nAllow: /\n');
}

const sampleEvents = [
  {
    id: 'firestore-id-1',
    title: 'Yoga Workshop',
    description: 'Entspannter Yoga-Kurs für alle Levels.',
    date: '2026-12-15',
    time: '10:00',
    place: 'Yoga Studio',
    bezirk: 'Dornbirn',
    category: 'Yoga',
    status: 'approved',
    slug: 'yoga-workshop-yoga-studio-20261215',
    contribution: 'free',
    imageUrl: 'https://storage.googleapis.com/bucket/yoga.jpg',
  },
  {
    id: 'firestore-id-2',
    title: 'Tanz Workshop',
    description: 'Tanzen für Anfänger.',
    date: '2026-12-20',
    time: '18:00',
    place: 'Tanzhaus',
    bezirk: 'Bregenz',
    category: 'Tanz',
    status: 'approved',
    slug: 'tanz-workshop-tanzhaus-20261220',
    contribution: 'free',
    imageUrl: { nullValue: null },
  },
  {
    id: 'firestore-id-3',
    title: 'Meditation ohne Slug',
    description: 'Geführte Meditation.',
    date: '2026-12-25',
    time: '19:00',
    place: 'Stille Raum',
    bezirk: 'Feldkirch',
    categories: ['Meditation'],
    status: 'approved',
    contribution: 'free',
    imageUrl: { nullValue: null },
  },
];

describe('prerender.mjs helpers', () => {
  describe('unfirestore', () => {
    it('converts Firestore emulator export format to plain JS', async () => {
      const { unfirestore } = await importPrerender();
      const input = {
        id: 'abc',
        title: 'Hello',
        imageUrl: { nullValue: null },
        fee: { integerValue: '1500' },
        active: { booleanValue: 'true' },
        tags: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
        meta: { mapValue: { fields: { created: { timestampValue: '2026-01-01T00:00:00Z' } } } },
        nested: { stringValue: 'deep' },
      };
      expect(unfirestore(input)).toEqual({
        id: 'abc',
        title: 'Hello',
        imageUrl: null,
        fee: 1500,
        active: true,
        tags: ['a', 'b'],
        meta: { created: '2026-01-01T00:00:00Z' },
        nested: 'deep',
      });
    });

    it('leaves plain objects untouched', async () => {
      const { unfirestore } = await importPrerender();
      const plain = { id: 'x', title: 'T', tags: ['a', 'b'] };
      expect(unfirestore(plain)).toEqual(plain);
    });
  });

  describe('getEventFallbackImage', () => {
    it('returns the category-specific image for known categories', async () => {
      const { getEventFallbackImage } = await importPrerender();
      expect(getEventFallbackImage({ category: 'Yoga' })).toBe('/event-fallbacks/yoga.jpg');
      expect(getEventFallbackImage({ category: 'Tanz' })).toBe('/event-fallbacks/tanz.jpg');
    });

    it('returns the Sonstiges fallback for unknown or missing categories', async () => {
      const { getEventFallbackImage } = await importPrerender();
      expect(getEventFallbackImage({})).toBe('/event-fallbacks/sonstiges.jpg');
      expect(getEventFallbackImage({ category: 'Wandern' })).toBe('/event-fallbacks/sonstiges.jpg');
    });
  });

  describe('getEventOgImage', () => {
    it('uses imageUrl when present, even if category would have its own fallback', async () => {
      const { getEventOgImage } = await importPrerender();
      expect(getEventOgImage({ imageUrl: '/uploads/foo.jpg', category: 'Yoga' })).toBe(
        'https://www.thetribe.at/uploads/foo.jpg'
      );
    });

    it('falls back to the category image when imageUrl is null', async () => {
      const { getEventOgImage } = await importPrerender();
      expect(getEventOgImage({ imageUrl: null, category: 'Yoga' })).toBe(
        'https://www.thetribe.at/event-fallbacks/yoga.jpg'
      );
    });
  });

  describe('getEventPath', () => {
    it('returns the slug if present', async () => {
      const { getEventPath } = await importPrerender();
      expect(getEventPath({ id: 'firestore-id', slug: 'nice-slug' })).toBe('nice-slug');
    });

    it('falls back to id when slug is missing (legacy URLs still work)', async () => {
      const { getEventPath } = await importPrerender();
      expect(getEventPath({ id: 'firestore-id' })).toBe('firestore-id');
    });
  });

  describe('mergeEventsByIdentity', () => {
    it('appends events only present in the incoming list (BKtuzVC2)', async () => {
      const { mergeEventsByIdentity } = await importPrerender();
      const base = [{ id: 'old-1', slug: 'old-1', title: 'Old Event', imageUrl: null }];
      const incoming = [
        {
          id: 'new-1',
          slug: 'new-event-2026-09-01',
          title: 'Brand New Event',
          imageUrl: 'https://i.ibb.co/x.jpg',
        },
      ];
      const merged = mergeEventsByIdentity(base, incoming);
      expect(merged).toHaveLength(2);
      expect(merged.map((e) => e.id)).toEqual(['old-1', 'new-1']);
    });

    it('overwrites stale fields on events matched by id (BKtuzVC2)', async () => {
      const { mergeEventsByIdentity } = await importPrerender();
      const base = [{ id: 'evt-1', slug: 'evt-1', title: 'Event 1', imageUrl: null }];
      const incoming = [
        { id: 'evt-1', slug: 'evt-1', title: 'Event 1', imageUrl: 'https://i.ibb.co/x.jpg' },
      ];
      const merged = mergeEventsByIdentity(base, incoming);
      expect(merged).toHaveLength(1);
      expect(merged[0].imageUrl).toBe('https://i.ibb.co/x.jpg');
    });

    it('overwrites stale fields on events matched by slug when ids differ (BKtuzVC2)', async () => {
      const { mergeEventsByIdentity } = await importPrerender();
      const base = [
        { id: 'firestore-id', slug: 'shared-slug', title: 'Old Title', imageUrl: null },
      ];
      const incoming = [
        {
          id: 'live-id',
          slug: 'shared-slug',
          title: 'New Title',
          imageUrl: 'https://i.ibb.co/y.jpg',
        },
      ];
      const merged = mergeEventsByIdentity(base, incoming);
      expect(merged).toHaveLength(1);
      expect(merged[0].imageUrl).toBe('https://i.ibb.co/y.jpg');
      expect(merged[0].title).toBe('New Title');
    });

    it('keeps snapshot events that are absent from the live read (no deletion)', async () => {
      const { mergeEventsByIdentity } = await importPrerender();
      const base = [
        { id: 'kept', slug: 'kept', imageUrl: null },
        { id: 'gone-from-firestore', slug: 'gone-from-firestore', imageUrl: null },
      ];
      const incoming = [{ id: 'kept', slug: 'kept', imageUrl: 'https://i.ibb.co/x.jpg' }];
      const merged = mergeEventsByIdentity(base, incoming);
      expect(merged).toHaveLength(2);
      expect(merged.map((e) => e.id)).toEqual(['kept', 'gone-from-firestore']);
      expect(merged[0].imageUrl).toBe('https://i.ibb.co/x.jpg');
    });

    it('does not mutate the base array', async () => {
      const { mergeEventsByIdentity } = await importPrerender();
      const base = [{ id: 'evt-1', slug: 'evt-1', imageUrl: null }];
      const incoming = [{ id: 'evt-1', slug: 'evt-1', imageUrl: 'https://i.ibb.co/x.jpg' }];
      mergeEventsByIdentity(base, incoming);
      expect(base[0].imageUrl).toBeNull();
    });
  });

  describe('loadEventsFromExport', () => {
    it('reads events from data-export/firestore-export/events.json', async () => {
      const tmp = await makeFixtureDir('prerender-export-');
      writeJson(path.join(tmp, 'events.json'), sampleEvents);
      const { loadEventsFromExport } = await importPrerender();
      const result = loadEventsFromExport(tmp);
      expect(result.events).toHaveLength(3);
      expect(result.events[0].imageUrl).toBe('https://storage.googleapis.com/bucket/yoga.jpg');
      expect(result.events[1].imageUrl).toBeNull();
      expect(result.events[2].category).toBe('Meditation');
    });

    it('returns an empty array (with an error message) when events.json is missing', async () => {
      const tmp = await makeFixtureDir('prerender-empty-');
      const { loadEventsFromExport } = await importPrerender();
      const result = loadEventsFromExport(tmp);
      expect(result.events).toHaveLength(0);
      expect(result.error).toMatch(/events\.json/);
    });
  });

  describe('generateEventHtml', () => {
    it('emits absolute og: and twitter: tags using the event slug (not the id) in the URL', async () => {
      const { generateEventHtml, BASE_URL } = await importPrerender();
      const event = sampleEvents[0];
      const html = generateEventHtml(event);
      expect(html).toContain(
        `<meta property="og:url" content="${BASE_URL}/event/${event.slug}" />`
      );
      expect(html).toContain(`<meta property="og:image" content="${event.imageUrl}" />`);
      expect(html).toContain('<meta property="og:type" content="event" />');
      expect(html).toContain(`<meta name="twitter:image" content="${event.imageUrl}" />`);
      expect(html).toContain('<title>Yoga Workshop | tribe Vorarlberg</title>');
      expect(html).toContain('<link rel="canonical"');
    });

    it('uses the category fallback image when imageUrl is null', async () => {
      const { generateEventHtml, BASE_URL, unfirestore } = await importPrerender();
      const event = unfirestore(sampleEvents[1]);
      const html = generateEventHtml(event);
      expect(html).toContain(
        `<meta property="og:image" content="${BASE_URL}/event-fallbacks/tanz.jpg" />`
      );
      expect(html).toContain(
        `<meta name="twitter:image" content="${BASE_URL}/event-fallbacks/tanz.jpg" />`
      );
    });

    it('escapes user-controlled values in meta tags and titles', async () => {
      const { generateEventHtml } = await importPrerender();
      const event = {
        id: 'x',
        slug: 'evil-<script>',
        title: '"><script>alert(1)</script>',
        description: '<img src=x onerror=alert(1)>',
        date: '2026-12-15',
        place: 'Place & Co',
        bezirk: 'Dornbirn',
        category: 'Yoga',
        status: 'approved',
        contribution: 'free',
        imageUrl: null,
      };
      const html = generateEventHtml(event);
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('Place &amp; Co');
    });
  });

  describe('generateCalendarPageHtml', () => {
    it('uses event slug in /event/<slug> links', async () => {
      const { generateCalendarPageHtml } = await importPrerender();
      const html = generateCalendarPageHtml([sampleEvents[0]], '/assets/x.js', '/assets/x.css');
      expect(html).toContain(`href="/event/${sampleEvents[0].slug}"`);
      expect(html).not.toContain(`href="/event/${sampleEvents[0].id}"`);
    });

    it('renders an animated loading spinner (no misleading "no events" copy) when no upcoming events exist', async () => {
      const { generateCalendarPageHtml } = await importPrerender();
      const pastEvent = { ...sampleEvents[0], date: '2020-01-01' };
      const html = generateCalendarPageHtml([pastEvent], '/assets/x.js', '/assets/x.css');
      expect(html).not.toContain('Keine bevorstehenden');
      expect(html).toContain('class="prerender-loading"');
      expect(html).toContain('@keyframes prerender-spin');
      expect(html).toContain('prefers-reduced-motion');
    });

    it('renders the spinner for JS users and the events list inside <noscript> when upcoming events exist', async () => {
      const { generateCalendarPageHtml } = await importPrerender();
      const html = generateCalendarPageHtml([sampleEvents[0]], '/assets/x.js', '/assets/x.css');
      // JS-enabled users see a clean spinner, then React replaces it with the real calendar.
      expect(html).toContain('class="prerender-loading"');
      // The events list still ships, but only inside <noscript> for no-JS clients.
      const noscriptMatch = html.match(/<noscript>([\s\S]*?)<\/noscript>/);
      expect(noscriptMatch).not.toBeNull();
      expect(noscriptMatch[1]).toContain('class="events-list"');
      // And the events list must NOT appear in the visible body — only inside <noscript>.
      const visibleBody = html.split('<noscript>')[0];
      expect(visibleBody).not.toContain('class="events-list"');
    });
  });

  describe('theme integration', () => {
    it('renders the dynamic :root block from the provided theme', async () => {
      const { generateEventHtml, THEME_FALLBACK } = await importPrerender();
      const html = generateEventHtml(sampleEvents[0], {
        ...THEME_FALLBACK,
        '--accent-primary': '#abcdef',
      });
      expect(html).toContain('--accent-primary: #abcdef;');
      expect(html).not.toContain('--accent-lavender');
    });

    it('falls back to bundled defaults when a theme token is missing', async () => {
      const { generateEventHtml, THEME_FALLBACK } = await importPrerender();
      const html = generateEventHtml(sampleEvents[0], {
        '--accent-primary': '#abcdef',
      });
      expect(html).toContain(`--accent-primary: #abcdef;`);
      expect(html).toContain(`--bg-primary: ${THEME_FALLBACK['--bg-primary']};`);
    });

    it('ignores unknown keys in the theme snapshot', async () => {
      const { generateEventHtml } = await importPrerender();
      const html = generateEventHtml(sampleEvents[0], {
        '--accent-primary': '#abcdef',
        '--injected-attack': 'expression(alert(1))',
      });
      expect(html).not.toContain('--injected-attack');
    });

    it('loadThemeFromExport returns bundled defaults when theme.json is missing', async () => {
      const tmp = await makeFixtureDir('prerender-theme-missing-');
      const { loadThemeFromExport, THEME_FALLBACK } = await importPrerender();
      const result = loadThemeFromExport(tmp);
      expect(result.theme).toEqual({ ...THEME_FALLBACK });
      expect(result.error).toMatch(/theme\.json/);
    });

    it('loadThemeFromExport unwraps Firestore emulator export fields', async () => {
      const tmp = await makeFixtureDir('prerender-theme-firestore-');
      writeJson(path.join(tmp, 'theme.json'), {
        id: 'theme',
        '--accent-primary': { stringValue: '#abcdef' },
        '--bg-primary': { stringValue: '#000000' },
      });
      const { loadThemeFromExport, THEME_FALLBACK } = await importPrerender();
      const result = loadThemeFromExport(tmp);
      expect(result.theme['--accent-primary']).toBe('#abcdef');
      expect(result.theme['--bg-primary']).toBe('#000000');
      expect(result.theme['--error']).toBe(THEME_FALLBACK['--error']);
      expect(result.error).toBeNull();
    });
  });
});

describe('static index.html (production safety net)', () => {
  it('ships baked-in OG + Twitter meta tags so the homepage preview works even if prerender fails', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:site_name" content="tribe Vorarlberg" />');
    expect(html).toContain('<meta property="og:url" content="https://www.thetribe.at/" />');
    expect(html).toContain(
      '<meta property="og:image" content="https://www.thetribe.at/og-default.jpg" />'
    );
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain(
      '<meta name="twitter:image" content="https://www.thetribe.at/og-default.jpg" />'
    );
    expect(html).toContain('<link rel="canonical" href="https://www.thetribe.at/" />');
  });
});

describe('prerender() end-to-end', () => {
  let tmpRoot: string;
  let distPath: string;
  let exportPath: string;

  beforeEach(async () => {
    tmpRoot = await makeFixtureDir('prerender-e2e-');
    distPath = path.join(tmpRoot, 'dist');
    exportPath = path.join(tmpRoot, 'data-export', 'firestore-export');
    fs.mkdirSync(exportPath, { recursive: true });
    await setupFakeDist(distPath);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('generates one HTML file per event under dist/event/<slug>/index.html', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    const result = await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    for (const event of sampleEvents) {
      const eventPath = event.slug || event.id;
      const expectedPath = path.join(distPath, 'event', eventPath, 'index.html');
      expect(fs.existsSync(expectedPath), `${eventPath} prerender file should exist`).toBe(true);
    }
    expect(result.manifest.eventCount).toBe(3);
    expect(result.manifest.prerenderedPages).toBeGreaterThanOrEqual(5);
  });

  it('generated event pages contain absolute og: and twitter: tags with the event slug in og:url', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    const event = sampleEvents[0];
    const html = fs.readFileSync(path.join(distPath, 'event', event.slug, 'index.html'), 'utf8');
    expect(html).toContain(
      `<meta property="og:url" content="https://www.thetribe.at/event/${event.slug}" />`
    );
    expect(html).toContain('<meta property="og:type" content="event" />');
    expect(html).toMatch(/<meta property="og:image:width" content="1200" \/>/);
    expect(html).toMatch(/<meta property="og:image:height" content="630" \/>/);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<link rel="canonical"');
  });

  it('overwrites dist/index.html with a calendar page that has og: tags', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      '<html><body>old placeholder</body></html>'
    );
    const { prerender } = await importPrerender();
    await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
    expect(indexHtml).toContain('<meta property="og:type" content="website" />');
    expect(indexHtml).toContain(
      '<meta property="og:image" content="https://www.thetribe.at/og-default.jpg" />'
    );
    expect(indexHtml).not.toContain('old placeholder');
  });

  it('references the main index-* entry chunk, never a lazy chunk (MCwrJJ5Y)', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
    expect(indexHtml).toContain('/assets/index-AbCdEfGh.js');
    expect(indexHtml).toContain('/assets/index-AbCdEfGh.css');
    expect(indexHtml).not.toContain('RichTextEditor-');
  });

  it('emits a sitemap.xml with /event/<slug> URLs (not /event/<id>)', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    const sitemap = fs.readFileSync(path.join(distPath, 'sitemap.xml'), 'utf8');
    for (const event of sampleEvents) {
      if (!event.slug) continue;
      expect(sitemap).toContain(`https://www.thetribe.at/event/${event.slug}`);
      expect(sitemap).not.toContain(`https://www.thetribe.at/event/${event.id}`);
    }
  });

  it('writes a prerender-manifest.json listing every prerendered page', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(distPath, 'prerender-manifest.json'), 'utf8')
    );
    expect(manifest.eventCount).toBe(3);
    expect(manifest.source).toContain('events.json');
    const paths = manifest.pages.map((p: { path: string }) => p.path);
    for (const event of sampleEvents) {
      const path = event.slug ? `/event/${event.slug}/index.html` : `/event/${event.id}/index.html`;
      expect(paths).toContain(path);
    }
  });

  it('uses event id as fallback path when slug is missing (legacy ids)', async () => {
    const legacyOnly = [
      {
        id: 'legacy-firestore-id',
        title: 'Legacy Event',
        date: '2026-12-25',
        place: 'Old Place',
        bezirk: 'Bregenz',
        category: 'Sonstiges',
        status: 'approved',
        contribution: 'free',
        imageUrl: null,
      },
    ];
    writeJson(path.join(exportPath, 'events.json'), legacyOnly);
    const { prerender } = await importPrerender();
    await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    const html = fs.readFileSync(
      path.join(distPath, 'event', 'legacy-firestore-id', 'index.html'),
      'utf8'
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://www.thetribe.at/event/legacy-firestore-id" />'
    );
  });

  it('skips events with neither slug nor id and reports them in the manifest', async () => {
    const invalid = [
      {
        title: 'No slug, no id',
        date: '2026-12-25',
        place: 'X',
        bezirk: 'X',
        category: 'Sonstiges',
        status: 'approved',
        contribution: 'free',
        imageUrl: null,
      },
    ];
    writeJson(path.join(exportPath, 'events.json'), invalid);
    const { prerender } = await importPrerender();
    const result = await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    expect(result.manifest.eventCount).toBe(1);
    expect(result.manifest.prerenderedPages).toBe(2);
    expect(result.skippedEvents).toHaveLength(1);
    expect(result.skippedEvents[0].reason).toMatch(/no slug/);
  });

  it('de-duplicates events that share the same slug and keeps the first one', async () => {
    const dupes = [
      { ...sampleEvents[0], id: 'id-a' },
      { ...sampleEvents[0], id: 'id-b' },
    ];
    writeJson(path.join(exportPath, 'events.json'), dupes);
    const { prerender } = await importPrerender();
    const result = await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    expect(result.manifest.eventCount).toBe(2);
    expect(result.skippedEvents).toHaveLength(1);
    expect(result.skippedEvents[0].reason).toMatch(/duplicate path/);
  });

  it('refuses to run without a dist folder (build-before-prerender invariant)', async () => {
    fs.rmSync(distPath, { recursive: true, force: true });
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    await expect(
      prerender({
        rootDir: tmpRoot,
        distPath,
        exportPath,
        skipFirestore: true,
        skipRest: true,
        skipAdmin: true,
      })
    ).rejects.toThrow(/dist folder not found/);
  });

  it('fails soft (no prerendered event pages) when no data is available and Firestore is skipped', async () => {
    const { prerender } = await importPrerender();
    const result = await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });
    expect(result.manifest.eventCount).toBe(0);
    expect(result.writtenFiles.filter((f) => f.path.startsWith('/event/'))).toHaveLength(0);
    expect(fs.existsSync(path.join(distPath, 'sitemap.xml'))).toBe(true);
    expect(fs.existsSync(path.join(distPath, 'prerender-manifest.json'))).toBe(true);
  });

  it('renders a loading spinner in dist/index.html when no upcoming events exist (BqooC4xW)', async () => {
    const pastEvents = sampleEvents.map((e) => ({ ...e, date: '2020-01-01' }));
    writeJson(path.join(exportPath, 'events.json'), pastEvents);
    const { prerender } = await importPrerender();
    await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });
    const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
    expect(indexHtml).toContain('class="prerender-loading"');
    expect(indexHtml).not.toContain('Keine bevorstehenden');
  });

  it('embeds the theme snapshot in the generated event HTML', async () => {
    writeJson(path.join(exportPath, 'events.json'), [sampleEvents[0]]);
    writeJson(path.join(exportPath, 'theme.json'), {
      id: 'theme',
      '--accent-primary': { stringValue: '#abcdef' },
    });
    const { prerender } = await importPrerender();
    await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });

    const html = fs.readFileSync(
      path.join(distPath, 'event', sampleEvents[0].slug, 'index.html'),
      'utf8'
    );
    expect(html).toContain('--accent-primary: #abcdef;');
    expect(html).not.toContain('--accent-lavender');
  });

  it('still works with an empty snapshot when both live sources fail (BKtuzVC2)', async () => {
    writeJson(path.join(exportPath, 'events.json'), []);
    const { prerender } = await importPrerender();
    const result = await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      firebaseConfig: { projectId: 'no-such-project', apiKey: 'invalid' },
    });
    expect(result.manifest.eventCount).toBe(0);
    expect(result.manifest.prerenderedPages).toBe(2);
    expect(fs.existsSync(path.join(distPath, 'sitemap.xml'))).toBe(true);
  });

  it('keeps using the committed snapshot when the live REST read fails (BKtuzVC2)', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    const result = await prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      firebaseConfig: { projectId: 'no-such-project', apiKey: 'invalid' },
    });
    expect(result.manifest.eventCount).toBe(3);
    const html = fs.readFileSync(
      path.join(distPath, 'event', sampleEvents[0].slug, 'index.html'),
      'utf8'
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://storage.googleapis.com/bucket/yoga.jpg" />'
    );
  });
});

describe('loadEventsFromFirestoreAdmin (UIWI8kWx)', () => {
  let savedEnv: { json?: string; path?: string };

  beforeEach(() => {
    savedEnv = {
      json: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      path: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    };
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  afterEach(() => {
    if (savedEnv.json !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = savedEnv.json;
    else delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (savedEnv.path !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = savedEnv.path;
    else delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  it('returns an error and no events when no credentials are available anywhere', async () => {
    const { loadEventsFromFirestoreAdmin } = await importPrerender();
    const result = await loadEventsFromFirestoreAdmin({
      projectId: 'spirieventsvbg',
      fallbackPath: '',
    });
    expect(result.events).toEqual([]);
    expect(result.source).toBeNull();
    expect(result.error).toMatch(/No service account credentials available/);
  });

  it('returns an error when FIREBASE_SERVICE_ACCOUNT_JSON is set but not valid JSON', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = 'not json at all';
    const { loadEventsFromFirestoreAdmin } = await importPrerender();
    const result = await loadEventsFromFirestoreAdmin({
      projectId: 'spirieventsvbg',
      fallbackPath: '',
    });
    expect(result.events).toEqual([]);
    expect(result.source).toBeNull();
    expect(result.error).toMatch(/Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON/);
  });

  it('returns an error when GOOGLE_APPLICATION_CREDENTIALS points to a missing file', async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/definitely-does-not-exist.json';
    const { loadEventsFromFirestoreAdmin } = await importPrerender();
    const result = await loadEventsFromFirestoreAdmin({
      projectId: 'spirieventsvbg',
      fallbackPath: '',
    });
    expect(result.events).toEqual([]);
    expect(result.source).toBeNull();
    expect(result.error).toMatch(/Failed to read GOOGLE_APPLICATION_CREDENTIALS/);
  });
});

describe('resolveServiceAccountCredential (UIWI8kWx)', () => {
  let savedEnv: { json?: string; path?: string };

  beforeEach(() => {
    savedEnv = {
      json: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      path: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    };
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  afterEach(() => {
    if (savedEnv.json !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = savedEnv.json;
    else delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (savedEnv.path !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = savedEnv.path;
    else delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  it('prefers FIREBASE_SERVICE_ACCOUNT_JSON over GOOGLE_APPLICATION_CREDENTIALS', async () => {
    const inlineJson = JSON.stringify({ type: 'service_account', project_id: 'inline' });
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = inlineJson;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/definitely-does-not-exist.json';
    const { resolveServiceAccountCredential } = await importPrerender();
    const result = resolveServiceAccountCredential({ fallbackPath: '' });
    expect(result.source).toBe('FIREBASE_SERVICE_ACCOUNT_JSON env var');
    expect(result.credential).toEqual({ type: 'service_account', project_id: 'inline' });
  });

  it('reads from GOOGLE_APPLICATION_CREDENTIALS when no inline JSON is set', async () => {
    const tmpFile = path.join(os.tmpdir(), `sa-cred-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ type: 'service_account', project_id: 'from-file' }));
    try {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpFile;
      const { resolveServiceAccountCredential } = await importPrerender();
      const result = resolveServiceAccountCredential({ fallbackPath: '' });
      expect(result.source).toBe(tmpFile);
      expect(result.credential).toEqual({ type: 'service_account', project_id: 'from-file' });
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('falls back to scripts/service-account.json when nothing is configured', async () => {
    const { resolveServiceAccountCredential } = await importPrerender();
    const result = resolveServiceAccountCredential();
    if (fs.existsSync('scripts/service-account.json')) {
      expect(result.source).toBe('scripts/service-account.json');
      expect(result.credential).toBeDefined();
    } else {
      expect(result.credential).toBeNull();
      expect(result.error).toMatch(/No service account credentials available/);
    }
  });
});

describe('prerender() with skipAdmin (UIWI8kWx)', () => {
  let tmpRoot: string;
  let distPath: string;
  let exportPath: string;
  let savedEnv: { json?: string; path?: string };

  beforeEach(async () => {
    tmpRoot = await makeFixtureDir('prerender-admin-');
    distPath = path.join(tmpRoot, 'dist');
    exportPath = path.join(tmpRoot, 'data-export', 'firestore-export');
    fs.mkdirSync(exportPath, { recursive: true });
    await setupFakeDist(distPath);

    savedEnv = {
      json: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      path: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    };
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  afterEach(() => {
    if (savedEnv.json !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = savedEnv.json;
    else delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (savedEnv.path !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = savedEnv.path;
    else delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('does not log an Admin SDK warning when skipAdmin is true', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      const { prerender } = await importPrerender();
      const result = await prerender({
        rootDir: tmpRoot,
        distPath,
        exportPath,
        skipFirestore: true,
        skipRest: true,
        skipAdmin: true,
      });
      expect(result.manifest.eventCount).toBe(3);
      expect(warnings.some((w) => w.includes('Admin SDK'))).toBe(false);
    } finally {
      console.warn = origWarn;
    }
  });
});
