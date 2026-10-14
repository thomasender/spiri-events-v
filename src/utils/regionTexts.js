// Region-aware texts (titles, header subtitle, descriptions). Pure and free of
// Firebase/React imports so it is easy to unit test.
//
// DARK-LAUNCH RULE (isRegionSpecific): region-specific text only takes effect
// when the visited region is NOT Vorarlberg, or when MORE THAN ONE region is
// active. With Vorarlberg as the only active region every text is exactly
// today's text (same bytes), so nothing changes for visitors or crawlers.
//
// Config wins: `region.seo.title` / `region.seo.description` (from
// `regions/{id}`) replace the generated texts, but only in region-specific
// mode. Fallbacks: missing config -> generated from `name`/`inPhrase`; no region
// at all -> today's texts.
import { BRAND_NAME, LEGACY_SITE_NAME } from '../config/brand';
import { ALL_REGIONS_NAME } from './regionRouting';
import { DEFAULT_REGION_ID } from './regions';

export const LEGACY_DEFAULT_DESCRIPTION =
  'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz';
export const LEGACY_CALENDAR_DESCRIPTION =
  'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz, Grenznahe';

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');

export function isRegionSpecific(region, { activeCount = 1, national = false } = {}) {
  if (activeCount > 1) return true;
  if (national || !region) return false;
  return region.id !== DEFAULT_REGION_ID;
}

function legacyTexts() {
  return {
    regionSpecific: false,
    siteName: LEGACY_SITE_NAME,
    headerTitle: 'Dein Vorarlberger Kalender',
    locationPhrase: 'in Vorarlberg',
    nearbyText: 'Für Vorarlberg und Umkreis',
    calendarTitle: 'Kalender',
    calendarTitleExact: false,
    calendarDescription: LEGACY_CALENDAR_DESCRIPTION,
    defaultDescription: LEGACY_DEFAULT_DESCRIPTION,
    directoryTitle: 'Verzeichnis – Angebote in Vorarlberg',
    directoryDescription:
      'Finde Menschen mit bewussten Angeboten in Vorarlberg: nach Kategorie, Region oder Name durchsuchbar.',
  };
}

/**
 * Texts for a region. `region` is a register entry ({id, name, inPhrase, seo}),
 * `activeCount` the number of active regions, `national` the combined view.
 */
export function regionTexts(region, { activeCount = 1, national = false } = {}) {
  if (!isRegionSpecific(region, { activeCount, national })) return legacyTexts();

  const combined = national || !region;
  const name = combined ? ALL_REGIONS_NAME : str(region.name);
  const locationPhrase = combined ? 'in Österreich' : str(region.inPhrase) || `in ${name}`;
  const label = combined ? 'Österreich' : name;
  const seo = !combined && region.seo ? region.seo : {};
  const seoTitle = str(seo.title);
  const seoDescription = str(seo.description);
  const generated = `Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr ${locationPhrase}.`;

  return {
    regionSpecific: true,
    siteName: BRAND_NAME,
    headerTitle: combined ? 'Dein Kalender für Österreich' : `Dein Kalender ${locationPhrase}`,
    locationPhrase,
    nearbyText: `Events ${locationPhrase} und Umgebung`,
    calendarTitle: seoTitle || `Spirituelle Events ${label} – ${BRAND_NAME}`,
    calendarTitleExact: true,
    calendarDescription: seoDescription || generated,
    defaultDescription: seoDescription || generated,
    directoryTitle: `Verzeichnis – Angebote ${locationPhrase}`,
    directoryDescription: `Finde Menschen mit bewussten Angeboten ${locationPhrase}: nach Kategorie, Region oder Name durchsuchbar.`,
  };
}
