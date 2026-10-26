export type NotificationType =
  'submitted' | 'changes_requested' | 'published' | 'unpublished' | 'deleted' | 'contact_message';

export interface ContactMessageContext {
  feedbackId: string;
  description: string;
  name?: string | null;
  email?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
}

export interface EventOrganizer {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

export interface NotificationEvent {
  id: string;
  title: string;
  slug?: string | null;
  organizer?: EventOrganizer | null;
}

export interface AdminMessageContext {
  messageId: string;
  authorName?: string | null;
  text: string;
}

export interface SubmittedContext {
  submitterName?: string | null;
  /**
   * Region of the event, set only while more than one region is active
   * (adminEventRouting.mailRegionLabel). Unset = the mail is byte-identical to
   * the single-region version.
   */
  regionName?: string | null;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const APP_BASE_URL = 'https://www.thetribe.at';

/**
 * Admin messages are stored as rich-text HTML (older ones as plain text).
 * Emails only render plain text, so flatten the HTML into readable lines.
 * Plain-text messages (not starting with a block tag) pass through unchanged.
 */
export function messageToPlainText(value: string): string {
  const input = (value || '').trim();
  if (!/^<(p|ul|ol)\b/i.test(input)) return input;
  return input
    .replace(/<img\b[^>]*>/gi, '[Bild]')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|ul|ol)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function organizerDisplayName(organizer: EventOrganizer | null | undefined): string {
  if (!organizer) return '';
  const parts = [organizer.firstName, organizer.lastName].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );
  return parts.join(' ').trim();
}

function eventUrl(slug: string | null | undefined): string {
  if (!slug) return `${APP_BASE_URL}/`;
  return `${APP_BASE_URL}/event/${slug}`;
}

function adminReviewUrl(eventId: string): string {
  return `${APP_BASE_URL}/admin?tab=review#${eventId}`;
}

export function notificationSettingsUrl(): string {
  return `${APP_BASE_URL}/profil`;
}

const BRAND_LOGO_URL = `${APP_BASE_URL}/logo-mark.svg`;

const HEADING_FONT = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const BODY_FONT =
  "'Nunito Sans','Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif";

const COLOR_TEXT = '#161819';
const COLOR_MUTED = '#605e5e';
const COLOR_BORDER = '#e2dcd2';
const COLOR_BG_PAGE = '#f4f2f0';
const COLOR_BG_SOFT = '#f4f2f0';
const COLOR_PRIMARY = '#c48e6a';
const COLOR_PRIMARY_HOVER = '#9a5f38';

function brandButtonStyle(): string {
  return `display:inline-block;background:${COLOR_PRIMARY};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.01em;`;
}

function brandSecondaryButtonStyle(): string {
  return `display:inline-block;background:${COLOR_BG_SOFT};color:${COLOR_TEXT};padding:10px 16px;margin:0 8px 8px 0;border:1px solid ${COLOR_BORDER};border-radius:8px;text-decoration:none;font-size:14px;`;
}

function paragraphStyle(): string {
  return `font-family:${BODY_FONT};font-size:15px;line-height:1.6;margin:0 0 16px 0;color:${COLOR_TEXT};`;
}

function mutedStyle(): string {
  return `font-family:${BODY_FONT};font-size:13px;line-height:1.5;margin:0 0 8px 0;color:${COLOR_MUTED};`;
}

function headingStyle(level: 1 | 2): string {
  const size = level === 1 ? 26 : 19;
  return `font-family:${HEADING_FONT};font-size:${size}px;font-weight:500;line-height:1.3;margin:0 0 16px 0;color:${COLOR_TEXT};letter-spacing:0.005em;`;
}

function brandHeader(): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px 0;">
      <tr>
        <td style="vertical-align:middle;padding-right:12px;">
          <img src="${BRAND_LOGO_URL}" alt="Tribe" width="40" height="40" style="display:block;border:0;outline:none;text-decoration:none;" />
        </td>
        <td style="vertical-align:middle;">
          <span style="font-family:${HEADING_FONT};font-size:22px;font-weight:500;color:${COLOR_TEXT};letter-spacing:0.01em;">Tribe</span>
        </td>
      </tr>
    </table>`;
}

type FooterKind = 'notification' | 'auth' | 'favorite';

function footerHtml(kind: FooterKind = 'notification'): string {
  if (kind === 'favorite') {
    return `
      <p style="margin-top:32px;padding-top:16px;border-top:1px solid ${COLOR_BORDER};font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${COLOR_MUTED};">
        Du erhältst diese E-Mail, weil du dieses Event auf tribe Events als Favorit gespeichert hast.
        <a href="${notificationSettingsUrl()}" style="color:${COLOR_MUTED};text-decoration:underline;">Benachrichtigungseinstellungen anpassen</a>.
        Bei Fragen wende dich an <a href="mailto:admin@thetribe.at" style="color:${COLOR_MUTED};text-decoration:underline;">admin@thetribe.at</a>.
      </p>`;
  }
  if (kind === 'auth') {
    return `
      <p style="margin-top:32px;padding-top:16px;border-top:1px solid ${COLOR_BORDER};font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${COLOR_MUTED};">
        Bei Fragen wende dich an <a href="mailto:admin@thetribe.at" style="color:${COLOR_MUTED};text-decoration:underline;">admin@thetribe.at</a>.
      </p>`;
  }
  return `
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid ${COLOR_BORDER};font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${COLOR_MUTED};">
      Du erhältst diese E-Mail, weil du auf tribe Events ein Event eingereicht hast oder verwaltest.
      <a href="${notificationSettingsUrl()}" style="color:${COLOR_MUTED};text-decoration:underline;">Benachrichtigungseinstellungen anpassen</a>.
      Bei Fragen wende dich an <a href="mailto:admin@thetribe.at" style="color:${COLOR_MUTED};text-decoration:underline;">admin@thetribe.at</a>.
    </p>`;
}

function footerText(kind: FooterKind = 'notification'): string {
  if (kind === 'favorite') {
    return `\n--\nDu erhältst diese E-Mail, weil du dieses Event auf tribe Events als Favorit gespeichert hast.\nBenachrichtigungseinstellungen anpassen: ${notificationSettingsUrl()}\nBei Fragen wende dich an admin@thetribe.at.`;
  }
  if (kind === 'auth') {
    return `\n--\nBei Fragen wende dich an admin@thetribe.at.`;
  }
  return `\n--\nDu erhältst diese E-Mail, weil du auf tribe Events ein Event eingereicht hast oder verwaltest.\nBenachrichtigungseinstellungen anpassen: ${notificationSettingsUrl()}\nBei Fragen wende dich an admin@thetribe.at.`;
}

function wrapHtml(body: string, kind: FooterKind = 'notification'): string {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tribe</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Nunito+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="font-family:${BODY_FONT};color:${COLOR_TEXT};background:${COLOR_BG_PAGE};margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:36px 36px 28px 36px;border-radius:12px;border:1px solid ${COLOR_BORDER};">
    ${brandHeader()}
    ${body}
    ${footerHtml(kind)}
  </div>
  <div style="max-width:560px;margin:16px auto 0 auto;font-family:${BODY_FONT};font-size:11px;line-height:1.5;color:${COLOR_MUTED};text-align:center;">
    © Tribe
  </div>
</body>
</html>`;
}

