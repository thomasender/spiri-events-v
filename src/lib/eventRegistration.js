import { getEventLastDate } from '../utils/eventExpiry';
import { isEventCancelled } from '../utils/eventCancellation';

// "Zum Event anmelden" (docs/event-registration.md). Limits mirror
// functions/src/eventRegistrationLogic.ts.
export const REGISTRATION_NAME_MAX = 80;
export const REGISTRATION_CONTACT_MAX = 120;
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS = /^\+?[\d\s()./-]+$/;

/** 'email', 'phone' or null when the contact is neither. */
export function contactType(value) {
  const v = (value ?? '').trim();
  if (!v || v.length > REGISTRATION_CONTACT_MAX) return null;
  if (v.includes('@')) return EMAIL_PATTERN.test(v) ? 'email' : null;
  if (!PHONE_CHARS.test(v)) return null;
  const digits = v.replace(/\D/g, '').length;
  return digits >= MIN_PHONE_DIGITS && digits <= MAX_PHONE_DIGITS ? 'phone' : null;
}

/** Field errors (German, shown under the fields) or {} when the form is fine. */
export function validateRegistrationForm({ name, contact }) {
  const errors = {};
  const n = (name ?? '').trim();
  if (n.length < 2) errors.name = 'Bitte gib deinen Namen an.';
  else if (n.length > REGISTRATION_NAME_MAX) errors.name = 'Der Name ist zu lang.';
  if (!(contact ?? '').trim()) {
    errors.contact = 'Bitte gib deine E-Mail-Adresse oder Telefonnummer an.';
  } else if (!contactType(contact)) {
    errors.contact = 'Bitte gib eine gültige E-Mail-Adresse oder Telefonnummer an.';
  }
  return errors;
}

const localToday = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Published, not called off and not over: only then the button is shown. */
export function canRegisterForEvent(event, todayIso = localToday()) {
  if (!event?.id || event.status !== 'approved' || isEventCancelled(event)) return false;
  const last = getEventLastDate(event);
  return !last || todayIso <= last;
}

// A guest who registered without an account: the account form is prefilled from
// this, and once signed in the event is saved as favorite (favoritesStore) and
// the confirmation mail names the event (useAuth.register).
export const PENDING_REGISTRATION_KEY = 'pendingRegistration';

export function savePendingRegistration({ eventId, eventTitle, name, email }) {
  try {
    sessionStorage.setItem(
      PENDING_REGISTRATION_KEY,
      JSON.stringify({
        eventId,
        eventTitle: eventTitle ?? '',
        name: name ?? '',
        email: email ?? '',
      })
    );
  } catch {}
}

/** The stored guest registration, or null (missing, broken or without event). */
export function readPendingRegistration() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PENDING_REGISTRATION_KEY) ?? 'null');
    if (!parsed || typeof parsed.eventId !== 'string' || !parsed.eventId) return null;
    return {
      eventId: parsed.eventId,
      eventTitle: typeof parsed.eventTitle === 'string' ? parsed.eventTitle : '',
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
    };
  } catch {
    return null;
  }
}

export function clearPendingRegistration() {
  try {
    sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
  } catch {}
}

/** German message for a failed submit. */
export function registrationErrorMessage(err) {
  const code = String(err?.code ?? '').replace(/^functions\//, '');
  if (code === 'resource-exhausted') {
    return 'Zu viele Anmeldungen in kurzer Zeit. Bitte versuche es später noch einmal.';
  }
  if (code === 'failed-precondition') {
    return 'Für dieses Event ist keine Anmeldung (mehr) möglich.';
  }
  if (code === 'invalid-argument') {
    return 'Bitte überprüfe deinen Namen und deine E-Mail-Adresse oder Telefonnummer.';
  }
  return 'Die Anmeldung konnte nicht gesendet werden. Bitte versuche es noch einmal.';
}

/**
 * Sends the registration (callable `submitEventRegistration`): the organizer is
 * mailed, an e-mail address gets a confirmation, a signed-in caller the favorite.
 * Resolves to { organizerNotified, confirmationSent, favorite }.
 */
export async function sendEventRegistration({ eventId, name, contact, occurrenceDate, website }) {
  const { callable } = await import('./firebase');
  const result = await callable('submitEventRegistration')({
    eventId,
    name: name.trim(),
    contact: contact.trim(),
    occurrenceDate: occurrenceDate || '',
    website: website ?? '',
  });
  return result.data ?? {};
}
