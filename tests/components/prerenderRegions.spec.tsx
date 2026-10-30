// Ticket 22: SEO / prerender per region. Companion of prerender.spec.ts (which
// pins the Vorarlberg-only behaviour of the individual generators).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/components/SeoMeta', () => ({
  default: (props: { noindex?: boolean; path?: string }) => (
    <div data-testid="seo" data-noindex={String(Boolean(props.noindex))} data-path={props.path} />
  ),
}));
vi.mock('../../src/hooks/useRegion', () => ({
  useRegion: () => ({ regions: [{ id: 'vorarlberg', name: 'Vorarlberg', slug: 'vorarlberg' }] }),
}));

import RegionComingSoonPage from '../../src/pages/RegionComingSoonPage';

type PrerenderModule = typeof import('../../scripts/prerender.mjs');
const importPrerender = (): Promise<PrerenderModule> => import('../../scripts/prerender.mjs');

const TIROL_ACTIVE = [{ id: 'tirol', active: true }];

const events = [
  {
    id: 'v1',
    title: 'Yoga Dornbirn',
    slug: 'yoga-dornbirn',
    date: '2999-12-15',
    bezirk: 'Dornbirn',
    category: 'Yoga',
    status: 'approved',
    contribution: 'free',
  },
  {
    id: 't1',
    title: 'Meditation Kufstein',
    slug: 'meditation-kufstein',
    date: '2999-12-16',
    bezirk: 'Kufstein',
    category: 'Meditation',
    status: 'approved',
    regionId: 'tirol',
  },
  {
    id: 't2',
    title: 'Tiroler Entwurf',
    slug: 'tiroler-entwurf',
    date: '2999-12-17',
    status: 'pending',
    regionId: 'tirol',
  },
];

describe('coming-soon page is noindex', () => {
  it('an inactive region is rendered with noindex', () => {
    render(
      <MemoryRouter>
        <RegionComingSoonPage
          region={{ id: 'tirol', slug: 'tirol', name: 'Tirol', inPhrase: 'in Tirol' }}
        />
      </MemoryRouter>
    );
    const seo = screen.getByTestId('seo');
    expect(seo.dataset.noindex).toBe('true');
    expect(seo.dataset.path).toBe('/tirol');
  });
});

describe('SeoMeta emits noindex, nofollow for noindex pages', () => {
  it('maps the noindex flag to the robots meta', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/SeoMeta.jsx'),
      'utf8'
    );
    expect(src).toContain("noindex ? 'noindex, nofollow' : 'index, follow'");
  });
});

describe('getRegionPagePlan / generateSitemap', () => {
  it('is empty with only Vorarlberg active (register or merged)', async () => {
    const { getRegionPagePlan } = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    expect(getRegionPagePlan(null)).toEqual([]);
    expect(getRegionPagePlan(mergeRegions([]))).toEqual([]);
    expect(getRegionPagePlan(mergeRegions([{ id: 'tirol', active: false }]))).toEqual([]);
  });

  it('plans calendar + directory for every active region with two or more active', async () => {
    const { getRegionPagePlan } = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    const plan = getRegionPagePlan(mergeRegions(TIROL_ACTIVE));
    // Register order (CSV): Tirol before Vorarlberg.
    expect(plan.map((p: { path: string }) => p.path)).toEqual([
      '/tirol',
      '/tirol/verzeichnis',
      '/vorarlberg',
      '/vorarlberg/verzeichnis',
    ]);
  });

  it('sitemap is unchanged while only Vorarlberg is active', async () => {
    const { generateSitemap } = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    const base = generateSitemap(events);
    expect(generateSitemap(events, mergeRegions([]))).toBe(base);
    expect(generateSitemap(events, mergeRegions([{ id: 'tirol', active: false }]))).toBe(base);
    expect(base).not.toContain('/tirol<');
  });

  it('sitemap lists active non-default regions only, never inactive ones or /vorarlberg', async () => {
    const { generateSitemap, BASE_URL } = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    const xml = generateSitemap(
      events,
      mergeRegions([...TIROL_ACTIVE, { id: 'wien', active: false }])
    );
    expect(xml).toContain(`<loc>${BASE_URL}/tirol</loc>`);
    expect(xml).toContain(`<loc>${BASE_URL}/tirol/verzeichnis</loc>`);
    expect(xml).not.toContain('/wien');
    expect(xml).not.toContain('/vorarlberg');
    expect(xml).toContain(`<loc>${BASE_URL}/</loc>`);
  });
});