/**
 * Optional line for mails to event owners. Empty string when there is no
 * contact address, so those mails stay byte-identical.
 */
function regionContactHtml(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  if (!value) return '';
  return `
    <p style="${mutedStyle()}">Rückfragen zu dieser Region: <a href="mailto:${escapeHtml(value)}" style="color:${COLOR_MUTED};text-decoration:underline;">${escapeHtml(value)}</a></p>`;
}

function regionContactText(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  return value ? `\n\nRückfragen zu dieser Region: ${value}` : '';
}

/** Set on mails to event owners only while more than one region is active. */
export interface RegionContactInput {
  regionContactEmail?: string | null;
}

export interface SubmittedPayloadInput {
  event: NotificationEvent;
  context: SubmittedContext;
  recipient: string;
}

export function buildSubmittedPayload({
  event,
  context,
  recipient,
}: SubmittedPayloadInput): EmailPayload {
  const link = adminReviewUrl(event.id);
  const submitter = (context.submitterName ?? '').trim() || 'Ein Mitglied';
  const regionName = (context.regionName ?? '').trim();
  const subject = regionName
    ? `Neuer Event-Vorschlag (${regionName}): ${event.title}`
    : `Neuer Event-Vorschlag: ${event.title}`;
  const regionHtml = regionName
    ? `
    <p style="${paragraphStyle()}">Region: ${escapeHtml(regionName)}</p>`
    : '';
  const htmlBody = `
    <h1 style="${headingStyle(1)}">Neuer Event-Vorschlag</h1>
    <p style="${paragraphStyle()}">Hallo,</p>
    <p style="${paragraphStyle()}">
      <strong>${escapeHtml(submitter)}</strong> hat ein neues Event zur Prüfung eingereicht:
    </p>
    <p style="${paragraphStyle()}"><strong>${escapeHtml(event.title)}</strong></p>${regionHtml}
    <p style="margin:8px 0 24px 0;">
      <a href="${link}" style="${brandButtonStyle()}">Im Review ansehen</a>
    </p>`;
  const textBody =
    `Hallo,\n\n` +
    `${submitter} hat ein neues Event zur Prüfung eingereicht:\n` +
    `${event.title}\n` +
    (regionName ? `Region: ${regionName}\n` : '') +
    `\n` +
    `Im Review ansehen: ${link}`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody),
    text: textBody + footerText(),
  };
}

