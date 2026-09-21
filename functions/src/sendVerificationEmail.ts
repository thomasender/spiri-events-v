import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  MAILGUN_EU_BASE,
  sendMailgunMessage,
} from './mailgun';

const APP_URL = 'https://thetribe.at';

function parseOobCode(magicLink: string): string | null {
  try {
    const url = new URL(magicLink);
    return url.searchParams.get('oobCode');
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmail(args: { displayName: string; buttonUrl: string; appName: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const displayName = escapeHtml(args.displayName);
  const buttonUrl = escapeHtml(args.buttonUrl);
  const appName = escapeHtml(args.appName);
  const subject = `Bestätige deine E-Mail-Adresse für ${appName}`;
  const html = `<!DOCTYPE html><html lang="de"><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf7f2;padding:24px;margin:0;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;padding:32px;border-radius:8px;">
    <h1 style="color:#4a5d23;font-size:20px;margin-top:0;">Hallo ${displayName},</h1>
    <p style="font-size:15px;line-height:1.5;color:#222;">bitte bestätige deine E-Mail-Adresse, damit dein Account aktiviert wird.</p>
    <p style="text-align:center;margin:32px 0;">
      <a href="${buttonUrl}" style="background:#4a5d23;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;font-size:15px;">E-Mail bestätigen</a>
    </p>
    <p style="color:#666;font-size:12px;line-height:1.5;word-break:break-all;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br><span>${buttonUrl}</span></p>
    <p style="color:#999;font-size:11px;margin-top:24px;">Wenn du diese E-Mail nicht angefordert hast, kannst du sie ignorieren.</p>
  </div>
</body></html>`;
  const text = `Hallo ${args.displayName},\n\nbitte bestätige deine E-Mail-Adresse, damit dein Account aktiviert wird:\n${args.buttonUrl}\n\nLiebe Grüße,\ndas ${appName} Team`;
  return { subject, html, text };
}

export const sendVerificationEmail = onCall(
  {
    region: 'europe-west3',
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO],
    cors: ['https://www.thetribe.at', 'https://thetribe.at', 'https://spirieventsvbg.web.app'],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const payload = (request.data ?? {}) as { userId?: string };
    const userId = payload.userId;
    if (typeof userId !== 'string' || !userId) {
      throw new HttpsError('invalid-argument', 'userId is required.');
    }
    if (request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'Can only request your own email.');
    }

    const auth = getAuth();
    const user = await auth.getUser(userId);
    if (!user.email) {
      throw new HttpsError('failed-precondition', 'User has no email address.');
    }

    const magicLink = await auth.generateEmailVerificationLink(user.email, {
      url: `${APP_URL}/auth-action?mode=verifyEmail`,
    });
    const oobCode = parseOobCode(magicLink);
    if (!oobCode) {
      throw new HttpsError('internal', 'Could not generate verification link.');
    }

    const buttonUrl = `${APP_URL}/auth-action?mode=verifyEmail&oobCode=${encodeURIComponent(oobCode)}`;
    const displayName = user.displayName || user.email;
    const appName = process.env.APP_DISPLAY_NAME || 'tribe Vorarlberg';
    const { subject, html, text } = renderEmail({ displayName, buttonUrl, appName });

    const apiKey = MAILGUN_API_KEY.value();
    const domain = MAILGUN_DOMAIN.value();
    const from = MAILGUN_FROM.value();
    const replyTo = MAILGUN_REPLY_TO.value();
    if (!apiKey || !domain || !from) {
      throw new HttpsError('internal', 'Mailgun credentials are not configured.');
    }

    await sendMailgunMessage(MAILGUN_EU_BASE, {
      apiKey,
      domain,
      from,
      to: user.email,
      subject,
      text,
      html,
      replyTo: replyTo ?? undefined,
    });
    logger.info('Sent verification email', { userId, email: user.email });
    return { sent: true };
  }
);
