// Editable body of the "Deine Heimat <Region> ruft dich." section of a region's
// "Über uns" page. The heading itself is fixed; the body is stored as sanitized
// HTML on `regions/{id}.aboutText`. Until a moderator saves her own text the page
// shows the default below (the same words as the static markup in AboutPage).

export const ABOUT_TEXT_MAX_LENGTH = 5000;

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Default body as HTML, used to pre-fill the editor. `placePhrase`: "in Tirol". */
export function defaultAboutBodyHtml(placePhrase) {
  const phrase = escapeHtml(placePhrase);
  return (
    `<p>Wir sind der Tribe ${phrase}, der die gefundenen Methoden praktiziert und sich ` +
    'verbindet. Diese sind meist sehr ganzheitlich (Breathwork, Meditation, Yoga, Singen, ' +
    'Tanzen, Aufstellungsarbeit, …) und haben alle ein gemeinsames Ziel:</p>' +
    '<p><strong>Zurück zu uns Selbst zu kommen.</strong></p>' +
    '<ul><li>Selbsterkenntnis</li><li>Friede</li><li>Mitgefühl</li>' +
    `<li>Erwachen ${phrase} vergrößern und hier pflegen</li></ul>` +
    '<p><strong>Verbinde dich jetzt mit uns!</strong></p>'
  );
}

/** The stored text of a region, or '' when it has none (page shows the default). */
export function customAboutText(region) {
  return typeof region?.aboutText === 'string' ? region.aboutText.trim() : '';
}