export interface ChangesRequestedPayloadInput extends RegionContactInput {
  event: NotificationEvent;
  context: AdminMessageContext;
  recipient: string;
}

export function buildChangesRequestedPayload({
  event,
  context,
  recipient,
  regionContactEmail,
}: ChangesRequestedPayloadInput): EmailPayload {
  const link = eventUrl(event.slug);
  const messageText = messageToPlainText(context.text);
  const greetingName = organizerDisplayName(event.organizer);
  const greeting = greetingName ? `Hallo ${escapeHtml(greetingName)},` : 'Hallo,';
  const subject = `✏️ Aktion nötig: Bitte ändere dein Event „${event.title}“`;
  const htmlBody = `
    <h1 style="${headingStyle(1)}">Aktion nötig: Bitte ändere dein Event</h1>
    <p style="${paragraphStyle()}">${greeting}</p>
    <p style="${paragraphStyle()}">
      Ein Admin hat sich dein Event angesehen und wünscht folgende Änderung,
      bevor wir es veröffentlichen können:
    </p>
    <blockquote style="margin:0 0 20px 0;padding:14px 18px;border-left:3px solid ${COLOR_PRIMARY};background:${COLOR_BG_SOFT};border-radius:0 6px 6px 0;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${COLOR_TEXT};white-space:pre-wrap;">${escapeHtml(messageText)}</blockquote>
    <p style="${paragraphStyle()}">
      Bitte nimm die gewünschte Änderung vor, damit wir deinen Event veröffentlichen können:
    </p>
    <p style="margin:8px 0 24px 0;">
      <a href="${link}" style="${brandButtonStyle()}">Event bearbeiten</a>
    </p>`;
  const textBody =
    `${greetingName ? `Hallo ${greetingName},\n\n` : 'Hallo,\n\n'}` +
    `Ein Admin hat sich dein Event angesehen und wünscht folgende Änderung, ` +
    `bevor wir es veröffentlichen können:\n\n` +
    `${messageText}\n\n` +
    `Event bearbeiten: ${link}`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody + regionContactHtml(regionContactEmail)),
    text: textBody + regionContactText(regionContactEmail) + footerText(),
  };
}

export interface PublishedPayloadInput extends RegionContactInput {
  event: NotificationEvent;
  recipient: string;
}

interface ShareChannel {
  id: 'facebook' | 'whatsapp' | 'telegram';
  label: string;
  buildUrl: (url: string, title: string) => string;
}