describe('Vorarlberg output is byte-identical (golden hashes of the pre-ticket generators)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  const fx = [
    {
      id: 'a',
      title: 'Yoga <b>',
      slug: 'yoga-1',
      date: '2026-12-15',
      bezirk: 'Dornbirn',
      category: 'Yoga',
      contribution: 'free',
    },
    { id: 'b', title: 'Tanz', date: '2026-12-20', category: 'Tanz', fee: '20' },
  ];

  it('calendar page, sitemap and event pages match the golden hashes', async () => {
    const m = await importPrerender();
    expect(sha(m.generateCalendarPageHtml(fx, '/assets/index-A.js', '/assets/index-A.css'))).toBe(
      '3b567cb133a297d42db94c11b3b2d9dba50f0252be1b32d8e1e10cbb751af6a2'
    );
    expect(sha(m.generateSitemap(fx))).toBe(
      '614309ed74d4e6182b9f17dbb3ca51c239b52977f9f9e0ae7519b4361f793b7a'
    );
    expect(
      sha(m.generateEventHtml(fx[0], undefined, '/assets/index-A.js', '/assets/index-A.css'))
    ).toBe('821e8baab7fe6cf7184099a7b7588f5d8b194b42d226ee141ff20582d36357f6');
    expect(sha(m.generateEventHtml(fx[1]))).toBe(
      '04a54c17f379b3a01432ba7d92e381e49736d67acfbf19a872de784a796c3b07'
    );
  });

  it('the calendar page tells the app about two or more active regions, never with one', async () => {
    const m = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    const plain = m.generateCalendarPageHtml(fx, '/assets/index-A.js', '/assets/index-A.css');
    expect(
      m.generateCalendarPageHtml(
        fx,
        '/assets/index-A.js',
        '/assets/index-A.css',
        undefined,
        mergeRegions([])
      )
    ).toBe(plain);
    expect(plain).not.toContain('tribe-region-mode');
    const multi = m.generateCalendarPageHtml(
      fx,
      '/assets/index-A.js',
      '/assets/index-A.css',
      undefined,
      mergeRegions([{ id: 'tirol', active: true }])
    );
    expect(multi).toContain('<meta name="tribe-region-mode" content="multi" />');
  });

  it('passing the single-region register changes nothing for events', async () => {
    const m = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    expect(m.generateEventHtml(fx[0], undefined, null, null, mergeRegions([]))).toBe(
      m.generateEventHtml(fx[0])
    );
  });
});

