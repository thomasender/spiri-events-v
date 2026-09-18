export type NotificationType = 'submitted' | 'changes_requested' | 'published' | 'deleted';

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

export const APP_BASE_URL = 'https://events.thetribe.at';

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
  return `${APP_BASE_URL}/admin/review#${eventId}`;
}

function footerHtml(): string {
  return `
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e0d8;font-size:12px;color:#5b5a55;">
      Du erhältst diese E-Mail, weil du auf tribe Events ein Event eingereicht hast oder verwaltest.
      Bei Fragen wende dich an <a href="mailto:events@thetribe.at" style="color:#5b5a55;">events@thetribe.at</a>.
    </p>`;
}

function footerText(): string {
  return `\n--\nDu erhältst diese E-Mail, weil du auf tribe Events ein Event eingereicht hast oder verwaltest.\nBei Fragen wende dich an events@thetribe.at.`;
}

function wrapHtml(body: string): string {
  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>tribe Events</title></head>
<body style="font-family:Inter,Helvetica,Arial,sans-serif;color:#1f1f1d;background:#faf9f5;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;margin:0 0 16px 0;color:#1f1f1d;">tribe Events</h1>
    ${body}
    ${footerHtml()}
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
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px 0;">Hallo,</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px 0;">
      <strong>${escapeHtml(submitter)}</strong> hat ein neues Event zur Prüfung eingereicht:
    </p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px 0;"><strong>${escapeHtml(event.title)}</strong></p>
    <p style="margin:0 0 24px 0;">
      <a href="${link}" style="display:inline-block;background:#1f1f1d;color:#faf9f5;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;">Im Review ansehen</a>
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
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px 0;">${greeting}</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px 0;">
      ${escapeHtml(author)} hat sich dein Event angesehen und wünscht folgende Änderung:
    </p>
    <blockquote style="margin:0 0 16px 0;padding:12px 16px;border-left:3px solid #c2bdb1;background:#faf9f5;font-size:14px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(messageText)}</blockquote>
    <p style="font-size:14px;line-height:1.5;margin:0 0 24px 0;">
      Du kannst das Event direkt öffnen und die Änderungen vornehmen:
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="${link}" style="display:inline-block;background:#1f1f1d;color:#faf9f5;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;">Event bearbeiten</a>
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

export function buildPublishedPayload({ event, recipient }: PublishedPayloadInput): EmailPayload {
  const link = eventUrl(event.slug);
  const greetingName = organizerDisplayName(event.organizer);
  const greeting = greetingName ? `Hallo ${escapeHtml(greetingName)},` : 'Hallo,';
  const subject = `Dein Event ist live: ${event.title}`;
  const htmlBody = `
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px 0;">${greeting}</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px 0;">
      Schön, dass du dein Event mit der Community teilst! Dein Event <strong>${escapeHtml(event.title)}</strong> ist jetzt öffentlich sichtbar.
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="${link}" style="display:inline-block;background:#1f1f1d;color:#faf9f5;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;">Event ansehen</a>
    </p>`;
  const textBody =
    `${greetingName ? `Hallo ${greetingName},\n\n` : 'Hallo,\n\n'}` +
    `Schön, dass du dein Event mit der Community teilst! Dein Event "${event.title}" ist jetzt öffentlich sichtbar.\n\n` +
    `Event ansehen: ${link}`;
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
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px 0;">${greeting}</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px 0;">
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

export function buildEmailPayload(
  type: NotificationType,
  input:
    | SubmittedPayloadInput
    | ChangesRequestedPayloadInput
    | PublishedPayloadInput
    | DeletedPayloadInput
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
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown notification type: ${exhaustive as string}`);
    }
  }
}
