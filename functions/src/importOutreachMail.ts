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
export const OUTREACH_TEMPLATE_VERSION = '2026-11-v3';

/**
 * Two looks of the same mail (same text, same legal parts):
 * - `bilder`: logo, step badges and the team photos, loaded from our own
 *   domain (`<assetBase>/mail/*`, files in public/mail/); no tracking pixel, no third party.
 * - `schlicht`: the same mail without any image.
 * `bilder` is the default; `schlicht` is kept but currently unused. It is also what a
 * render without `assetBase` falls back to (an image URL needs an origin).
 */
export type OutreachVariant = 'bilder' | 'schlicht';
export const OUTREACH_DEFAULT_VARIANT: OutreachVariant = 'bilder';

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
  /**
   * The event's own picture on the organizer's site (https; `previewImageUrl` has checked it
   * lies on the source site). Shown in the mail's preview card, loaded by the reader's mail
   * client straight from the organizer's site: no copy of ours. Null = no picture in the card.
   */
  imageUrl?: string | null;
}

export interface OutreachMailInput {
  to: string;
  organizerName: string;
  website: string;
  /** The address the mail goes to as it was found (shown in the Art. 14 block). */
  contactEmail: string;
  regionName: string | null;
  /** "in Tirol" / "im Burgenland" (RegionDatum.inPhrase); null = "in deiner Region". */
  regionIn?: string | null;
  /** Country of the region (AT, DE, CH, LI); picks the deintribe domain. */
  country?: string | null;
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
  /** Look of the mail, default `OUTREACH_DEFAULT_VARIANT`. */
  variant?: OutreachVariant;
  /** Site origin the mail images are loaded from (`<assetBase>/mail/...`), no trailing slash. */
  assetBase?: string;
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

/** Regional landing page shown in the mail (Trello vlEQpyMW: .de / .ch / .at by country). */
export function tribeSiteFor(country: string | null | undefined): { host: string; url: string } {
  const tld = country === 'DE' ? 'de' : country === 'CH' ? 'ch' : 'at';
  const host = `www.deintribe.${tld}`;
  return { host, url: `https://${host}` };
}

/** The vision sentence, regional (Trello vlEQpyMW: the region, not the whole DACH area). */
export function visionText(regionIn: string | null | undefined): string {
  const where = regionIn?.trim() || 'in deiner Region';
  return `Unsere Vision: Veranstaltungen rund um Achtsamkeit, Bewegung und persönliche Entwicklung ${where} sichtbar machen und Menschen vor Ort mit Veranstaltungen und Gemeinschaften verbinden. So entstehen Nähe, echte Begegnungen und Zugehörigkeit ${where}.`;
}

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
  const many = input.events.length > 1;
  const where = input.regionIn?.trim() || 'in deiner Region';
  const yourEvent = many ? 'deine Events' : 'dein Event';

  const subject = `${input.test ? TEST_SUBJECT_PREFIX : ''}Anfrage von tribe: Veranstaltungen von ${name}`;

  const eventLines = shown.map((e) => `- ${calendarDate(e.date)}: ${e.title} (${e.link})`);
  if (more > 0) eventLines.push(`- und ${more} weitere`);