const PUBLISHED_SHARE_CHANNELS: ShareChannel[] = [
  {
    id: 'facebook',
    label: 'Facebook',
    buildUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    buildUrl: (url) => `https://wa.me/?text=${encodeURIComponent(url)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    buildUrl: (url, title) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
];

export function buildPublishedShareUrls(
  event: NotificationEvent
): { channelId: ShareChannel['id']; label: string; url: string }[] {
  const url = eventUrl(event.slug);
  const title = event.title || '';
  return PUBLISHED_SHARE_CHANNELS.map((channel) => ({
    channelId: channel.id,
    label: channel.label,
    url: channel.buildUrl(url, title),
  }));
}

export function buildPublishedPayload({
  event,
  recipient,
  regionContactEmail,
}: PublishedPayloadInput): EmailPayload {
  const link = eventUrl(event.slug);
  const greetingName = organizerDisplayName(event.organizer);
  const greeting = greetingName ? `Hallo ${escapeHtml(greetingName)},` : 'Hallo,';
  const subject = `Dein Event ist live: ${event.title}`;
  const shareLinks = buildPublishedShareUrls(event);
  const shareButtons = shareLinks
    .map(
      (share) =>
        `<a href="${share.url}" target="_blank" rel="noopener noreferrer" ` +
        `style="${brandSecondaryButtonStyle()}">` +
        `Über ${escapeHtml(share.label)} teilen</a>`
    )
    .join('');
  const htmlBody = `
    <h1 style="${headingStyle(1)}">Dein Event ist live</h1>
    <p style="${paragraphStyle()}">${greeting}</p>
    <p style="${paragraphStyle()}">
      Schön, dass du dein Event mit der Community teilst! Dein Event <strong>${escapeHtml(event.title)}</strong> ist jetzt öffentlich sichtbar.
    </p>
    <p style="margin:8px 0 28px 0;">
      <a href="${link}" style="${brandButtonStyle()}">Event ansehen</a>
    </p>
    <h2 style="${headingStyle(2)}">Hilf mit, dein Event zu verbreiten</h2>
    <p style="${paragraphStyle()}">
      Je mehr Leute von deinem Event erfahren, desto mehr Menschen können teilnehmen. Teile den Link über deine bevorzugten Kanäle – oder leite diese E-Mail einfach weiter.
    </p>
    <p style="margin:0 0 16px 0;">${shareButtons}</p>
    <p style="${mutedStyle()}">Direkter Link zum Event:</p>
    <p style="font-family:${BODY_FONT};font-size:14px;line-height:1.6;margin:0 0 24px 0;word-break:break-all;background:${COLOR_BG_SOFT};padding:12px 14px;border-radius:8px;border:1px solid ${COLOR_BORDER};">
      <a href="${link}" style="color:${COLOR_TEXT};text-decoration:underline;">${link}</a>
    </p>`;
  const shareTextLines = shareLinks.map((share) => `${share.label}: ${share.url}`);
  const textBody =
    `${greetingName ? `Hallo ${greetingName},\n\n` : 'Hallo,\n\n'}` +
    `Schön, dass du dein Event mit der Community teilst! Dein Event "${event.title}" ist jetzt öffentlich sichtbar.\n\n` +
    `Event ansehen: ${link}\n\n` +
    `Hilf mit, dein Event zu verbreiten:\n` +
    `Je mehr Leute von deinem Event erfahren, desto mehr Menschen können teilnehmen. Teile den Link über deine bevorzugten Kanäle – oder leite diese E-Mail einfach weiter.\n\n` +
    `${shareTextLines.join('\n')}\n\n` +
    `Direkter Link zum Event: ${link}`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody + regionContactHtml(regionContactEmail)),
    text: textBody + regionContactText(regionContactEmail) + footerText(),
  };
}

export interface UnpublishedPayloadInput extends RegionContactInput {
  event: NotificationEvent;
  recipient: string;
}

export function buildUnpublishedPayload({
  event,
  recipient,
  regionContactEmail,
}: UnpublishedPayloadInput): EmailPayload {
  const link = eventUrl(event.slug);
  const greetingName = organizerDisplayName(event.organizer);
  const greeting = greetingName ? `Hallo ${escapeHtml(greetingName)},` : 'Hallo,';
  const subject = `Dein Event ist wieder ein Entwurf: ${event.title}`;
  const htmlBody = `
    <h1 style="${headingStyle(1)}">Dein Event ist wieder ein Entwurf</h1>
    <p style="${paragraphStyle()}">${greeting}</p>
    <p style="${paragraphStyle()}">
      Ein Admin hat dein Event <strong>${escapeHtml(event.title)}</strong> vorübergehend offline genommen, weil es noch Änderungen braucht. Es ist jetzt nicht mehr öffentlich sichtbar und liegt als Entwurf in deinem Verwaltungs-Bereich.
    </p>
    <p style="${paragraphStyle()}">
      Bitte überarbeite dein Event und reiche es danach erneut ein, damit wir es wieder veröffentlichen können. Falls dir ein Admin eine Nachricht hinterlassen hat, findest du sie direkt beim Event.
    </p>
    <p style="margin:8px 0 24px 0;">
      <a href="${link}" style="${brandButtonStyle()}">Event ansehen</a>
    </p>`;
  const textBody =
    `${greetingName ? `Hallo ${greetingName},\n\n` : 'Hallo,\n\n'}` +
    `Ein Admin hat dein Event "${event.title}" vorübergehend offline genommen, weil es noch Änderungen braucht. Es ist jetzt nicht mehr öffentlich sichtbar und liegt als Entwurf in deinem Verwaltungs-Bereich.\n\n` +
    `Bitte überarbeite dein Event und reiche es danach erneut ein, damit wir es wieder veröffentlichen können. Falls dir ein Admin eine Nachricht hinterlassen hat, findest du sie direkt beim Event.\n\n` +
    `Event ansehen: ${link}`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody + regionContactHtml(regionContactEmail)),
    text: textBody + regionContactText(regionContactEmail) + footerText(),
  };
}

export interface DeletedPayloadInput extends RegionContactInput {
  event: NotificationEvent;
  recipient: string;
  /** Set when an admin deleted the owner's event and had to give a reason. */
  reason?: string | null;
}

export function buildDeletedPayload({
  event,
  recipient,
  reason,
  regionContactEmail,
}: DeletedPayloadInput): EmailPayload {
  const greetingName = organizerDisplayName(event.organizer);
  const greeting = greetingName ? `Hallo ${escapeHtml(greetingName)},` : 'Hallo,';
  const subject = `Dein Event wurde gelöscht: ${event.title}`;
  const adminReason = typeof reason === 'string' ? reason.trim() : '';
  const restoreHtml = `Falls du es wiederherstellen möchtest, findest du es im Verwaltungs-Bereich unter „Papierkorb".`;
  const restoreText = `Falls du es wiederherstellen möchtest, findest du es im Verwaltungs-Bereich unter "Papierkorb".`;
  const htmlBody = adminReason
    ? `
    <h1 style="${headingStyle(1)}">Dein Event wurde gelöscht</h1>
    <p style="${paragraphStyle()}">${greeting}</p>
    <p style="${paragraphStyle()}">
      Ein Admin hat dein Event <strong>${escapeHtml(event.title)}</strong> gelöscht und in den Papierkorb verschoben. Der Grund dafür:
    </p>
    <blockquote style="margin:0 0 20px 0;padding:14px 18px;border-left:3px solid ${COLOR_PRIMARY};background:${COLOR_BG_SOFT};border-radius:0 6px 6px 0;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${COLOR_TEXT};white-space:pre-wrap;">${escapeHtml(adminReason)}</blockquote>
    <p style="${paragraphStyle()}">
      ${restoreHtml}
    </p>`
    : `
    <h1 style="${headingStyle(1)}">Dein Event wurde gelöscht</h1>
    <p style="${paragraphStyle()}">${greeting}</p>
    <p style="${paragraphStyle()}">
      Dein Event <strong>${escapeHtml(event.title)}</strong> wurde in den Papierkorb verschoben. ${restoreHtml}
    </p>`;
  const textBody = adminReason
    ? `${greetingName ? `Hallo ${greetingName},\n\n` : 'Hallo,\n\n'}` +
      `Ein Admin hat dein Event "${event.title}" gelöscht und in den Papierkorb verschoben. Der Grund dafür:\n\n` +
      `${adminReason}\n\n` +
      `${restoreText}`
    : `${greetingName ? `Hallo ${greetingName},\n\n` : 'Hallo,\n\n'}` +
      `Dein Event "${event.title}" wurde in den Papierkorb verschoben. ${restoreText}`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody + regionContactHtml(regionContactEmail)),
    text: textBody + regionContactText(regionContactEmail) + footerText(),
  };
}

