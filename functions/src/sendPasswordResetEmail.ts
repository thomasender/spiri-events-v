import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  MAILGUN_EU_BASE,
  isMailgunDryRun,
  sendMailgunMessage,
} from './mailgun';
import { APP_BASE_URL, buildPasswordResetPayload } from './emailTemplates';
import { enforceRateLimit, RATE_LIMIT_PRESETS } from './rateLimit';

function parseOobCode(magicLink: string): string | null {
  try {
    const url = new URL(magicLink);
    return url.searchParams.get('oobCode');
  } catch {
    return null;
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export const sendPasswordResetEmailFn = onCall(
  {
    region: 'europe-west3',
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO],
    cors: ['https://www.thetribe.at', 'https://thetribe.at', 'https://spirieventsvbg.web.app'],
  },
  async (request) => {
    enforceRateLimit(request, 'passwordReset', RATE_LIMIT_PRESETS.passwordReset);

    const payload = (request.data ?? {}) as { email?: unknown };
    const email = normalizeEmail(payload.email);
    if (!email) {
      throw new HttpsError('invalid-argument', 'A valid email address is required.');
    }

    const auth = getAuth();
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        logger.info('Password reset requested for unknown email', { email });
        return { sent: false };
      }
      logger.error('Failed to look up user for password reset', err);
      throw new HttpsError('internal', 'Could not process the password reset request.');
    }

    const magicLink = await auth.generatePasswordResetLink(email, {
      url: `${APP_BASE_URL}/auth-action?mode=resetPassword`,
    });
    const oobCode = parseOobCode(magicLink);
    if (!oobCode) {
      throw new HttpsError('internal', 'Could not generate password reset link.');
    }

    const buttonUrl = `${APP_BASE_URL}/auth-action?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
    const { subject, html, text } = buildPasswordResetPayload({
      recipient: email,
      buttonUrl,
    });

    const apiKey = MAILGUN_API_KEY.value();
    const domain = MAILGUN_DOMAIN.value();
    const from = MAILGUN_FROM.value();
    const replyTo = MAILGUN_REPLY_TO.value();
    const dryRun = isMailgunDryRun(process.env);
    if (!dryRun && (!apiKey || !domain || !from)) {
      throw new HttpsError('internal', 'Mailgun credentials are not configured.');
    }

    if (dryRun) {
      logger.info('MAILGUN dry-run: would send password reset email', {
        to: email,
        subject,
        buttonUrl,
        htmlLength: html.length,
        textLength: text.length,
      });
      return { sent: true };
    }

    await sendMailgunMessage(MAILGUN_EU_BASE, {
      apiKey: apiKey ?? '',
      domain: domain ?? '',
      from: from ?? '',
      to: email,
      subject,
      text,
      html,
      replyTo: replyTo ?? undefined,
    });
    logger.info('Sent password reset email', { email, uid: userRecord.uid });
    return { sent: true };
  }
);
