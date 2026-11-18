import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { ADMIN_MAIL_SECRETS, notifyAdmins } from './adminNotify';
import { getAdminEmails } from './adminEmails';
import { inviteBaseUrl } from './moderatorInvites';
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
import { isRegionId, regionNameOf } from './regions';
import {
  APPLICATIONS_COLLECTION,
  applicationNotifications,
  buildApplicationReminderMail,
  isReminderDue,
  reminderNotifications,
  type StaffDocEntry,
  type StaffNotificationInput,
} from './staffNotifications';
import {
  addStaffNotificationsToBatch,
  loadStaffDocs,
  toApplicationRecord,
  writeStaffNotifications,
} from './staffNotificationsStore';

/*
 * Applications for the role "Regions-Moderator:in" (Trello 6afc59ed): stored
 * in `moderator_applications`, a note in the admin area ("Team-Hinweise") for
 * the moderators of the region and the Super-Admins, and a mail (with the
 * photo) to the Super-Admins. The shared inbox admin@thetribe.at no longer
 * gets them. Applications older than this change exist only as mails.
 */

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
  (id && regionNameOf(id)) || 'keine bestimmte Region';

/** Subject, plain text and HTML of the mail to the Super-Admins. */
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

/** What the submit handler needs from Firebase / Mailgun (injected for tests). */
export interface ApplicationDeps {
  loadStaffDocs: () => Promise<StaffDocEntry[]>;
  newApplicationId: () => string;
  /** Writes the application and its notes in one batch. */
  saveApplication: (
    id: string,
    app: Omit<ModeratorApplication, 'photo'> & { hasPhoto: boolean },
    notifications: StaffNotificationInput[]
  ) => Promise<void>;
  getSuperAdminEmails: () => Promise<string[]>;
  /** Sends one mail; throws on failure. */
  sendMail: (mail: {
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo: string;
    inlineImages: MailgunInlineImage[];
  }) => Promise<void>;
}

/**
 * Stores the application, writes one note per recipient and mails the
 * Super-Admins. The mail is best effort: the application is already saved and
 * visible in the admin area when it fails.
 */
export async function storeModeratorApplication(
  app: ModeratorApplication,
  deps: ApplicationDeps
): Promise<{ applicationId: string; mailed: number }> {
  const applicationId = deps.newApplicationId();
  const hasPhoto = Boolean(app.photo);
  const notifications = applicationNotifications(await deps.loadStaffDocs(), applicationId, {
    ...app,
    hasPhoto,
  });
  await deps.saveApplication(
    applicationId,
    { name: app.name, email: app.email, message: app.message, regionId: app.regionId, hasPhoto },
    notifications
  );

  const { subject, text, html } = buildModeratorApplicationEmail(app);
  const inlineImages: MailgunInlineImage[] = app.photo ? [app.photo] : [];
  let mailed = 0;
  try {
    for (const to of await deps.getSuperAdminEmails()) {
      await deps.sendMail({ to, subject, text, html, replyTo: app.email, inlineImages });
      mailed += 1;
    }
  } catch (err) {
    logger.error('Mailing the moderator application failed', { applicationId, err });
  }
  return { applicationId, mailed };
}

async function sendApplicationMail(mail: Parameters<ApplicationDeps['sendMail']>[0]) {
  if (isMailgunDryRun(process.env)) {
    logger.info('MAILGUN dry-run: would send moderator application', {
      to: mail.to,
      subject: mail.subject,
      hasPhoto: mail.inlineImages.length > 0,
    });
    return;
  }
  const apiKey = MAILGUN_API_KEY.value();
  const domain = MAILGUN_DOMAIN.value();
  const from = MAILGUN_FROM.value();
  if (!apiKey || !domain || !from) {
    throw new Error('Mailgun credentials are not configured.');
  }
  await sendMailgunMessage(MAILGUN_EU_BASE, { apiKey, domain, from, ...mail });
}

function firestoreApplicationDeps(): ApplicationDeps {
  const db = getFirestore();
  return {
    loadStaffDocs,
    newApplicationId: () => db.collection(APPLICATIONS_COLLECTION).doc().id,
    async saveApplication(id, app, notifications) {
      const batch = db.batch();
      batch.create(db.collection(APPLICATIONS_COLLECTION).doc(id), {
        ...app,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
        reminderSentAt: null,
        invitedAt: null,
        invitedBy: null,
        inviteId: null,
        doneAt: null,
        acceptedUid: null,
      });
      addStaffNotificationsToBatch(batch, notifications);
      await batch.commit();
    },
    getSuperAdminEmails: getAdminEmails,
    sendMail: sendApplicationMail,
  };
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
    const { applicationId, mailed } = await storeModeratorApplication(
      app,
      firestoreApplicationDeps()
    );
    logger.info('Stored moderator application', {
      applicationId,
      regionId: app.regionId,
      hasPhoto: !!app.photo,
      mailed,
    });
    return { sent: true };
  }
);

/**
 * Daily: an application nobody has invited for three days reminds the
 * Super-Admins once (note + mail). `reminderSentAt` is claimed in a
 * transaction first, so a retried run never sends a second reminder.
 */
export const remindOpenModeratorApplications = onSchedule(
  {
    region: 'europe-west3',
    schedule: 'every day 09:15',
    timeZone: 'Europe/Vienna',
    secrets: ADMIN_MAIL_SECRETS,
  },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    const snap = await db.collection(APPLICATIONS_COLLECTION).where('status', '==', 'open').get();
    const due = snap.docs.filter((d) => isReminderDue(toApplicationRecord(d.data()), now));
    if (due.length === 0) return;

    const staffDocs = await loadStaffDocs();
    const adminUrl = `${inviteBaseUrl()}/admin?tab=team`;
    let sent = 0;
    for (const d of due) {
      const claimed = await db.runTransaction(async (t) => {
        const fresh = await t.get(d.ref);
        if (!fresh.exists || !isReminderDue(toApplicationRecord(fresh.data() ?? {}), now)) {
          return false;
        }
        t.update(d.ref, { reminderSentAt: FieldValue.serverTimestamp() });
        return true;
      });
      if (!claimed) continue;
      const app = toApplicationRecord(d.data());
      try {
        await writeStaffNotifications(reminderNotifications(staffDocs, d.id, app));
        const mail = buildApplicationReminderMail(
          app,
          app.regionId ? (regionNameOf(app.regionId) ?? null) : null,
          adminUrl
        );
        await notifyAdmins(mail.subject, mail.text);
        sent += 1;
      } catch (err) {
        logger.error('Moderator application reminder failed', { applicationId: d.id, err });
      }
    }
    logger.info('remindOpenModeratorApplications', { due: due.length, sent });
  }
);
