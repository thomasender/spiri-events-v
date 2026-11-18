/**
 * The ONE outreach mail of the event import (docs/event-import.md, "Outreach
 * mail"). Pure: no Firebase imports, so tests/lib/importOutreachMail.spec.ts and
 * scripts/render-import-outreach-mail.mjs render it without anything running.
 *
 * Rules (legal baseline of the epic): sober and informative, no marketing
 * wording, no reminder (there is none, anywhere), nothing is published without
 * consent, a one-click decline link, the Art. 14 GDPR information and the full
 * imprint of the association.
 */
import { escapeHtml } from './emailTemplates';

/** Bump when the meaning of the mail changes; stored on the outreach log. */
export const OUTREACH_TEMPLATE_VERSION = '2026-11-v1';

/** Organizers who do not answer: their data is deleted this many days after the mail. */
export const IMPORT_RETENTION_DAYS = 90;

/** Reply-To of the mail (the shared admin inbox). */
export const OUTREACH_REPLY_TO = 'admin@thetribe.at';

/** Subject prefix of a test send (staging, or `testRecipient`). */
export const TEST_SUBJECT_PREFIX = '[TEST] ';

/** Imprint of the association; same data as src/pages/LegalPage.jsx ("Impressum"). */
export const ASSOCIATION_IMPRINT = {
  name: 'Tribe Vorarlberg - Verein zur Förderung einer ganzheitlichen Lebensweise und Gesundheitsförderung',
  zvr: '1865711062',
  street: 'Vordere Achmühlerstraße 17C',
  city: 'A-6850 Dornbirn',
  country: 'Vorarlberg / Österreich',
  email: 'admin@thetribe.at',
  phone: '+43 68181828713',
} as const;

/** Austrian data protection authority (complaints, Art. 77 GDPR). */
export const SUPERVISORY_AUTHORITY =
  'Österreichische Datenschutzbehörde, Barichgasse 40-42, 1030 Wien, www.dsb.gv.at';

export interface OutreachMailEvent {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** The event's page on the organizer's website. */
  link: string;
}

export interface OutreachMailInput {
  to: string;
  organizerName: string;
  website: string;
  /** The address the mail goes to as it was found (shown in the Art. 14 block). */
  contactEmail: string;
  regionName: string | null;
  events: OutreachMailEvent[];
  previewUrl: string;
  declineUrl: string;
  /** Static page with the full privacy information. */
  privacyUrl: string;
  /** ISO date-time until which the preview link works. */
  linkValidUntil: string;
  /** ISO date-time after which unanswered data is deleted. */
  deleteAfter: string;
  /** Prefix the subject with "[TEST] " (staging / test recipient). */
  test?: boolean;
}

export interface OutreachMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** "18.11.2026" in Vienna. */
export function germanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/** "18.11.2026" for a YYYY-MM-DD calendar date (no time zone shift). */
function calendarDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ymd;
}

const MAX_LISTED_EVENTS = 10;

/** The Art. 14 GDPR information, one entry per line (label, text). */
export function art14Lines(input: {
  website: string;
  contactEmail: string;
  privacyUrl: string;
}): Array<[string, string]> {
  const i = ASSOCIATION_IMPRINT;
  return [
    ['Verantwortlich', `${i.name}, ZVR-Zahl ${i.zvr}, ${i.street}, ${i.city}, E-Mail ${i.email}`],
    [
      'Zweck',
      'Wir fragen dich, ob wir deine öffentlich angekündigten Veranstaltungen in unserem Veranstaltungskalender zeigen dürfen.',
    ],
    [
      'Rechtsgrundlage',
      'Unser berechtigtes Interesse, Veranstaltungen sichtbar zu machen und dich dazu einmal anzufragen (Art. 6 Abs. 1 lit. f DSGVO). Veröffentlicht wird nur mit deiner Zustimmung.',
    ],
    [
      'Daten',
      `Name der Organisation, Website, die E-Mail-Adresse ${input.contactEmail} und die Angaben zu den Veranstaltungen (Titel, Datum, Uhrzeit, Ort, Preis, Beschreibung, Link, Adresse des Bildes auf deiner Website). Bilder speichern wir vor deiner Zustimmung nicht.`,
    ],
    [
      'Quelle',
      `Deine öffentlich zugängliche Website ${input.website} (Veranstaltungsseiten und Impressum bzw. Kontaktangaben).`,
    ],
    [
      'Empfänger',
      'Unsere Auftragsverarbeiter Google Ireland Limited (Firebase: Datenbank und Hosting) und Mailgun (E-Mail-Versand, EU-Region).',
    ],
    [
      'Speicherdauer',
      `Bis zu deiner Antwort, höchstens ${IMPORT_RETENTION_DAYS} Tage nach dieser E-Mail. Danach bleibt nur der Vermerk, dass wir angefragt haben (Name der Organisation, Website), damit wir nicht noch einmal schreiben. Lehnst du ab, behalten wir nur einen nicht lesbaren Prüfwert (Hash) deiner E-Mail-Adresse und Domain, damit wir dich nie wieder anfragen.`,
    ],
    [
      'Deine Rechte',
      `Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Widerspruch gegen die Verarbeitung (Art. 21 DSGVO), jederzeit formlos an ${i.email}.`,
    ],
    ['Beschwerde', SUPERVISORY_AUTHORITY],
    ['Mehr dazu', input.privacyUrl],
  ];
}

export function imprintLines(): string[] {
  const i = ASSOCIATION_IMPRINT;
  return [
    i.name,
    `ZVR-Zahl: ${i.zvr}`,
    i.street,
    i.city,
    i.country,
    `E-Mail: ${i.email}`,
    `Tel: ${i.phone}`,
  ];
}

