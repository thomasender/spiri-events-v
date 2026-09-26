export type NotificationType =
  'submitted' | 'changes_requested' | 'published' | 'deleted' | 'contact_message';

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
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const APP_BASE_URL = 'https://www.thetribe.at';

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
          <img src="${BRAND_LOGO_URL}" alt="tribe Vorarlberg" width="40" height="40" style="display:block;border:0;outline:none;text-decoration:none;" />
        </td>
        <td style="vertical-align:middle;">
          <span style="font-family:${HEADING_FONT};font-size:22px;font-weight:500;color:${COLOR_TEXT};letter-spacing:0.01em;">tribe Vorarlberg</span>
        </td>
      </tr>
    </table>`;
}

type FooterKind = 'notification' | 'auth';

function footerHtml(kind: FooterKind = 'notification'): string {
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
  <title>tribe Vorarlberg</title>
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
    © tribe Vorarlberg
  </div>
</body>
</html>`;
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
  const subject = `Neuer Event-Vorschlag: ${event.title}`;
  const htmlBody = `
    <h1 style="${headingStyle(1)}">Neuer Event-Vorschlag</h1>
    <p style="${paragraphStyle()}">Hallo,</p>
    <p style="${paragraphStyle()}">
      <strong>${escapeHtml(submitter)}</strong> hat ein neues Event zur Prüfung eingereicht:
    </p>
    <p style="${paragraphStyle()}"><strong>${escapeHtml(event.title)}</strong></p>
    <p style="margin:8px 0 24px 0;">
      <a href="${link}" style="${brandButtonStyle()}">Im Review ansehen</a>
    </p>`;
  const textBody =
    `Hallo,\n\n` +
    `${submitter} hat ein neues Event zur Prüfung eingereicht:\n` +
    `${event.title}\n\n` +
    `Im Review ansehen: ${link}`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody),
    text: textBody + footerText(),
  };
}

export interface ChangesRequestedPayloadInput {
  event: NotificationEvent;
  context: AdminMessageContext;
  recipient: string;
}

export function buildChangesRequestedPayload({
  event,
  context,
  recipient,
}: ChangesRequestedPayloadInput): EmailPayload {
  const link = eventUrl(event.slug);
  const messageText = context.text.trim();
  const author = (context.authorName ?? '').trim() || 'Das tribe-Team';
  const greetingName = organizerDisplayName(event.organizer);
  const greeting = greetingName ? `Hallo ${escapeHtml(greetingName)},` : 'Hallo,';
  const subject = `Änderungen gewünscht: ${event.title}`;
  const htmlBody = `
    <h1 style="${headingStyle(1)}">Änderungen gewünscht</h1>
    <p style="${paragraphStyle()}">${greeting}</p>
    <p style="${paragraphStyle()}">
      ${escapeHtml(author)} hat sich dein Event angesehen und wünscht folgende Änderung:
    </p>
    <blockquote style="margin:0 0 20px 0;padding:14px 18px;border-left:3px solid ${COLOR_PRIMARY};background:${COLOR_BG_SOFT};border-radius:0 6px 6px 0;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${COLOR_TEXT};white-space:pre-wrap;">${escapeHtml(messageText)}</blockquote>
    <p style="${paragraphStyle()}">
      Du kannst das Event direkt öffnen und die Änderungen vornehmen:
    </p>
    <p style="margin:8px 0 24px 0;">
      <a href="${link}" style="${brandButtonStyle()}">Event bearbeiten</a>
    </p>`;
  const textBody =
    `${greetingName ? `Hallo ${greetingName},\n\n` : 'Hallo,\n\n'}` +
    `${author} hat sich dein Event angesehen und wünscht folgende Änderung:\n\n` +
    `${messageText}\n\n` +
    `Event bearbeiten: ${link}`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody),
    text: textBody + footerText(),
  };
}

export interface PublishedPayloadInput {
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

export function buildPublishedPayload({ event, recipient }: PublishedPayloadInput): EmailPayload {
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
    html: wrapHtml(htmlBody),
    text: textBody + footerText(),
  };
}

export interface DeletedPayloadInput {
  event: NotificationEvent;
  recipient: string;
}

export function buildDeletedPayload({ event, recipient }: DeletedPayloadInput): EmailPayload {
  const greetingName = organizerDisplayName(event.organizer);
  const greeting = greetingName ? `Hallo ${escapeHtml(greetingName)},` : 'Hallo,';
  const subject = `Dein Event wurde gelöscht: ${event.title}`;
  const htmlBody = `
    <h1 style="${headingStyle(1)}">Dein Event wurde gelöscht</h1>
    <p style="${paragraphStyle()}">${greeting}</p>
    <p style="${paragraphStyle()}">
      Dein Event <strong>${escapeHtml(event.title)}</strong> wurde in den Papierkorb verschoben. Falls du es wiederherstellen möchtest, findest du es im Verwaltungs-Bereich unter „Papierkorb".
    </p>`;
  const textBody =
    `${greetingName ? `Hallo ${greetingName},\n\n` : 'Hallo,\n\n'}` +
    `Dein Event "${event.title}" wurde in den Papierkorb verschoben. Falls du es wiederherstellen möchtest, findest du es im Verwaltungs-Bereich unter "Papierkorb".`;
  return {
    to: recipient,
    subject,
    html: wrapHtml(htmlBody),
    text: textBody + footerText(),
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
  const subject = 'Passwort zurücksetzen für tribe Vorarlberg';
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