describe('generateRegionPageHtml', () => {
  it('calendar page: title, description, canonical, og tags, JSON-LD', async () => {
    const { generateRegionPageHtml, BASE_URL, DEFAULT_OG_IMAGE_URL } = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    const tirol = mergeRegions(TIROL_ACTIVE).find((r: { id: string }) => r.id === 'tirol');
    const html = generateRegionPageHtml(
      tirol,
      'calendar',
      events,
      '/assets/index-A.js',
      '/assets/index-A.css'
    );
    expect(html).toContain('<title>Kalender | The Tribe Tirol</title>');
    expect(html).toContain(
      '<meta name="description" content="Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Tirol." />'
    );
    expect(html).toContain(`<link rel="canonical" href="${BASE_URL}/tirol" />`);
    expect(html).toContain('<meta name="robots" content="index, follow" />');
    expect(html).toContain('<meta property="og:title" content="Kalender | The Tribe Tirol" />');
    expect(html).toContain(`<meta property="og:url" content="${BASE_URL}/tirol" />`);
    expect(html).toContain(`<meta property="og:image" content="${DEFAULT_OG_IMAGE_URL}" />`);
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('<script type="module" src="/assets/index-A.js"></script>');
    // Only Tirol's approved event in the no-JS list: no Vorarlberg event, no pending draft.
    expect(html).toContain('Meditation Kufstein');
    expect(html).not.toContain('Yoga Dornbirn');
    expect(html).not.toContain('Tiroler Entwurf');
  });

  it('lists online events only where their organiser is listed (onlineRegionIds)', async () => {
    const { generateRegionPageHtml } = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    const tirol = mergeRegions(TIROL_ACTIVE).find((r: { id: string }) => r.id === 'tirol');
    const date = '2099-01-01';
    const online = (title: string, extra: Record<string, unknown>) => ({
      id: title,
      slug: title.toLowerCase().replace(/ /g, '-'),
      title,
      date,
      status: 'approved',
      isOnline: true,
      regionId: 'vorarlberg',
      ...extra,
    });
    const html = generateRegionPageHtml(
      tirol,
      'calendar',
      [
        online('Online Tirol', { onlineRegionIds: ['tirol'] }),
        online('Online Anderswo', { onlineRegionIds: ['vorarlberg'] }),
        online('Online Alt', {}),
      ],
      '/a.js',
      '/a.css',
      undefined,
      { activeRegionIds: ['vorarlberg', 'tirol'] }
    );
    expect(html).toContain('Online Tirol');
    expect(html).toContain('Online Alt');
    expect(html).not.toContain('Online Anderswo');
  });

  it('config seo.title / seo.description win', async () => {
    const { generateRegionPageHtml } = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    const tirol = mergeRegions([
      {
        id: 'tirol',
        active: true,
        seo: { title: 'Tiroler Kalender', description: 'Eigene Beschreibung' },
      },
    ]).find((r: { id: string }) => r.id === 'tirol');
    const html = generateRegionPageHtml(tirol, 'calendar', [], '/a.js', '/a.css');
    expect(html).toContain('<title>Tiroler Kalender</title>');
    expect(html).toContain('content="Eigene Beschreibung"');
  });

  it('directory page: own canonical, no JSON-LD', async () => {
    const { generateRegionPageHtml, BASE_URL } = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    const tirol = mergeRegions(TIROL_ACTIVE).find((r: { id: string }) => r.id === 'tirol');
    const html = generateRegionPageHtml(tirol, 'directory', events, '/a.js', '/a.css');
    expect(html).toContain('<title>Verzeichnis – Angebote in Tirol | The Tribe</title>');
    expect(html).toContain(`<link rel="canonical" href="${BASE_URL}/tirol/verzeichnis" />`);
    expect(html).not.toContain('application/ld+json');
  });
});

describe('event title suffix', () => {
  it('adds the region for non-Vorarlberg events only with more than one active region', async () => {
    const { generateEventHtml } = await importPrerender();
    const { mergeRegions } = await import('../../src/utils/regions.js');
    const two = mergeRegions(TIROL_ACTIVE);
    const one = mergeRegions([]);
    const [vbg, tirol] = events;
    expect(generateEventHtml(tirol, undefined, null, null, two)).toContain(
      '<title>Meditation Kufstein | The Tribe Tirol</title>'
    );
    expect(generateEventHtml(tirol, undefined, null, null, one)).toContain(
      '<title>Meditation Kufstein | tribe Vorarlberg</title>'
    );
    expect(generateEventHtml(vbg, undefined, null, null, two)).toContain(
      '<title>Yoga Dornbirn | tribe Vorarlberg</title>'
    );
    // canonical stays /event/<slug>
    expect(generateEventHtml(tirol, undefined, null, null, two)).toContain(
      'rel="canonical" href="https://www.thetribe.at/event/meditation-kufstein"'
    );
  });
});

