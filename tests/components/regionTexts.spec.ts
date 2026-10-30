import { describe, expect, it } from 'vitest';
import { STATIC_REGIONS, getRegionBySlug, mergeRegions } from '../../src/utils/regions';
import {
  LEGACY_CALENDAR_DESCRIPTION,
  combinedViewTexts,
  LEGACY_DEFAULT_DESCRIPTION,
  isRegionSpecific,
  regionTexts,
} from '../../src/utils/regionTexts';
import { BRAND_NAME } from '../../src/config/brand';
import { DEFAULT_DESCRIPTION, SITE_NAME } from '../../src/utils/seo';

const reg = (id: string) => getRegionBySlug(id)!;

describe('regionTexts: one active region (dark launch)', () => {
  it("Vorarlberg with one active region is exactly today's text", () => {
    const t = regionTexts(reg('vorarlberg'), { activeCount: 1 });
    expect(t).toEqual({
      regionSpecific: false,
      siteName: 'tribe Vorarlberg',
      headerTitle: 'Dein Vorarlberger Kalender',
      locationPhrase: 'in Vorarlberg',
      nearbyText: 'Für Vorarlberg und Umkreis',
      calendarTitle: 'Kalender',
      calendarTitleExact: false,
      calendarDescription:
        'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz, Umgebung',
      defaultDescription:
        'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz',
      directoryTitle: 'Verzeichnis – Angebote in Vorarlberg',
      directoryDescription:
        'Finde Menschen mit bewussten Angeboten in Vorarlberg: nach Kategorie, Region oder Name durchsuchbar.',
    });
  });

  it('keeps the seo.js constants in sync with the legacy texts', () => {
    expect(SITE_NAME).toBe(regionTexts(reg('vorarlberg')).siteName);
    expect(DEFAULT_DESCRIPTION).toBe(LEGACY_DEFAULT_DESCRIPTION);
    expect(LEGACY_CALENDAR_DESCRIPTION.startsWith(LEGACY_DEFAULT_DESCRIPTION)).toBe(true);
  });

  it('ignores a seo override while only Vorarlberg is active', () => {
    const v = { ...reg('vorarlberg'), seo: { title: 'X', description: 'Y' } };
    expect(regionTexts(v, { activeCount: 1 })).toEqual(regionTexts(reg('vorarlberg')));
  });

  it("no region (nothing loaded) falls back to today's texts", () => {
    expect(regionTexts(null)).toEqual(regionTexts(reg('vorarlberg')));
  });

  it('the combined view is unchanged with one active region', () => {
    expect(regionTexts(reg('vorarlberg'), { activeCount: 1, national: true }).regionSpecific).toBe(
      false
    );
  });
});

