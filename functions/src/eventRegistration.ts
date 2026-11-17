import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  MAILGUN_EU_BASE,
  isMailgunDryRun,
  sendMailgunMessage,
} from './mailgun';
import {
  EmailPayload,
  buildEventRegistrationConfirmationPayload,
  buildEventRegistrationOrganizerPayload,
  withSiteOrigin,
} from './emailTemplates';
import { checkRateLimit, enforceRateLimit, recordRateLimitAttempt } from './rateLimit';
import { requestSiteOrigin } from './siteOrigin';
import { getUserSiteOrigin } from './userPreferences';
import { todayInVienna } from './eventCancellation';
import {
  EVENT_REGISTRATION_RATE_LIMITS,
  confirmationMarkerId,
  pickOrganizerEmail,
  registrationClosedReason,
  validateEventRegistration,
} from './eventRegistrationLogic';

if (getApps().length === 0) {
  initializeApp();
}

/** Subcollections of events/{id}; both are deleted once the event is over (purgeExpiredEvents). */
export const REGISTRATIONS_COLLECTION = 'registrations';
export const REGISTRATION_MAIL_MARKERS = 'registration_mails';

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Throws resource-exhausted when the contact or the event saw too many registrations. */
function enforceKeyedLimit(key: string, options: { maxAttempts: number; windowMs: number }) {
  const status = checkRateLimit(key, options);
  if (!status.allowed) {
    logger.warn('Rate limit exceeded', { key, retryAfterMs: status.retryAfterMs });
    throw new HttpsError('resource-exhausted', 'Too many registrations. Please try again later.', {
      retryAfterMs: status.retryAfterMs,
    });
  }
  recordRateLimitAttempt(key, options);
}

async function organizerAccount(
  uid: string | null
): Promise<{ email: string | null; displayName: string | null }> {
  if (!uid) return { email: null, displayName: null };
  try {
    const user = await getAuth().getUser(uid);
    if (user.disabled) return { email: null, displayName: null };
    return { email: user.email ?? null, displayName: user.displayName ?? null };
  } catch {
    // Account deleted (or never existed): fall back to the event's own contact data.
    return { email: null, displayName: null };
  }
}

/**
 * "Zum Event anmelden" (docs/event-registration.md): validates the form, stores the
 * registration (events/{id}/registrations, no client access), mails the organizer
 * and, with an e-mail address, the person who registered (once per event and
 * address). Signed-in callers get the event as favorite. Pure notification: no
 * participant list, no seat limit.
 */