describe('prerender() end-to-end with regions', () => {
  let tmpRoot: string;
  let distPath: string;
  let exportPath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prerender-regions-'));
    distPath = path.join(tmpRoot, 'dist');
    exportPath = path.join(tmpRoot, 'data-export', 'firestore-export');
    fs.mkdirSync(path.join(distPath, 'assets'), { recursive: true });
    fs.mkdirSync(exportPath, { recursive: true });
    fs.writeFileSync(path.join(distPath, 'assets', 'index-AbCd.js'), '//');
    fs.writeFileSync(path.join(distPath, 'assets', 'index-AbCd.css'), '/**/');
    fs.writeFileSync(path.join(exportPath, 'events.json'), JSON.stringify(events));
  });
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  const run = async () => {
    const { prerender } = await importPrerender();
    return prerender({
      rootDir: tmpRoot,
      distPath,
      exportPath,
      skipFirestore: true,
      skipRest: true,
      skipAdmin: true,
    });
  };

  it('no regions.json: Vorarlberg only, no region directories, sitemap without regions', async () => {
    await run();
    expect(fs.readdirSync(distPath).sort()).toEqual([
      'assets',
      'event',
      'index.html',
      'prerender-manifest.json',
      'sitemap.xml',
    ]);
    expect(fs.readFileSync(path.join(distPath, 'sitemap.xml'), 'utf8')).not.toContain('/tirol<');
  });

  it('regions.json with only Vorarlberg active (Tirol inactive): same as no regions', async () => {
    fs.writeFileSync(
      path.join(exportPath, 'regions.json'),
      JSON.stringify([
        { id: 'vorarlberg', active: true },
        { id: 'tirol', active: false },
      ])
    );
    await run();
    expect(fs.existsSync(path.join(distPath, 'tirol'))).toBe(false);
    expect(fs.existsSync(path.join(distPath, 'vorarlberg'))).toBe(false);
  });

  it('corrupt regions.json is tolerated (static register)', async () => {
    fs.writeFileSync(path.join(exportPath, 'regions.json'), '{not json');
    await run();
    expect(fs.existsSync(path.join(distPath, 'tirol'))).toBe(false);
  });

  it('two active regions: region pages, sitemap entries and event suffix; / only gets the hint', async () => {
    const before = await (async () => {
      await run();
      return fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
    })();
    fs.writeFileSync(
      path.join(exportPath, 'regions.json'),
      JSON.stringify([{ id: 'tirol', active: true, contactEmail: 'geheim@example.com' }])
    );
    await run();
    for (const p of [
      'tirol/index.html',
      'tirol/verzeichnis/index.html',
      'vorarlberg/index.html',
      'vorarlberg/verzeichnis/index.html',
    ]) {
      expect(fs.existsSync(path.join(distPath, p))).toBe(true);
    }
    const tirolHtml = fs.readFileSync(path.join(distPath, 'tirol', 'index.html'), 'utf8');
    expect(tirolHtml).toContain('<title>Kalender | The Tribe Tirol</title>');
    expect(tirolHtml).not.toContain('geheim@example.com');
    // `/` stays the Vorarlberg page; only the multi-region hint for the app is added.
    expect(
      fs
        .readFileSync(path.join(distPath, 'index.html'), 'utf8')
        .replace('\n  <meta name="tribe-region-mode" content="multi" />', '')
    ).toBe(before);
    expect(before).not.toContain('tribe-region-mode');
    const sitemap = fs.readFileSync(path.join(distPath, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('/tirol</loc>');
    expect(sitemap).toContain('/tirol/verzeichnis</loc>');
    expect(
      fs.readFileSync(path.join(distPath, 'event', 'meditation-kufstein', 'index.html'), 'utf8')
    ).toContain('| The Tribe Tirol</title>');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(distPath, 'prerender-manifest.json'), 'utf8')
    );
    expect(manifest.pages.map((p: { path: string }) => p.path)).toContain(
      '/tirol/verzeichnis/index.html'
    );
  });
});