/** "Samstag, 8. November 2026" for an ISO date (YYYY-MM-DD). */
export function formatGermanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export interface FavoriteCancelledPayloadInput {
  event: NotificationEvent;
  recipient: string;
  recipientName?: string | null;
  /** Cancelled dates (YYYY-MM-DD). Empty when every date of a series is cancelled. */
  dates: string[];
  wholeEvent: boolean;
}

export function buildFavoriteCancelledPayload({
  event,
  recipient,
  recipientName,
  dates,
  wholeEvent,
}: FavoriteCancelledPayloadInput): EmailPayload {
  const name = typeof recipientName === 'string' ? recipientName.trim() : '';
  const greetingHtml = name ? `Hallo ${escapeHtml(name)},` : 'Hallo,';
  const greetingText = name ? `Hallo ${name},` : 'Hallo,';
  const title = event.title || 'Ein Event';
  const formatted = dates.map(formatGermanDate);
  const url = eventUrl(event.slug);

  let subject: string;
  let sentenceHtml: string;
  let sentenceText: string;
  if (formatted.length === 0) {
    subject = `Abgesagt: ${title}`;
    sentenceHtml = `leider wurden alle Termine von <strong>${escapeHtml(title)}</strong> abgesagt. Das Event findet nicht statt.`;
    sentenceText = `leider wurden alle Termine von "${title}" abgesagt. Das Event findet nicht statt.`;
  } else if (formatted.length === 1) {
    subject = `Abgesagt: ${title} am ${formatted[0]}`;
    const which = wholeEvent ? 'das Event' : 'der Termin von';
    sentenceHtml = `leider wurde ${which} <strong>${escapeHtml(title)}</strong> am <strong>${escapeHtml(formatted[0])}</strong> abgesagt. Dieser Termin findet nicht statt.`;
    sentenceText = `leider wurde ${which} "${title}" am ${formatted[0]} abgesagt. Dieser Termin findet nicht statt.`;
  } else {
    subject = `Abgesagt: ${formatted.length} Termine von ${title}`;
    sentenceHtml = `leider wurden folgende Termine von <strong>${escapeHtml(title)}</strong> abgesagt:</p>
    <ul style="${paragraphStyle()}padding-left:20px;">${formatted
      .map((d) => `<li>${escapeHtml(d)}</li>`)
      .join('')}</ul>
    <p style="${paragraphStyle()}">Diese Termine finden nicht statt.`;
    sentenceText = `leider wurden folgende Termine von "${title}" abgesagt:\n${formatted
      .map((d) => `• ${d}`)
      .join('\n')}\nDiese Termine finden nicht statt.`;
  }

  const htmlBody = `
    <h1 style="${headingStyle(1)}">Leider abgesagt</h1>
    <p style="${paragraphStyle()}">${greetingHtml}</p>
    <p style="${paragraphStyle()}">${sentenceHtml}</p>
    <p style="${paragraphStyle()}">Du bekommst diese Nachricht, weil du das Event als Favorit gespeichert hast.</p>
    <p style="margin:8px 0 24px 0;">
      <a href="${url}" style="${brandButtonStyle()}">Event ansehen</a>
    </p>`;
  const textBody =
    `${greetingText}\n\n` +
    `${sentenceText}\n\n` +
    `Du bekommst diese Nachricht, weil du das Event als Favorit gespeichert hast.\n\n` +
    `Event ansehen: ${url}`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody, 'favorite'),
    text: textBody + footerText('favorite'),
  };
}

