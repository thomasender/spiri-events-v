// Platform brand: one place, so a later rename is a one-line change.
// BRAND_NAME is what region-aware texts use ("Spirituelle Events Steiermark –
// Dein Tribe"). It is also the site name (og:site_name, JSON-LD) of the
// neutral default pages. LEGACY_SITE_NAME is the name of the association behind
// the platform; only Vorarlberg's own pages (Über uns, legal pages) use it.
export const BRAND_NAME = 'Dein Tribe';
export const LEGACY_SITE_NAME = 'tribe Vorarlberg';
// Neutral default description (meta/OG/Twitter, prerender, manifest, llms.txt):
// no region or town names (Trello nolfWvHb). Region pages use their own texts.
export const DEFAULT_SITE_DESCRIPTION =
  'Regionaler Kalender für bewusste Veranstaltungen: Workshops, Meditation, Yoga, Tanz, Singen und mehr in deiner Nähe.';
// Footer line, the same in every region and in Vorarlberg-only mode.
export const COPYRIGHT_NOTICE = '© 2026 Alle Rechte vorbehalten';
