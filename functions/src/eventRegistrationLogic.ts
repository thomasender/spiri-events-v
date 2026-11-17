// Pure logic for "Zum Event anmelden" (callable submitEventRegistration in
// eventRegistration.ts). No Firebase Admin imports, so it is unit-testable
// (tests/lib/eventRegistration.spec.ts). Limits mirror src/lib/eventRegistration.js.

import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { getEventLastDate } from './eventExpiry';

export const REGISTRATION_NAME_MAX = 80;
export const REGISTRATION_CONTACT_MAX = 120;
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS = /^\+?[\d\s()./-]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_IN_TEXT = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export type ContactType = 'email' | 'phone';

export interface EventRegistrationInput {
  eventId: string;
  name: string;
  /** E-mail (lower case) or phone number as typed (trimmed). */
  contact: string;
  contactType: ContactType;
  /** Start date of the chosen occurrence of a series (YYYY-MM-DD), if any. */
  occurrenceDate: string | null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** E-mail or phone number, or null when it is neither. */
export function classifyContact(
  raw: unknown
): { contact: string; contactType: ContactType } | null {
  const value = str(raw);
  if (!value || value.length > REGISTRATION_CONTACT_MAX) return null;
  if (value.includes('@')) {
    return EMAIL_PATTERN.test(value)
      ? { contact: value.toLowerCase(), contactType: 'email' }
      : null;
  }
  if (!PHONE_CHARS.test(value)) return null;
  const digits = value.replace(/\D/g, '').length;
  if (digits < MIN_PHONE_DIGITS || digits > MAX_PHONE_DIGITS) return null;
  return { contact: value.replace(/\s+/g, ' '), contactType: 'phone' };
}

/** Validates the form data; throws HttpsError('invalid-argument') with a short reason. */
export function validateEventRegistration(raw: unknown): EventRegistrationInput {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // Honeypot: a hidden field real visitors never fill in.
  if (str(data.website)) throw new HttpsError('invalid-argument', 'Invalid request.');

  const eventId = str(data.eventId);
  if (!eventId || eventId.length > 200 || eventId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Unknown event.');
  }
  const name = str(data.name).replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > REGISTRATION_NAME_MAX) {
    throw new HttpsError('invalid-argument', 'Please enter your name.');
  }
  const contact = classifyContact(data.contact);
  if (!contact) {
    throw new HttpsError('invalid-argument', 'A valid email address or phone number is required.');
  }
  const occurrenceRaw = str(data.occurrenceDate);
  const occurrenceDate = ISO_DATE.test(occurrenceRaw) ? occurrenceRaw : null;
  return { eventId, name, ...contact, occurrenceDate };
}

export type RegistrationClosedReason = 'not_found' | 'not_approved' | 'cancelled' | 'past';

/** Why nobody can register for this event (any more), or null when registration is open. */
export function registrationClosedReason(
  event: Record<string, unknown> | null | undefined,
  todayIso: string
): RegistrationClosedReason | null {
  if (!event) return 'not_found';
  if (event.status !== 'approved') return 'not_approved';
  if (event.cancelled === true) return 'cancelled';
  const last = getEventLastDate(event as Parameters<typeof getEventLastDate>[0]);
  if (last && todayIso > last) return 'past';
  return null;
}

/**
 * Where the organizer mail goes: the e-mail of the account that created the
 * event, else the organizer e-mail stored on the event, else an e-mail in the
 * "Kontakt" field. null = we cannot reach the organizer by mail.
 */
export function pickOrganizerEmail(sources: {
  accountEmail?: string | null;
  organizerEmail?: unknown;
  kontakt?: unknown;
}): string | null {
  const account = str(sources.accountEmail);
  if (EMAIL_PATTERN.test(account)) return account;
  const organizer = str(sources.organizerEmail);
  if (EMAIL_PATTERN.test(organizer)) return organizer;
  const match = str(sources.kontakt).match(EMAIL_IN_TEXT);
  return match ? match[0] : null;
}

/** Doc id of the "confirmation already sent" marker for one e-mail address (no address in clear text). */
export function confirmationMarkerId(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** Registrations are kept only until the event is over (last date passed). */
export function shouldPurgeRegistrations(
  event: Record<string, unknown> | null | undefined,
  todayIso: string
): boolean {
  const last = getEventLastDate(event as Parameters<typeof getEventLastDate>[0]);
  return last !== null && todayIso > last;
}

/** Rate limits of submitEventRegistration (per caller, per contact, per event). */
export const EVENT_REGISTRATION_RATE_LIMITS = {
  caller: { maxAttempts: 10, windowMs: 10 * 60 * 1000 },
  contact: { maxAttempts: 5, windowMs: 30 * 60 * 1000 },
  event: { maxAttempts: 30, windowMs: 60 * 60 * 1000 },
} as const;
