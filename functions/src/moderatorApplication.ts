import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  MAILGUN_EU_BASE,
  isMailgunDryRun,
  sendMailgunMessage,
  type MailgunInlineImage,
} from './mailgun';
import { enforceRateLimit, RATE_LIMIT_PRESETS } from './rateLimit';
import { isRegionId } from './regions';
import { REGION_DATA } from './regionData';

/** Applications for the role "Regions-Moderator:in" go to the admins' inbox. */
export const MODERATOR_APPLICATION_INBOX = 'admin@thetribe.at';

export const NAME_MAX = 80;
export const MESSAGE_MIN = 20;
export const MESSAGE_MAX = 1500;
/** Decoded size limit of the optional photo (the browser already shrinks it). */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export interface ModeratorApplication {
  name: string;
  email: string;
  message: string;
  regionId: string | null;
  photo: { filename: string; contentType: string; data: Buffer } | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Image type from the first bytes (never trust the declared type). */
export function sniffImageType(data: Buffer): { contentType: string; extension: string } | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  return null;
}

/**
 * Validates the form data of an application. Throws HttpsError('invalid-argument')
 * with a short reason; the photo is optional but must be a real image.
 */
export function validateModeratorApplication(raw: unknown): ModeratorApplication {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // Honeypot: a hidden field real visitors never fill in.
  if (str(data.website)) throw new HttpsError('invalid-argument', 'Invalid request.');

  const name = str(data.name);
  if (name.length < 2 || name.length > NAME_MAX) {
    throw new HttpsError('invalid-argument', 'Please enter your name.');
  }
  const email = str(data.email).toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.');
  }
  const message = str(data.message);
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    throw new HttpsError('invalid-argument', 'Please tell us a bit about yourself.');
  }
  const regionRaw = str(data.regionId);
  if (regionRaw && !isRegionId(regionRaw)) {
    throw new HttpsError('invalid-argument', 'Unknown region.');
  }

  let photo: ModeratorApplication['photo'] = null;
  if (data.photoBase64 !== undefined && data.photoBase64 !== null && data.photoBase64 !== '') {
    if (typeof data.photoBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'Invalid photo.');
    }
    // Upper bound before decoding so a huge string is never turned into a buffer.
    if (data.photoBase64.length > Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 8) {
      throw new HttpsError('invalid-argument', 'The photo is too large.');
    }
    const bytes = Buffer.from(data.photoBase64, 'base64');
    const type = sniffImageType(bytes);
    if (!type || bytes.length === 0 || bytes.length > PHOTO_MAX_BYTES) {
      throw new HttpsError('invalid-argument', 'The photo must be a JPEG, PNG or WebP image.');
    }
    photo = { filename: `bewerbung.${type.extension}`, contentType: type.contentType, data: bytes };
  }

  return { name, email, message, regionId: regionRaw || null, photo };
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const regionName = (id: string | null): string =>
  (id && REGION_DATA.find((r) => r.slug === id)?.name) || 'keine bestimmte Region';

/** Subject, plain text and HTML of the mail to the admins. */
export function buildModeratorApplicationEmail(app: ModeratorApplication): {
  subject: string;
  text: string;
  html: string;
} {
  const region = regionName(app.regionId);
  const subject = `Bewerbung als Moderator:in: ${app.name} (${region})`;
  const text = [
    'Neue Bewerbung als Moderator:in',
    '',
    `Name: ${app.name}`,
    `Antwort an: ${app.email}`,
    `Region: ${region}`,
    app.photo ? 'Foto: siehe Anhang' : 'Foto: keines',
    '',
    app.message,
    '',
    'Antworten geht direkt mit "Antworten" auf diese Mail.',
  ].join('\n');
  const photoHtml = app.photo
    ? `<p><img src="cid:${app.photo.filename}" alt="Foto von ${escapeHtml(app.name)}" width="160" style="border-radius:8px;max-width:160px" /></p>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">
<h2 style="margin:0 0 12px">Neue Bewerbung als Moderator:in</h2>
${photoHtml}
<p><strong>Name:</strong> ${escapeHtml(app.name)}<br/>
<strong>Antwort an:</strong> <a href="mailto:${escapeHtml(app.email)}">${escapeHtml(app.email)}</a><br/>
<strong>Region:</strong> ${escapeHtml(region)}</p>
<p style="white-space:pre-wrap">${escapeHtml(app.message)}</p>
<p style="color:#666;font-size:13px">Antworten geht direkt mit „Antworten“ auf diese Mail.</p>
</div>`;
  return { subject, text, html };
}

export const submitModeratorApplication = onCall(
  {
    region: 'europe-west3',
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM],
    cors: ALLOWED_ORIGINS,
    ...appCheckOptions(),
  },
  async (request) => {
    logMissingAppCheck('submitModeratorApplication', request);
    enforceRateLimit(request, 'moderatorApplication', RATE_LIMIT_PRESETS.moderatorApplication);

    const app = validateModeratorApplication(request.data);
    const { subject, text, html } = buildModeratorApplicationEmail(app);
    const inlineImages: MailgunInlineImage[] = app.photo ? [app.photo] : [];

    const apiKey = MAILGUN_API_KEY.value();
    const domain = MAILGUN_DOMAIN.value();
    const from = MAILGUN_FROM.value();
    if (isMailgunDryRun(process.env)) {
      logger.info('MAILGUN dry-run: would send moderator application', {
        to: MODERATOR_APPLICATION_INBOX,
        subject,
        hasPhoto: Boolean(app.photo),
      });
      return { sent: true };
    }
    if (!apiKey || !domain || !from) {
      throw new HttpsError('internal', 'Mailgun credentials are not configured.');
    }

    await sendMailgunMessage(MAILGUN_EU_BASE, {
      apiKey,
      domain,
      from,
      to: MODERATOR_APPLICATION_INBOX,
      subject,
      text,
      html,
      replyTo: app.email,
      inlineImages,
    });
    logger.info('Sent moderator application', { regionId: app.regionId, hasPhoto: !!app.photo });
    return { sent: true };
  }
);