export interface PasswordResetPayloadInput {
  recipient: string;
  buttonUrl: string;
}

export function buildPasswordResetPayload({
  recipient,
  buttonUrl,
}: PasswordResetPayloadInput): EmailPayload {
  const link = escapeHtml(buttonUrl);
  const subject = 'Passwort zurücksetzen für Tribe';
  const htmlBody = `
    <h1 style="${headingStyle(1)}">Passwort zurücksetzen</h1>
    <p style="${paragraphStyle()}">Hallo,</p>
    <p style="${paragraphStyle()}">
      wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten. Klicke auf den Button, um ein neues Passwort zu vergeben.
    </p>
    <p style="margin:8px 0 24px 0;">
      <a href="${link}" style="${brandButtonStyle()}">Neues Passwort vergeben</a>
    </p>
    <p style="${mutedStyle()}">Direkter Link, falls der Button nicht funktioniert:</p>
    <p style="font-family:${BODY_FONT};font-size:14px;line-height:1.6;margin:0 0 24px 0;word-break:break-all;background:${COLOR_BG_SOFT};padding:12px 14px;border-radius:8px;border:1px solid ${COLOR_BORDER};">
      <a href="${link}" style="color:${COLOR_TEXT};text-decoration:underline;">${link}</a>
    </p>
    <p style="${mutedStyle()}">
      Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren – dein Passwort bleibt dann unverändert.
    </p>`;
  const textBody =
    `Hallo,\n\n` +
    `wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten. Klicke auf den Link, um ein neues Passwort zu vergeben:\n\n` +
    `${buttonUrl}\n\n` +
    `Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren – dein Passwort bleibt dann unverändert.`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody, 'auth'),
    text: textBody + footerText('auth'),
  };
}

