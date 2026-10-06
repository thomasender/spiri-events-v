import { logger } from 'firebase-functions';
import { getAdminEmails } from './adminEmails';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  MAILGUN_EU_BASE,
  sendMailgunMessage,
  isMailgunDryRun,
} from './mailgun';

/** Secrets any function using notifyAdmins must declare. */
export const ADMIN_MAIL_SECRETS = [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Mails every admin via Mailgun. Callers must only pass sanitised text. */
export async function notifyAdmins(subject: string, text: string): Promise<void> {
  if (isMailgunDryRun(process.env)) {
    logger.info('MAILGUN dry-run: would send admin mail', { subject });
    return;
  }
  const apiKey = MAILGUN_API_KEY.value();
  const domain = MAILGUN_DOMAIN.value();
  const from = MAILGUN_FROM.value();
  if (!apiKey || !domain || !from) {
    logger.error('Mailgun secrets are not configured; admin mail not sent', { subject });
    return;
  }
  const recipients = await getAdminEmails();
  const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
  for (const to of recipients) {
    await sendMailgunMessage(MAILGUN_EU_BASE, {
      apiKey,
      domain,
      from,
      to,
      subject,
      text,
      html,
      replyTo: MAILGUN_REPLY_TO.value() || undefined,
    });
  }
}
