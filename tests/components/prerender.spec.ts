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
        'https://events.thetribe.at/uploads/foo.jpg'
      );
    });

    it('falls back to the category image when imageUrl is null', async () => {
      const { getEventOgImage } = await importPrerender();
      expect(getEventOgImage({ imageUrl: null, category: 'Yoga' })).toBe(
        'https://events.thetribe.at/event-fallbacks/yoga.jpg'
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
  });
});

describe('static index.html (production safety net)', () => {
  it('ships baked-in OG + Twitter meta tags so the homepage preview works even if prerender fails', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:site_name" content="tribe Vorarlberg" />');
    expect(html).toContain('<meta property="og:url" content="https://events.thetribe.at/" />');
    expect(html).toContain(
      '<meta property="og:image" content="https://events.thetribe.at/og-default.jpg" />'
    );
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain(
      '<meta name="twitter:image" content="https://events.thetribe.at/og-default.jpg" />'
    );
    expect(html).toContain('<link rel="canonical" href="https://events.thetribe.at/" />');
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
    });

    const event = sampleEvents[0];
    const html = fs.readFileSync(path.join(distPath, 'event', event.slug, 'index.html'), 'utf8');
    expect(html).toContain(
      `<meta property="og:url" content="https://events.thetribe.at/event/${event.slug}" />`
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
    await prerender({ rootDir: tmpRoot, distPath, exportPath, skipFirestore: true });

    const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
    expect(indexHtml).toContain('<meta property="og:type" content="website" />');
    expect(indexHtml).toContain(
      '<meta property="og:image" content="https://events.thetribe.at/og-default.jpg" />'
    );
    expect(indexHtml).not.toContain('old placeholder');
  });

  it('references the main index-* entry chunk, never a lazy chunk (MCwrJJ5Y)', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    await prerender({ rootDir: tmpRoot, distPath, exportPath, skipFirestore: true });

    const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
    expect(indexHtml).toContain('/assets/index-AbCdEfGh.js');
    expect(indexHtml).toContain('/assets/index-AbCdEfGh.css');
    expect(indexHtml).not.toContain('RichTextEditor-');
  });

  it('emits a sitemap.xml with /event/<slug> URLs (not /event/<id>)', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    await prerender({ rootDir: tmpRoot, distPath, exportPath, skipFirestore: true });

    const sitemap = fs.readFileSync(path.join(distPath, 'sitemap.xml'), 'utf8');
    for (const event of sampleEvents) {
      if (!event.slug) continue;
      expect(sitemap).toContain(`https://events.thetribe.at/event/${event.slug}`);
      expect(sitemap).not.toContain(`https://events.thetribe.at/event/${event.id}`);
    }
  });

  it('writes a prerender-manifest.json listing every prerendered page', async () => {
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    await prerender({ rootDir: tmpRoot, distPath, exportPath, skipFirestore: true });

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
    await prerender({ rootDir: tmpRoot, distPath, exportPath, skipFirestore: true });

    const html = fs.readFileSync(
      path.join(distPath, 'event', 'legacy-firestore-id', 'index.html'),
      'utf8'
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://events.thetribe.at/event/legacy-firestore-id" />'
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
    const result = await prerender({ rootDir: tmpRoot, distPath, exportPath, skipFirestore: true });

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
    const result = await prerender({ rootDir: tmpRoot, distPath, exportPath, skipFirestore: true });

    expect(result.manifest.eventCount).toBe(2);
    expect(result.skippedEvents).toHaveLength(1);
    expect(result.skippedEvents[0].reason).toMatch(/duplicate path/);
  });

  it('refuses to run without a dist folder (build-before-prerender invariant)', async () => {
    fs.rmSync(distPath, { recursive: true, force: true });
    writeJson(path.join(exportPath, 'events.json'), sampleEvents);
    const { prerender } = await importPrerender();
    await expect(
      prerender({ rootDir: tmpRoot, distPath, exportPath, skipFirestore: true })
    ).rejects.toThrow(/dist folder not found/);
  });

  it('fails soft (no prerendered event pages) when no data is available and Firestore is skipped', async () => {
    const { prerender } = await importPrerender();
    const result = await prerender({ rootDir: tmpRoot, distPath, exportPath, skipFirestore: true });
    expect(result.manifest.eventCount).toBe(0);
    expect(result.writtenFiles.filter((f) => f.path.startsWith('/event/'))).toHaveLength(0);
    expect(fs.existsSync(path.join(distPath, 'sitemap.xml'))).toBe(true);
    expect(fs.existsSync(path.join(distPath, 'prerender-manifest.json'))).toBe(true);
  });
});