  const paragraphs: string[] = [
    'Hallo,',
    `wir sind Dein Tribe, ein ehrenamtlich betriebener Veranstaltungskalender für bewusste Veranstaltungen, echte Begegnungen und Menschen, die gemeinsam ${where} wachsen möchten.`,
    visionText(input.regionIn),
    `Auf deiner Website ${input.website} haben wir diese Veranstaltungen von ${name} gefunden:`,
    eventLines.join('\n'),
    `Deine E-Mail-Adresse haben wir aus dem Impressum bzw. den Kontaktangaben dieser Website.`,
    `Wir würden diese Veranstaltungen gern in unserem Kalender zeigen, mit einem Link auf deine Seite.`,
    `Unter diesem privaten Link siehst du, wie die Einträge aussehen würden, und kannst zustimmen oder ablehnen (gültig bis ${validUntil}):\n${input.previewUrl}`,
    `Wenn du das nicht möchtest, genügt ein Klick:\n${input.declineUrl}\nOder antworte einfach mit "Nein" auf diese E-Mail. Dann löschen wir deine Angaben und schreiben dir nicht noch einmal.`,
    `Antwortest du nicht, löschen wir ${yourEvent} automatisch am ${deleteOn}.`,
    `Du möchtest uns kennenlernen? Antworte einfach auf diese E-Mail, wir melden uns für ein kurzes Gespräch.`,
    `Viele Grüße\nPeter, Thomas und Jana (Dein Tribe)\n${tribeSiteFor(input.country).host}`,
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
  const first = shown[0];
  const site = tribeSiteFor(input.country);
  const rich = (input.variant ?? OUTREACH_DEFAULT_VARIANT) === 'bilder' && !!input.assetBase;
  const img = (file: string) => `${(input.assetBase ?? '').replace(/\/$/, '')}/mail/${file}`;
  const person = (file: string, who: string, role: string) =>
    `<td align="center" width="33%" style="padding:0 6px;"><img src="${escapeHtml(img(file))}" width="96" height="96" alt="${escapeHtml(who)}" style="display:block;width:96px;height:96px;border-radius:50%;border:3px solid #eae8e2;margin:0 auto;"><div style="margin-top:8px;font-size:14px;font-weight:bold;color:#33302d;">${escapeHtml(who)}</div><div style="font-size:12px;color:#777777;">${escapeHtml(role)}</div></td>`;
  const step = (nr: string, title: string, body: string) =>
    rich
      ? `<p style="line-height:1.6;margin:0 0 14px 0;"><span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:#be8e6d;color:#ffffff;font-weight:bold;font-size:13px;margin-right:8px;">${nr}</span><b>${escapeHtml(title)}</b><br>${escapeHtml(body)}</p>`
      : `<p style="line-height:1.6;margin:0 0 14px 0;"><b style="color:#bd8d6d;">${nr}</b> &nbsp; <b>${escapeHtml(title)}</b><br>${escapeHtml(body)}</p>`;
  const small = 'font-size:12px;line-height:1.5;color:#605e5e;';
  const html = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Einladung – Dein Tribe</title></head>
<body style="margin:0;background:#f5f2ef;font-family:Arial,Helvetica,sans-serif;color:#33302d;">
<div style="display:none;">Deine Events sichtbar machen – nur mit deiner Zustimmung.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2ef;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">
<tr><td style="padding:30px 38px 20px;text-align:center;background:#eae8e2;">${rich ? `<img src="${escapeHtml(img('logo.png'))}" width="60" height="42" alt="" style="display:block;margin:0 auto 6px;border:0;">` : ''}<div style="font-family:Georgia,serif;font-size:28px;color:#63745c;">dein tribe</div><div style="font-size:11px;letter-spacing:2px;color:#777777;">BEWUSSTE EVENTS · ECHTE BEGEGNUNGEN</div></td></tr><tr><td style="padding:35px 38px 10px;">
<div style="font-size:12px;letter-spacing:2px;color:#bf8b6b;font-weight:bold;">EINE EINLADUNG AN DICH</div>
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:30px;line-height:1.2;margin:14px 0;color:#292722;">${many ? 'Deine Events verdienen es' : 'Dein Event verdient es'}, entdeckt zu werden.</h1>
<p style="line-height:1.65;">Hallo,</p>
<p style="line-height:1.65;">wir sind <b>Dein Tribe</b> – ein ehrenamtlich betriebener Veranstaltungskalender für bewusste Veranstaltungen, echte Begegnungen und Menschen, die gemeinsam ${escapeHtml(where)} wachsen möchten.</p>
<p style="line-height:1.65;">${escapeHtml(visionText(input.regionIn))}</p>
<p style="line-height:1.65;">Auf deiner Website ${link(input.website)} haben wir diese Veranstaltungen von <b>${escapeHtml(name)}</b> gefunden:</p>
${eventsHtml}
<p style="line-height:1.65;">Deine E-Mail-Adresse haben wir aus dem Impressum bzw. den Kontaktangaben dieser Website.</p>
<p style="line-height:1.65;"><b>Wir möchten dich und deine Veranstaltungen dabei haben.</b> Wir würden diese Veranstaltungen gern in unserem Kalender zeigen, mit einem Link auf deine Seite.</p>
</td></tr>${
    first
      ? `
<tr><td style="padding:5px 38px 15px;"><table width="100%" role="presentation" style="background:#f0eee9;border:1px solid #e1dcd3;border-radius:12px;"><tr><td style="padding:22px;">
<div style="font-size:12px;color:#a87859;letter-spacing:1.5px;">SO KÖNNTE DEIN EVENT AUSSEHEN</div>
<div style="margin-top:14px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e1db;">${
          /^https:\/\//.test(first.imageUrl ?? '')
            ? `<img src="${escapeHtml(first.imageUrl as string)}" width="500" alt="${escapeHtml(first.title)}" style="display:block;width:100%;max-width:100%;height:auto;max-height:260px;object-fit:cover;border:0;">`
            : ''
        }<div style="padding:16px;"><div style="font-size:11px;color:#a87859;">EVENTKALENDER · VORSCHAU</div><div style="font-family:Georgia,serif;font-size:22px;margin:7px 0;">${escapeHtml(first.title)}</div><div style="color:#666666;font-size:13px;">${escapeHtml(calendarDate(first.date))} · ${escapeHtml(name)}</div><div style="margin-top:14px;font-size:12px;color:#687b60;">● Vorschau – noch nicht öffentlich</div></div></div>
<div style="${small}margin-top:10px;">Schematische Vorschau – die tatsächliche Darstellung siehst du über deinen privaten Link.</div>
</td></tr></table></td></tr>`
      : ''
  }
<tr><td style="padding:10px 38px 20px;">
<h2 style="font-family:Georgia,serif;font-size:24px;font-weight:normal;">So einfach geht’s</h2>
${step('01', 'Wir haben alles vorbereitet.', 'Deine Events liegen als Entwürfe bereit. Nichts davon ist öffentlich.')}
${step('02', 'Du schaust es dir an.', `Über deinen privaten Link siehst du die Vorschau (gültig bis ${validUntil}).`)}
${step('03', 'Du gibst frei.', 'Erst mit deiner Zustimmung werden die Events sichtbar. Wenn du möchtest, kannst du optional einmalig für alle künftigen Events zustimmen – dann entfällt die Bestätigung für jedes einzelne.')}
<p style="background:#f5f2ef;padding:14px;border-radius:8px;font-size:14px;line-height:1.5;"><b>Du behältst die Kontrolle:</b> Wir veröffentlichen nichts ohne deine Freigabe.</p>
<div style="text-align:center;margin:26px 0 10px;"><a href="${escapeHtml(input.previewUrl)}" style="display:inline-block;background:#be8e6d;color:#ffffff;border-radius:28px;padding:15px 25px;font-weight:bold;text-decoration:none;">Deine persönliche Vorschau ansehen</a></div>
<p style="${small}text-align:center;margin:0 0 6px 0;">Falls der Button nicht funktioniert: ${link(input.previewUrl)}</p>
</td></tr>
<tr><td style="padding:10px 38px 25px;">
<p style="font-size:14px;line-height:1.65;color:#514b45;margin:0 0 14px 0;">Als Verein bieten wir dir die Einbindung während unserer Aufbauphase <b>kostenlos und unverbindlich</b> an. Du kannst sie jederzeit beenden.</p>
<p style="font-size:14px;line-height:1.65;color:#514b45;margin:0 0 14px 0;"><b>Du möchtest das nicht?</b> Dann genügt ein Klick:<br>${link(input.declineUrl)}<br>Oder antworte einfach mit „Nein“ auf diese E-Mail. Dann löschen wir deine Angaben und schreiben dir nicht noch einmal.</p>
<p style="font-size:14px;line-height:1.65;color:#514b45;margin:0 0 14px 0;">Antwortest du nicht, löschen wir ${yourEvent} automatisch am ${escapeHtml(deleteOn)}.</p>
<h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:26px 0 8px 0;">Du möchtest uns kennenlernen?</h2>
<p style="font-size:14px;line-height:1.65;color:#514b45;margin:0 0 14px 0;">Wenn du Fragen hast oder mehr über unsere Vision erfahren möchtest, antworte einfach auf diese E-Mail – wir melden uns für ein kurzes Gespräch.</p>
${
  rich
    ? `<p style="margin:24px 0 10px 0;line-height:1.7;">Alles Liebe</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 4px;"><tr>${person('peter.jpg', 'Peter', 'Gründer')}${person('thomas.jpg', 'Thomas', 'Gründer')}${person('jana.jpg', 'Jana', 'Mitgründerin')}</tr></table>
<p style="margin:14px 0 6px 0;text-align:center;line-height:1.7;"><b>Peter, Thomas und Jana</b><br><a href="${escapeHtml(site.url)}" style="color:#687b60;">${escapeHtml(site.host)}</a></p>`
    : `<p style="margin:24px 0 6px 0;line-height:1.7;">Alles Liebe<br><b>Peter, Thomas und Jana</b><br><a href="${escapeHtml(site.url)}" style="color:#687b60;">${escapeHtml(site.host)}</a></p>`
}
</td></tr>
<tr><td style="padding:22px 38px 28px;background:#eae8e2;">
<p style="margin:0 0 6px 0;font-size:12px;font-weight:bold;color:#605e5e;">Datenschutzinformation (Art. 14 DSGVO)</p>
${art14
  .map(
    ([label, value]) =>
      `<p style="${small}margin:0 0 6px 0;"><strong>${escapeHtml(label)}:</strong> ${
        /^https?:\/\//.test(value) ? link(value) : escapeHtml(value)
      }</p>`
  )
  .join('\n')}
<p style="margin:16px 0 6px 0;font-size:12px;font-weight:bold;color:#605e5e;">Impressum</p>
<p style="${small}margin:0;">${imprintLines().map(escapeHtml).join('<br>')}</p>
</td></tr>
</table></td></tr></table>
</body>
</html>`;

  return { to: input.to, subject, text, html };
}
