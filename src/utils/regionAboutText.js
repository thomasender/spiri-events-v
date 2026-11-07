// Editable body of the "Deine Heimat <Region> ruft dich." section of a region's
// "Über uns" page. The heading itself is fixed; the body is stored as sanitized
// HTML on `regions/{id}.aboutText`. Until a moderator saves her own text the page
// shows the default below (the same words as the static markup in AboutPage).

import { regionTexts } from './regionTexts.js';

export const ABOUT_TEXT_MAX_LENGTH = 5000;

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Default body as HTML, used to pre-fill the editor. `placePhrase`: "in Tirol". */
export function defaultAboutBodyHtml(placePhrase) {
  const phrase = escapeHtml(placePhrase);
  return (
    '<p>Veranstaltungen wie Breathwork, Meditation, Yoga, Singen, Tanzen, Aufstellungsarbeit ' +
    'und vieles mehr eröffnen unterschiedliche Zugänge zu einem gemeinsamen Anliegen:</p>' +
    '<p><strong>Zurück zu uns selbst und anderen kommen.</strong></p>' +
    '<p>Für uns heißt das, die eigenen Bedürfnisse, Gefühle und Werte bewusster wahrzunehmen ' +
    'und das eigene Leben danach auszurichten. So können wir auch für andere besser da sein.</p>' +
    '<p>Dabei ist uns wichtig:</p>' +
    '<ul><li><strong>Selbsterkenntnis:</strong> Wir möchten unsere Gedanken, Gefühle und ' +
    'Verhaltensmuster besser verstehen und erkennen, was uns wirklich entspricht.</li>' +
    '<li><strong>Frieden:</strong> Wir üben, uns selbst und anderen mit mehr Gelassenheit zu ' +
    'begegnen und Konflikte respektvoll zu klären.</li>' +
    '<li><strong>Mitgefühl:</strong> Wir nehmen Anteil an dem, was andere bewegt, und achten ' +
    'dabei auch auf die eigenen Grenzen.</li>' +
    `<li><strong>Bewusstsein ${phrase} stärken:</strong> Wir schaffen vor Ort Möglichkeiten, ` +
    'innezuhalten, voneinander zu lernen und bewusster mit uns selbst und unserer Umgebung ' +
    'umzugehen.</li></ul>' +
    '<p><strong>Verbindung beginnt für uns mit einer Begegnung und wächst durch das, was wir ' +
    'miteinander teilen und füreinander tun.</strong> Lass uns gemeinsam wachsen und das, was ' +
    'uns bewegt, in die Welt bringen – denn <strong>die Welt braucht unser Strahlen.</strong></p>'
  );
}

/** The stored text of a region, or '' when it has none (page shows the default). */
export function customAboutText(region) {
  return typeof region?.aboutText === 'string' ? region.aboutText.trim() : '';
}

// Slogan in the page header (two lines). Line 1 replaces the region title
// ("Dein Vorarlberger Kalender"), line 2 the subline ("für bewusste Events").
// `aboutSloganLocked` is set when a Super-Admin saved it: from then on only a
// Super-Admin may change it (firestore.rules enforce this).
export const SLOGAN_LINE1_MAX_LENGTH = 30;
export const SLOGAN_LINE2_MAX_LENGTH = 30;
export const DEFAULT_SLOGAN_LINE2 = 'für bewusste Events';

/**
 * The slogan the header shows when nothing is saved: line 1 is the header title of
 * `regionTexts` (same function as the Header), line 2 the fixed subline.
 */
export function defaultSlogan(region, { activeCount = 1 } = {}) {
  return { line1: regionTexts(region, { activeCount }).headerTitle, line2: DEFAULT_SLOGAN_LINE2 };
}

/** Saved slogan lines of a region; '' where nothing is saved (header shows today's text). */
export function customSlogan(region) {
  const line = (v) => (typeof v === 'string' ? v.trim() : '');
  return { line1: line(region?.aboutSlogan1), line2: line(region?.aboutSlogan2) };
}