export interface ContactMessagePayloadInput {
  context: ContactMessageContext;
  recipient: string;
}

export function buildContactMessagePayload({
  context,
  recipient,
}: ContactMessagePayloadInput): EmailPayload {
  const senderName = (context.name ?? '').trim() || 'Anonyme:r Besucher:in';
  const senderEmail = (context.email ?? '').trim();
  const pageLine = context.pageUrl
    ? `<p style="${mutedStyle()}">Seite: <a href="${escapeHtml(context.pageUrl)}" style="color:${COLOR_TEXT};text-decoration:underline;">${escapeHtml(context.pageTitle || context.pageUrl)}</a></p>`
    : '';
  const senderLine = senderEmail
    ? `<p style="${paragraphStyle()}">Absender: <strong>${escapeHtml(senderName)}</strong> &lt;<a href="mailto:${escapeHtml(senderEmail)}" style="color:${COLOR_TEXT};text-decoration:underline;">${escapeHtml(senderEmail)}</a>&gt;</p>`
    : `<p style="${paragraphStyle()}">Absender: <strong>${escapeHtml(senderName)}</strong> (keine E-Mail hinterlassen)</p>`;
  const link = `${APP_BASE_URL}/admin?tab=feedback`;
  const subject = `Neue Kontakt-Nachricht: ${senderName}`;
  const htmlBody = `
    <h1 style="${headingStyle(1)}">Neue Kontakt-Nachricht</h1>
    <p style="${paragraphStyle()}">Hallo,</p>
    ${senderLine}
    ${pageLine}
    <blockquote style="margin:0 0 20px 0;padding:14px 18px;border-left:3px solid ${COLOR_PRIMARY};background:${COLOR_BG_SOFT};border-radius:0 6px 6px 0;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${COLOR_TEXT};white-space:pre-wrap;">${escapeHtml(context.description)}</blockquote>
    <p style="margin:8px 0 24px 0;">
      <a href="${link}" style="${brandButtonStyle()}">Im Verwaltungs-Bereich ansehen</a>
    </p>`;
  const senderLineText = senderEmail
    ? `${senderName} <${senderEmail}>`
    : `${senderName} (keine E-Mail hinterlassen)`;
  const pageLineText = context.pageUrl
    ? `\nSeite: ${context.pageTitle ? `${context.pageTitle} – ` : ''}${context.pageUrl}\n`
    : '';
  const textBody =
    `Hallo,\n\n` +
    `Neue Kontakt-Nachricht von ${senderLineText}.\n` +
    pageLineText +
    `\nNachricht:\n` +
    `${context.description}\n\n` +
    `Im Verwaltungs-Bereich ansehen: ${link}`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody),
    text: textBody + footerText(),
  };
}

export function buildEmailPayload(
  type: NotificationType,
  input:
    | SubmittedPayloadInput
    | ChangesRequestedPayloadInput
    | PublishedPayloadInput
    | UnpublishedPayloadInput
    | DeletedPayloadInput
    | ContactMessagePayloadInput
): EmailPayload {
  switch (type) {
    case 'submitted':
      return buildSubmittedPayload(input as SubmittedPayloadInput);
    case 'changes_requested':
      return buildChangesRequestedPayload(input as ChangesRequestedPayloadInput);
    case 'published':
      return buildPublishedPayload(input as PublishedPayloadInput);
    case 'unpublished':
      return buildUnpublishedPayload(input as UnpublishedPayloadInput);
    case 'deleted':
      return buildDeletedPayload(input as DeletedPayloadInput);
    case 'contact_message':
      return buildContactMessagePayload(input as ContactMessagePayloadInput);
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown notification type: ${exhaustive as string}`);
    }
  }
}