describe('regionTexts: region-specific mode', () => {
  it('rule: other region or more than one active region', () => {
    expect(isRegionSpecific(reg('vorarlberg'), { activeCount: 1 })).toBe(false);
    expect(isRegionSpecific(reg('vorarlberg'), { activeCount: 2 })).toBe(true);
    expect(isRegionSpecific(reg('steiermark'), { activeCount: 1 })).toBe(true);
    expect(isRegionSpecific(null, { activeCount: 2 })).toBe(true);
  });

  it('Steiermark: title, header, hero and directory use the region, brand stays The Tribe', () => {
    const t = regionTexts(reg('steiermark'), { activeCount: 2 });
    expect(t.regionSpecific).toBe(true);
    expect(t.siteName).toBe(BRAND_NAME);
    expect(t.calendarTitle).toBe('Kalender | The Tribe Steiermark');
    expect(t.calendarTitleExact).toBe(true);
    expect(t.headerTitle).toBe('Dein steirischer Kalender');
    expect(t.locationPhrase).toBe('in der Steiermark');
    expect(t.nearbyText).toBe('Für die Steiermark und Umkreis');
    expect(t.calendarDescription).toBe(
      'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in der Steiermark.'
    );
    expect(t.directoryTitle).toBe('Verzeichnis – Angebote in der Steiermark');
  });

  it('Innerschweiz uses "in der Innerschweiz", Liechtenstein "in Liechtenstein"', () => {
    const t = regionTexts(reg('innerschweiz'), { activeCount: 1 });
    expect(t.headerTitle).toBe('Dein Innerschweizer Kalender');
    expect(t.nearbyText).toBe('Für die Innerschweiz und Umkreis');
    expect(regionTexts(reg('liechtenstein'), { activeCount: 1 }).locationPhrase).toBe(
      'in Liechtenstein'
    );
  });

  it('Vorarlberg also switches to region texts once two regions are active', () => {
    const t = regionTexts(reg('vorarlberg'), { activeCount: 2 });
    expect(t.calendarTitle).toBe('Kalender | The Tribe Vorarlberg');
    expect(t.headerTitle).toBe('Dein Vorarlberger Kalender');
    expect(t.nearbyText).toBe('Für Vorarlberg und Umkreis');
    expect(t.siteName).toBe('The Tribe');
  });

  it('the config seo.title/description win over generated texts', () => {
    const merged = mergeRegions([
      {
        id: 'steiermark',
        active: true,
        seo: { title: 'Events Steiermark | The Tribe', description: 'Eigene Beschreibung' },
      },
    ]);
    const t = regionTexts(getRegionBySlug('steiermark', merged), { activeCount: 2 });
    expect(t.calendarTitle).toBe('Events Steiermark | The Tribe');
    expect(t.calendarDescription).toBe('Eigene Beschreibung');
    expect(t.defaultDescription).toBe('Eigene Beschreibung');
  });

  it('blank seo fields and missing inPhrase fall back to generated texts', () => {
    const t = regionTexts(
      { id: 'tirol', slug: 'tirol', name: 'Tirol', seo: { title: '  ', description: '' } },
      { activeCount: 2 }
    );
    expect(t.calendarTitle).toBe('Kalender | The Tribe Tirol');
    expect(t.locationPhrase).toBe('in Tirol');
    expect(t.calendarDescription).toMatch(/und mehr in Tirol\.$/);
  });

  it('combined view (Österreich) with two active regions', () => {
    const t = regionTexts(reg('vorarlberg'), { activeCount: 2, national: true });
    expect(t.calendarTitle).toBe('Kalender | The Tribe Österreich');
    expect(t.headerTitle).toBe('Dein österreichischer Kalender');
    expect(t.nearbyText).toBe('Für Österreich und Umkreis');
  });

  it('combined views: Switzerland and Alle Tribes (ticket 33); no Deutschland view any more', () => {
    expect(combinedViewTexts('deutschland')).toEqual(combinedViewTexts('oesterreich'));

    const ch = regionTexts(reg('vorarlberg'), {
      activeCount: 3,
      national: true,
      view: { slug: 'schweiz' },
    });
    expect(ch.headerTitle).toBe('Dein Schweizer Kalender');
    expect(ch.calendarTitle).toBe('Kalender | The Tribe Schweiz');
    expect(ch.nearbyText).toBe('Für die Schweiz und Umkreis');
    expect(ch.locationPhrase).toBe('in der Schweiz');

    const all = regionTexts(reg('vorarlberg'), {
      activeCount: 3,
      national: true,
      view: 'alle-tribes',
    });
    expect(all.headerTitle).toBe('Dein Kalender');
    expect(all.calendarTitle).toBe('Kalender | The Tribe');
    expect(all.nearbyText).toBe('Für alle Regionen');
    expect(all.locationPhrase).toBe('in allen Regionen');
    expect(all.calendarDescription).toBe(
      'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in allen Regionen.'
    );
    for (const t of [ch, all]) expect(JSON.stringify(t)).not.toMatch(/Vorarlberg/);
    // The Austrian view is unchanged and the default when no view is named.
    expect(
      regionTexts(reg('vorarlberg'), { activeCount: 2, national: true, view: 'oesterreich' })
    ).toEqual(regionTexts(reg('vorarlberg'), { activeCount: 2, national: true }));
  });

  it('region texts of another region never mention Vorarlberg', () => {
    const t = regionTexts(reg('steiermark'), { activeCount: 2 });
    expect(JSON.stringify(t)).not.toMatch(/Vorarlberg/);
    expect(STATIC_REGIONS.length).toBe(29);
  });
});

