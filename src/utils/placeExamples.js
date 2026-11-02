// Placeholder of the "Wo bist du?" place search ("z. B. ..."), matched to the domain the
// visitor is on, so a German visitor is not shown Vorarlberg places. Pure module: no React,
// no window access at import time (prerender-safe); the caller passes hostname and language.

// What the field showed before. Kept byte-identical for .at, thetribe.at, deintribe.at,
// localhost and unknown hosts (dark launch: Vorarlberg-only stays unchanged).
export const LEGACY_PLACE_PLACEHOLDER = 'z. B. Bregenz, Lindau, Allgäu';

// Example places per country, all of them known to the bundled place list / regions.
export const PLACE_PLACEHOLDERS = Object.freeze({
  AT: LEGACY_PLACE_PLACEHOLDER,
  DE: 'z. B. München, Berlin, Niedersachsen',
  CH: 'z. B. Zürich, Bern, Genf',
});

const COUNTRY_BY_TLD = { at: 'AT', de: 'DE', ch: 'CH' };

// ".com" has no country: the browser language decides (de-CH, de-DE), everything else AT.
function countryFromLanguage(language) {
  const region = typeof language === 'string' ? language.split(/[-_]/)[1] : '';
  const upper = (region || '').toUpperCase();
  return upper === 'CH' || upper === 'DE' ? upper : 'AT';
}

/** The placeholder for `hostname` (case and "www." tolerant). `language` is `navigator.language`. */
export function placeholderForHost(hostname, language) {
  const host =
    typeof hostname === 'string'
      ? hostname
          .trim()
          .toLowerCase()
          .replace(/^www\./, '')
      : '';
  const tld = host.split('.').pop();
  const country = tld === 'com' ? countryFromLanguage(language) : (COUNTRY_BY_TLD[tld] ?? 'AT');
  return PLACE_PLACEHOLDERS[country];
}
