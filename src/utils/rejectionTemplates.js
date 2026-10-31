// Rejection reasons for the event review (Trello 6ae46ad6). Staff picks one in
// the message composer (EventMessages), adjusts it and sends it; the message is
// stored with `kind: 'rejection'`, so onAdminMessageCreated sends no "Änderungen
// gewünscht" mail. The owner gets the reason with the "Dein Event wurde
// abgelehnt" mail once the event is rejected in the Review tab
// (buildRejectUpdate, trashKind 'rejected').
//
// Reasons 1-6 follow the "NICHT OK – ablehnen" list of the moderator guidelines
// (src/utils/moderatorOnboardingText.js). Region names stay out of the texts
// (dark launch).
import { stripHtml } from './sanitize';

export const REJECTION_MESSAGE_KIND = 'rejection';

/** Firestore limit of `trashReason` (firestore.rules, moderator trash branch). */
export const MAX_REJECTION_REASON_LENGTH = 2000;

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CLOSING = [
  '<p>Wenn du Fragen hast, schreib uns gerne hier im Chat.</p>',
  '<p>Liebe Grüße,<br>Dein Admin-Team</p>',
];

function letter(name, paragraphs) {
  const greeting = name ? `Hallo ${escapeHtml(name)},` : 'Hallo,';
  return [`<p>${greeting}</p>`, ...paragraphs.map((p) => `<p>${p}</p>`), ...CLOSING].join('');
}

const THANKS = 'danke, dass du dein Event mit uns teilen möchtest.';

export const REJECTION_TEMPLATES = [
  {
    id: 'kein-bezug',
    label: 'Kein Bezug zur Gemeinschaft / zum Thema',
    paragraphs: [
      `${THANKS} Leider können wir es nicht freigeben: Wir sehen keinen erkennbaren Bezug zu unserer Gemeinschaft und zu den Themen unseres Kalenders, also zu bewussten, ganzheitlichen oder gemeinschaftsfördernden Angeboten.`,
      'Falls wir etwas übersehen haben, erzähl uns gerne, worum es bei deinem Event geht.',
    ],
  },
  {
    id: 'werbung',
    label: 'Reine Werbung / Produktverkauf ohne Event',
    paragraphs: [
      `${THANKS} Unser Kalender ist für Veranstaltungen da, an denen Menschen teilnehmen können. Dein Eintrag wirkt auf uns wie Werbung oder ein Produktverkauf ohne konkretes Event, deshalb können wir ihn nicht freigeben.`,
      'Wenn du ein Event anbietest (zum Beispiel einen Workshop, einen Abend oder ein Seminar), trage es gerne mit Datum, Ort und Ablauf ein.',
    ],
  },
  {
    id: 'kein-regionaler-bezug',
    label: 'Kein regionaler Bezug (Veranstalterverzeichnis)',
    paragraphs: [
      `${THANKS} Leider hat es keinen regionalen Bezug zu unserem Veranstaltungskalender, deshalb können wir es hier nicht freigeben.`,
      'Angebote außerhalb der Region, zum Beispiel Retreats im Ausland, passen besser ins Veranstalterverzeichnis (Menüpunkt „Verzeichnis“). Dort kannst du dich und deine Angebote gerne vorstellen.',
    ],
  },
  {
    id: 'unvollstaendig',
    label: 'Unvollständige oder irreführende Angaben',
    paragraphs: [
      `${THANKS} Einige Angaben sind leider unvollständig oder missverständlich (zum Beispiel Datum, Ort, Beschreibung oder Veranstalter), deshalb können wir es so nicht freigeben.`,
      'Frag uns gerne hier im Chat, was genau fehlt, wir helfen dir weiter. Danach kannst du dein Event überarbeiten und erneut einreichen.',
    ],
  },
  {
    id: 'schaedlich',
    label: 'Diskriminierende oder schädliche Inhalte',
    paragraphs: [
      `${THANKS} Leider enthält es Inhalte, die wir nicht veröffentlichen können, weil sie andere Menschen herabsetzen, ausgrenzen oder ihnen schaden können. Unser Kalender soll ein sicherer und respektvoller Raum für alle sein.`,
    ],
  },
  {
    id: 'rechtlich',
    label: 'Rechtlich bedenklich / Rechte Dritter',
    paragraphs: [
      `${THANKS} Leider haben wir den Eindruck, dass Inhalte deines Events gegen geltendes Recht oder Rechte Dritter verstoßen könnten (zum Beispiel Bilder oder Texte ohne Nutzungsrecht oder Heilversprechen). Deshalb können wir es so nicht freigeben.`,
    ],
  },
  {
    id: 'doppelt',
    label: 'Doppelt eingetragen',
    paragraphs: [
      `${THANKS} Dieses Event ist bei uns bereits eingetragen, deshalb geben wir diesen zweiten Eintrag nicht frei. Änderungen kannst du direkt beim bestehenden Event machen.`,
    ],
  },
  {
    id: 'vergangen',
    label: 'Event liegt in der Vergangenheit',
    paragraphs: [
      `${THANKS} Das Datum liegt leider schon in der Vergangenheit, deshalb können wir es nicht mehr veröffentlichen.`,
      'Wenn es einen neuen Termin gibt, passe das Datum gerne an und reiche dein Event erneut ein.',
    ],
  },
  {
    id: 'bild',
    label: 'Bild ungeeignet',
    paragraphs: [
      `${THANKS} Das Bild können wir leider so nicht veröffentlichen, zum Beispiel weil es nicht zum Event passt, sehr unscharf ist oder Rechte Dritter verletzen könnte.`,
      'Bitte lade ein anderes, passendes Bild hoch und reiche dein Event danach erneut ein.',
    ],
  },
  {
    id: 'freitext',
    label: 'Freitext',
    paragraphs: ['Leider können wir dein Event nicht freigeben, weil …'],
  },
];

/** Message HTML of a rejection template, greeting the organizer by name. */
export function buildRejectionTemplate(id, name) {
  const template = REJECTION_TEMPLATES.find((t) => t.id === id);
  if (!template) return '';
  return letter(name, template.paragraphs);
}

function createdAtMillis(value) {
  if (!value) return Number.POSITIVE_INFINITY; // pending serverTimestamp = just written
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * The newest staff message (authorRole 'Admin') with text, or null. This is the
 * reason a rejection needs; messages arrive unordered from the snapshot.
 */
export function latestStaffMessage(messages) {
  let latest = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  (messages || []).forEach((m) => {
    if (!m || m.authorRole !== 'Admin') return;
    if (typeof m.text !== 'string' || stripHtml(m.text).trim() === '') return;
    const ms = createdAtMillis(m.createdAt);
    if (ms >= latestMs) {
      latest = m;
      latestMs = ms;
    }
  });
  return latest;
}

/**
 * Plain-text reason for `trashReason` from a (rich-text) message: paragraphs
 * and line breaks become new lines, capped at the rules limit.
 */
export function rejectionReasonFromMessage(text) {
  if (typeof text !== 'string') return '';
  const withBreaks = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li)>\s*/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ');
  const plain = withBreaks
    .split('\n')
    .map((line) => stripHtml(line).trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return plain.length > MAX_REJECTION_REASON_LENGTH
    ? `${plain.slice(0, MAX_REJECTION_REASON_LENGTH - 1).trimEnd()}…`
    : plain;
}