export const submitEventRegistration = onCall(
  {
    region: 'europe-west3',
    secrets: [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO],
    cors: ALLOWED_ORIGINS,
    ...appCheckOptions(),
  },
  async (request) => {
    logMissingAppCheck('submitEventRegistration', request);
    enforceRateLimit(request, 'eventRegistration', EVENT_REGISTRATION_RATE_LIMITS.caller);

    const input = validateEventRegistration(request.data);
    enforceKeyedLimit(
      `eventRegistration:contact:${input.contact}`,
      EVENT_REGISTRATION_RATE_LIMITS.contact
    );
    enforceKeyedLimit(
      `eventRegistration:event:${input.eventId}`,
      EVENT_REGISTRATION_RATE_LIMITS.event
    );

    const db = getFirestore();
    const eventRef = db.doc(`events/${input.eventId}`);
    const eventSnap = await eventRef.get();
    const eventData = eventSnap.exists ? (eventSnap.data() ?? {}) : null;
    const closed = registrationClosedReason(eventData, todayInVienna());
    if (closed || !eventData) {
      throw new HttpsError('failed-precondition', 'Registration is not possible for this event.', {
        reason: closed ?? 'not_found',
      });
    }

    const uid = request.auth?.uid ?? null;
    await eventRef.collection(REGISTRATIONS_COLLECTION).add({
      name: input.name,
      contact: input.contact,
      contactType: input.contactType,
      occurrenceDate: input.occurrenceDate,
      uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    let favorite = false;
    if (uid) {
      try {
        const favRef = db.doc(`users/${uid}/favorites/${input.eventId}`);
        if (!(await favRef.get()).exists) {
          await favRef.set({ createdAt: FieldValue.serverTimestamp() });
        }
        favorite = true;
      } catch (err) {
        logger.error('Could not save favorite for registration', { eventId: input.eventId, err });
      }
    }

    const event = { title: readText(eventData.title) ?? '', slug: readText(eventData.slug) };
    const organizerUid = readText(eventData.createdBy);
    const organizerData = (eventData.organizer ?? {}) as Record<string, unknown>;
    const account = await organizerAccount(organizerUid);
    const organizerEmail = pickOrganizerEmail({
      accountEmail: account.email,
      organizerEmail: organizerData.email,
      kontakt: eventData.kontakt,
    });

    const dryRun = isMailgunDryRun(process.env);
    const apiKey = MAILGUN_API_KEY.value() ?? '';
    const domain = MAILGUN_DOMAIN.value() ?? '';
    const from = MAILGUN_FROM.value() ?? '';
    const defaultReplyTo = readText(MAILGUN_REPLY_TO.value());
    const mailReady = dryRun || Boolean(apiKey && domain && from);
    if (!mailReady) logger.error('Mailgun secrets are not configured; registration mails skipped');
    const log = { eventId: input.eventId, contactType: input.contactType, signedIn: !!uid };

    const send = async (payload: EmailPayload, replyTo: string | null, kind: string) => {
      if (!mailReady) return false;
      if (dryRun) {
        logger.info(`MAILGUN dry-run: would send ${kind}`, { ...log, subject: payload.subject });
        return true;
      }
      try {
        await sendMailgunMessage(MAILGUN_EU_BASE, {
          apiKey,
          domain,
          from,
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          replyTo: replyTo ?? undefined,
        });
        return true;
      } catch (err) {
        logger.error(`${kind} failed`, { ...log, err });
        return false;
      }
    };

    let organizerNotified = false;
    if (organizerEmail) {
      const organizerName =
        readText(organizerData.firstName) ?? readText(account.displayName) ?? null;
      const payload = withSiteOrigin(
        buildEventRegistrationOrganizerPayload({
          recipient: organizerEmail,
          recipientName: organizerName,
          event,
          attendeeName: input.name,
          contact: input.contact,
          contactType: input.contactType,
          occurrenceDate: input.occurrenceDate,
        }),
        organizerUid ? await getUserSiteOrigin(organizerUid) : null
      );
      // "Antworten" in the organizer's mail program goes straight to the guest.
      const replyTo = input.contactType === 'email' ? input.contact : defaultReplyTo;
      organizerNotified = await send(payload, replyTo, 'registration organizer mail');
    }

    let confirmationSent = false;
    if (input.contactType === 'email') {
      const marker = eventRef
        .collection(REGISTRATION_MAIL_MARKERS)
        .doc(confirmationMarkerId(input.contact));
      let firstForAddress = false;
      try {
        await marker.create({ createdAt: FieldValue.serverTimestamp() });
        firstForAddress = true;
      } catch {
        // Marker exists: this address already got a confirmation for this event.
      }
      if (firstForAddress) {
        const payload = withSiteOrigin(
          buildEventRegistrationConfirmationPayload({
            recipient: input.contact,
            attendeeName: input.name,
            event,
            occurrenceDate: input.occurrenceDate,
          }),
          requestSiteOrigin(request)
        );
        confirmationSent = await send(payload, defaultReplyTo, 'registration confirmation mail');
      }
    }

    logger.info('Event registration processed', {
      ...log,
      organizerNotified,
      confirmationSent,
      favorite,
      dryRun,
    });
    return { ok: true, organizerNotified, confirmationSent, favorite };
  }
);
