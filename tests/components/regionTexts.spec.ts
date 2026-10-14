import { describe, expect, it } from 'vitest';
import { STATIC_REGIONS, getRegionBySlug, mergeRegions } from '../../src/utils/regions';
import {
  LEGACY_CALENDAR_DESCRIPTION,
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
        'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz, Grenznahe',
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
    expect(t.calendarTitle).toBe('Spirituelle Events Steiermark – The Tribe');
    expect(t.calendarTitleExact).toBe(true);
    expect(t.headerTitle).toBe('Dein Kalender in der Steiermark');
    expect(t.locationPhrase).toBe('in der Steiermark');
    expect(t.nearbyText).toBe('Events in der Steiermark und Umgebung');
    expect(t.calendarDescription).toBe(
      'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in der Steiermark.'
    );
    expect(t.directoryTitle).toBe('Verzeichnis – Angebote in der Steiermark');
  });

  it('Allgäu uses "im Allgäu"', () => {
    expect(regionTexts(reg('allgaeu'), { activeCount: 1 }).headerTitle).toBe(
      'Dein Kalender im Allgäu'
    );
  });

  it('Vorarlberg also switches to region texts once two regions are active', () => {
    const t = regionTexts(reg('vorarlberg'), { activeCount: 2 });
    expect(t.calendarTitle).toBe('Spirituelle Events Vorarlberg – The Tribe');
    expect(t.headerTitle).toBe('Dein Kalender in Vorarlberg');
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
    expect(t.calendarTitle).toBe('Spirituelle Events Tirol – The Tribe');
    expect(t.locationPhrase).toBe('in Tirol');
    expect(t.calendarDescription).toMatch(/und mehr in Tirol\.$/);
  });

  it('combined view (Österreich) with two active regions', () => {
    const t = regionTexts(reg('vorarlberg'), { activeCount: 2, national: true });
    expect(t.calendarTitle).toBe('Spirituelle Events Österreich – The Tribe');
    expect(t.headerTitle).toBe('Dein Kalender für Österreich');
  });

  it('region texts of another region never mention Vorarlberg', () => {
    const t = regionTexts(reg('steiermark'), { activeCount: 2 });
    expect(JSON.stringify(t)).not.toMatch(/Vorarlberg/);
    expect(STATIC_REGIONS.length).toBe(10);
  });
});