describe('regionTexts: wording per region (two regions active)', () => {
  const table: Array<[string, string, string, string, string]> = [
    [
      'vorarlberg',
      'Dein Vorarlberger Kalender',
      'in Vorarlberg',
      'Für Vorarlberg und Umkreis',
      'Kalender | The Tribe Vorarlberg',
    ],
    [
      'tirol',
      'Dein Tiroler Kalender',
      'in Tirol',
      'Für Tirol und Umkreis',
      'Kalender | The Tribe Tirol',
    ],
    [
      'salzburg',
      'Dein Salzburger Kalender',
      'in Salzburg',
      'Für Salzburg und Umkreis',
      'Kalender | The Tribe Salzburg',
    ],
    [
      'kaernten',
      'Dein Kärntner Kalender',
      'in Kärnten',
      'Für Kärnten und Umkreis',
      'Kalender | The Tribe Kärnten',
    ],
    [
      'steiermark',
      'Dein steirischer Kalender',
      'in der Steiermark',
      'Für die Steiermark und Umkreis',
      'Kalender | The Tribe Steiermark',
    ],
    [
      'oberoesterreich',
      'Dein oberösterreichischer Kalender',
      'in Oberösterreich',
      'Für Oberösterreich und Umkreis',
      'Kalender | The Tribe Oberösterreich',
    ],
    [
      'niederoesterreich',
      'Dein niederösterreichischer Kalender',
      'in Niederösterreich',
      'Für Niederösterreich und Umkreis',
      'Kalender | The Tribe Niederösterreich',
    ],
    [
      'wien',
      'Dein Wiener Kalender',
      'in Wien',
      'Für Wien und Umkreis',
      'Kalender | The Tribe Wien',
    ],
    [
      'burgenland',
      'Dein burgenländischer Kalender',
      'im Burgenland',
      'Für das Burgenland und Umkreis',
      'Kalender | The Tribe Burgenland',
    ],
    [
      'innerschweiz',
      'Dein Innerschweizer Kalender',
      'in der Innerschweiz',
      'Für die Innerschweiz und Umkreis',
      'Kalender | The Tribe Innerschweiz',
    ],
    [
      'appenzell',
      'Dein Appenzeller Kalender',
      'im Appenzellerland',
      'Für das Appenzellerland und Umkreis',
      'Kalender | The Tribe Appenzell',
    ],
    [
      'liechtenstein',
      'Dein Liechtensteiner Kalender',
      'in Liechtenstein',
      'Für Liechtenstein und Umkreis',
      'Kalender | The Tribe Liechtenstein',
    ],
  ];
  it.each(table)('%s', (id, header, loc, feature, title) => {
    const t = regionTexts(reg(id), { activeCount: 2 });
    expect(t.headerTitle).toBe(header);
    expect(t.locationPhrase).toBe(loc);
    expect(t.nearbyText).toBe(feature);
    expect(t.calendarTitle).toBe(title);
  });

  it('spot-checked regions are part of the register', () => {
    const ids = STATIC_REGIONS.map((r) => r.id);
    for (const [id] of table) expect(ids).toContain(id);
  });

  it('every other region gets generated wording with its own name', () => {
    for (const r of STATIC_REGIONS) {
      const t = regionTexts(reg(r.id), { activeCount: 2 });
      expect(t.headerTitle).toBe(`Dein ${r.demonym} Kalender`);
      expect(t.locationPhrase).toBe(r.inPhrase);
      expect(t.calendarTitle).toBe(`Kalender | The Tribe ${r.name}`);
      expect(JSON.stringify(t)).not.toMatch(r.id === 'vorarlberg' ? /^$/ : /Vorarlberg/);
    }
  });
});