/**
 * Subject, plain text and HTML of the outreach mail. Everything the organizer
 * needs is in the plain text as well; the HTML is the same text, plainly set
 * (no images, no tracking pixels, no buttons styled as advertising).
 */
export function renderOutreachMail(input: OutreachMailInput): OutreachMail {
  const name = input.organizerName.trim();
  const shown = input.events.slice(0, MAX_LISTED_EVENTS);
  const more = input.events.length - shown.length;
  const validUntil = germanDate(input.linkValidUntil);
  const deleteOn = germanDate(input.deleteAfter);
  const region = input.regionName
    ? ` Derzeit bauen wir den Kalender für ${input.regionName} auf.`
    : '';

  const subject = `${input.test ? TEST_SUBJECT_PREFIX : ''}Anfrage von tribe: Veranstaltungen von ${name}`;

  const eventLines = shown.map((e) => `- ${calendarDate(e.date)}: ${e.title} (${e.link})`);
  if (more > 0) eventLines.push(`- und ${more} weitere`);

  const paragraphs: string[] = [
    'Hallo,',
    `wir sind tribe, ein ehrenamtlich betriebener Veranstaltungskalender des gemeinnützigen Vereins Tribe Vorarlberg. Wir sammeln Veranstaltungen rund um eine bewusste, ganzheitliche Lebensweise.${region}`,
    `Auf deiner Website ${input.website} haben wir diese Veranstaltungen von ${name} gefunden:`,
    eventLines.join('\n'),
    `Deine E-Mail-Adresse haben wir aus dem Impressum bzw. den Kontaktangaben dieser Website.`,
    `Wir würden diese Veranstaltungen gern in unserem Kalender zeigen, mit einem Link auf deine Seite. Ohne deine Zustimmung veröffentlichen wir nichts. Bisher ist nichts davon öffentlich.`,
    `Unter diesem privaten Link siehst du, wie die Einträge aussehen würden, und kannst zustimmen oder ablehnen (gültig bis ${validUntil}):\n${input.previewUrl}`,
    `Wenn du das nicht möchtest, genügt ein Klick:\n${input.declineUrl}\nOder antworte einfach mit "Nein" auf diese E-Mail. Dann löschen wir deine Angaben und schreiben dir nicht noch einmal.`,
    `Antwortest du nicht, löschen wir deine E-Mail-Adresse und alle Angaben zu deinen Veranstaltungen nach ${IMPORT_RETENTION_DAYS} Tagen (am ${deleteOn}). Dies ist unsere einzige E-Mail an dich.`,
    `Bei Fragen antworte einfach auf diese E-Mail.`,
    'Viele Grüße\ntribe',
  ];

  const art14 = art14Lines(input);
  const text =
    paragraphs.join('\n\n') +
    '\n\n--\nDatenschutzinformation (Art. 14 DSGVO)\n' +
    art14.map(([label, value]) => `${label}: ${value}`).join('\n') +
    '\n\n--\nImpressum\n' +
    imprintLines().join('\n') +
    '\n';

  const p = (s: string) =>
    `<p style="margin:0 0 14px 0;">${escapeHtml(s).replace(/\n/g, '<br>')}</p>`;
  const link = (url: string) =>
    `<a href="${escapeHtml(url)}" style="color:#161819;">${escapeHtml(url)}</a>`;
  const eventsHtml =
    '<ul style="margin:0 0 14px 0;padding-left:20px;">' +
    shown
      .map(
        (e) =>
          `<li>${escapeHtml(calendarDate(e.date))}: ${escapeHtml(e.title)} (${link(e.link)})</li>`
      )
      .join('') +
    (more > 0 ? `<li>und ${more} weitere</li>` : '') +
    '</ul>';
  const html = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>tribe</title></head>
<body style="margin:0;padding:24px 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#161819;background:#ffffff;">
<div style="max-width:600px;margin:0 auto;">
${p(paragraphs[0])}
${p(paragraphs[1])}
${p(paragraphs[2])}
${eventsHtml}
${p(paragraphs[4])}
${p(paragraphs[5])}
<p style="margin:0 0 14px 0;">Unter diesem privaten Link siehst du, wie die Einträge aussehen würden, und kannst zustimmen oder ablehnen (gültig bis ${escapeHtml(validUntil)}):<br>${link(input.previewUrl)}</p>
<p style="margin:0 0 14px 0;">Wenn du das nicht möchtest, genügt ein Klick:<br>${link(input.declineUrl)}<br>Oder antworte einfach mit "Nein" auf diese E-Mail. Dann löschen wir deine Angaben und schreiben dir nicht noch einmal.</p>
${p(paragraphs[8])}
${p(paragraphs[9])}
${p(paragraphs[10])}
<div style="margin-top:28px;padding-top:12px;border-top:1px solid #e2dcd2;font-size:12px;line-height:1.5;color:#605e5e;">
<p style="margin:0 0 6px 0;font-weight:bold;">Datenschutzinformation (Art. 14 DSGVO)</p>
${art14
  .map(
    ([label, value]) =>
      `<p style="margin:0 0 6px 0;"><strong>${escapeHtml(label)}:</strong> ${
        /^https?:\/\//.test(value) ? link(value) : escapeHtml(value)
      }</p>`
  )
  .join('\n')}
<p style="margin:16px 0 6px 0;font-weight:bold;">Impressum</p>
<p style="margin:0;">${imprintLines().map(escapeHtml).join('<br>')}</p>
</div>
</div>
</body>
</html>`;

  return { to: input.to, subject, text, html };
}
