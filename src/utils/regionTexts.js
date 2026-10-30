// Region-aware texts (titles, header subtitle, descriptions). Pure and free of
// Firebase/React imports so it is easy to unit test.
//
// DARK-LAUNCH RULE (isRegionSpecific): region-specific text only takes effect
// when the visited region is NOT Vorarlberg, or when MORE THAN ONE region is
// active. With Vorarlberg as the only active region every text is exactly
// today's text (same bytes), so nothing changes for visitors or crawlers.
//
// PATTERNS (region mode mirrors the Vorarlberg wording, region swapped in):
//   header        "Dein <demonym> Kalender"          (Vorarlberger / Tiroler / steirischer ...)
//   hero          "... weitere Veranstaltungen <inPhrase>."   (locationPhrase)
//   feature       "Für <forPhrase> und Umkreis"
//   page title    "Kalender | The Tribe <Region>"    (legacy: "Kalender | tribe Vorarlberg")
//   directory     "Verzeichnis – Angebote <inPhrase>"
// The brand in region mode is "The Tribe"; the legal entity "tribe Vorarlberg"
// (LEGACY_SITE_NAME) is never replaced. Combined views (COMBINED_VIEW_TEXTS):
// "österreichischer" / "Schweizer", "Für Österreich und Umkreis";
// "Alle Tribes" has no place or adjective ("Dein Kalender",
// "in allen Regionen", title "Kalender | The Tribe").
//
// Config wins: `region.seo.title` / `region.seo.description` (from
// `regions/{id}`) replace the generated texts, but only in region-specific
// mode. Fallbacks: missing config -> generated from `name`/`inPhrase`; no region
// at all -> today's texts.
// Explicit .js extensions: scripts/prerender.mjs imports this file in plain Node.
import { BRAND_NAME, LEGACY_SITE_NAME } from '../config/brand.js';
import { getCombinedView } from './regionRouting.js';
import { DEFAULT_REGION_ID } from './regions.js';

export const LEGACY_DEFAULT_DESCRIPTION =
  'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz';
export const LEGACY_CALENDAR_DESCRIPTION =
  'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz, Umgebung';

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');

export function isRegionSpecific(region, { activeCount = 1, national = false } = {}) {
  if (activeCount > 1) return true;
  if (national || !region) return false;
  return region.id !== DEFAULT_REGION_ID;
}

// Wording of the combined views (plus the coming-soon page texts; `liveHint` only for
// countries that are not live yet: what has to happen before they can go live). `label` ends up in the page title ("Kalender |
// The Tribe <label>"; empty = just the brand), `demonym` in the header (empty =
// "Dein Kalender"), `forPhrase` in "Für <forPhrase> und
// Umkreis" (empty = "Für alle Regionen").
const COMBINED_VIEW_TEXTS = {
  oesterreich: {
    label: 'Österreich',
    demonym: 'österreichischer',
    locationPhrase: 'in Österreich',
    forPhrase: 'Österreich',
    comingSoon: 'Bald findest du hier die Events aus allen Bundesländern auf einen Blick.',
    comingSoonSubject: 'für ganz Österreich',
  },
  schweiz: {
    label: 'Schweiz',
    demonym: 'Schweizer',
    locationPhrase: 'in der Schweiz',
    forPhrase: 'die Schweiz',
    comingSoon: 'Bald findest du hier die Events aus der ganzen Schweiz auf einen Blick.',
    comingSoonSubject: 'für die ganze Schweiz',
    liveHint:
      'Wir suchen gerade Events für die Bezirke in der Schweiz. Wir können erst mit der Schweiz live gehen, sobald mindestens ein Bezirk genügend Events hat.',
  },
  'alle-tribes': {
    label: '',
    demonym: '',
    locationPhrase: 'in allen Regionen',
    forPhrase: '',
    comingSoon: 'Bald findest du hier die Events aus allen Regionen auf einen Blick.',
    comingSoonSubject: 'für alle Regionen',
  },
};

/** Wording of one combined view (slug or view object); the Austrian one if unknown. */
export function combinedViewTexts(view) {
  const slug = typeof view === 'string' ? view : view?.slug;
  return COMBINED_VIEW_TEXTS[slug] ?? COMBINED_VIEW_TEXTS.oesterreich;
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
export function regionTexts(region, { activeCount = 1, national = false, view = null } = {}) {
  if (!isRegionSpecific(region, { activeCount, national })) return legacyTexts();

  const combined = national || !region;
  // `view`: the combined view (object or slug); without one the Austrian view.
  const viewSlug = (typeof view === 'string' ? view : view?.slug) ?? 'oesterreich';
  const viewTexts = COMBINED_VIEW_TEXTS[viewSlug] ?? COMBINED_VIEW_TEXTS.oesterreich;
  const name = combined ? (getCombinedView(viewSlug)?.name ?? '') : str(region.name);
  const locationPhrase = combined ? viewTexts.locationPhrase : str(region.inPhrase) || `in ${name}`;
  const label = combined ? viewTexts.label : name;
  const seo = !combined && region.seo ? region.seo : {};
  const seoTitle = str(seo.title);
  const seoDescription = str(seo.description);
  const generated = `Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr ${locationPhrase}.`;

  const demonym = combined ? viewTexts.demonym : str(region.demonym);
  const forPhrase = combined ? viewTexts.forPhrase : str(region.forPhrase) || name;

  return {
    regionSpecific: true,
    siteName: BRAND_NAME,
    headerTitle: demonym
      ? `Dein ${demonym} Kalender`
      : combined
        ? 'Dein Kalender'
        : `Dein Kalender ${locationPhrase}`,
    locationPhrase,
    nearbyText: forPhrase || !combined ? `Für ${forPhrase} und Umkreis` : 'Für alle Regionen',
    calendarTitle: seoTitle || `Kalender | ${[BRAND_NAME, label].filter(Boolean).join(' ')}`,
    calendarTitleExact: true,
    calendarDescription: seoDescription || generated,
    defaultDescription: seoDescription || generated,
    directoryTitle: `Verzeichnis – Angebote ${locationPhrase}`,
    directoryDescription: `Finde Menschen mit bewussten Angeboten ${locationPhrase}: nach Kategorie, Region oder Name durchsuchbar.`,
  };
}
