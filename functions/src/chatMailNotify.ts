// Pure logic of the e-mail notifications for new private messages (Postfach)
// and new messages in an event's Kerzenraum ("Event Chat"). No Firebase here,
// so it is unit-testable (tests/lib/chatMailNotify.spec.ts); the triggers live
// in chat.ts. See docs/messenger.md and docs/chat.md.

import { canReceiveChatMention } from './chatLogic';

/** Postfach: at most one mail per conversation and recipient within this window. */
export const DM_MAIL_WINDOW_MS = 60 * 60 * 1000;

/** Server-only throttle markers (firestore.rules deny every client access). */
export const DM_MAIL_MARKER_COLLECTION = 'dm_notify';
export const EVENT_CHAT_MAIL_MARKER_COLLECTION = 'event_chat_notify';

/** Markers older than this are purged daily (they are only needed for the throttle). */
export const DM_MAIL_MARKER_RETENTION_MS = 24 * 60 * 60 * 1000;
export const EVENT_CHAT_MAIL_MARKER_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

const STAGING_PROJECT_ID = 'tribe-vbg-staging';
const PRODUCTION_BASE_URL = 'https://www.thetribe.at';

/**
 * Links in the mail point to the site the message was written on; in
 * production that is the domain the recipient registered on (`siteOrigin`).
 */
export function chatMailBaseUrl(projectId: string | undefined, siteOrigin?: string): string {
  return projectId === STAGING_PROJECT_ID
    ? `https://${STAGING_PROJECT_ID}.web.app`
    : (siteOrigin ?? PRODUCTION_BASE_URL);
}

/** The two uids of a 1:1 thread (id = sorted uids joined by "_"), or null. */
export function parseDmThreadId(threadId: string): [string, string] | null {
  const parts = typeof threadId === 'string' ? threadId.split('_') : [];
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) return null;
  return [parts[0], parts[1]];
}

/** The other participant, or null when the author is not one of the two. */
export function dmRecipientUid(threadId: string, authorUid: string): string | null {
  const pair = parseDmThreadId(threadId);
  if (!pair || !authorUid) return null;
  if (pair[0] === authorUid) return pair[1];
  if (pair[1] === authorUid) return pair[0];
  return null;
}

export function dmMailMarkerId(threadId: string, recipientUid: string): string {
  return `${threadId}_${recipientUid}`;
}

/** Fixed window: a mail goes out when none was sent for this conversation in the last hour. */
export function shouldSendDmMail(
  lastMailAtMs: number | null,
  nowMs: number,
  windowMs: number = DM_MAIL_WINDOW_MS
): boolean {
  return lastMailAtMs === null || nowMs - lastMailAtMs >= windowMs;
}

/** Calendar day in Vienna, YYYY-MM-DD. */
export function viennaDay(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowMs));
}

/** Kerzenraum: at most one mail per organizer and calendar day (Vienna), across all events. */
export function shouldSendEventChatMail(lastMailDay: string | null, nowMs: number): boolean {
  return lastMailDay !== viennaDay(nowMs);
}

export interface MailAccount {
  email: string | null;
  disabled: boolean;
  emailVerified?: boolean;
}

export type ChatMailSkipReason =
  | 'flag_off'
  | 'not_admin'
  | 'invalid_thread'
  | 'self'
  | 'author_is_organizer'
  | 'no_organizer'
  | 'event_not_approved'
  | 'opted_out'
  | 'blocked'
  | 'no_direct_messages'
  | 'author_banned'
  | 'author_inactive'
  | 'recipient_inactive'
  | 'recipient_no_email'
  | 'recipient_unverified'
  | 'empty_text';

export type ChatMailDecision = { send: true } | { send: false; reason: ChatMailSkipReason };

function skip(reason: ChatMailSkipReason): ChatMailDecision {
  return { send: false, reason };
}

function accountReason(
  author: MailAccount | null,
  recipient: MailAccount | null
): ChatMailSkipReason | null {
  if (!author || author.disabled) return 'author_inactive';
  if (!recipient || recipient.disabled) return 'recipient_inactive';
  if (!recipient.email) return 'recipient_no_email';
  return null;
}

export interface DmMailInput {
  /** app_settings/messenger mode. */
  mode: unknown;
  recipientIsAdmin: boolean;
  authorUid: string;
  /** dmRecipientUid(); null = the author is not a participant. */
  recipientUid: string | null;
  text: unknown;
  /** notifyOnDirectMessage of the recipient (default on). */
  prefEnabled: boolean;
  /** A block in either direction. */
  blocked: boolean;
  /** dm_settings/{recipient}.allowDirectMessages (default on). */
  recipientAllowsDirectMessages: boolean;
  authorBanned: boolean;
  author: MailAccount | null;
  recipient: MailAccount | null;
}

/** Whether a new private message may trigger a mail; the throttle is checked afterwards. */
export function decideDmMail(input: DmMailInput): ChatMailDecision {
  if (input.mode !== 'all' && input.mode !== 'admins') return skip('flag_off');
  if (!input.recipientUid) return skip('invalid_thread');
  if (input.recipientUid === input.authorUid) return skip('self');
  if (!canReceiveChatMention(input.mode, input.recipientIsAdmin)) return skip('not_admin');
  if (!input.prefEnabled) return skip('opted_out');
  if (typeof input.text !== 'string' || input.text.trim() === '') return skip('empty_text');
  if (input.blocked) return skip('blocked');
  if (!input.recipientAllowsDirectMessages) return skip('no_direct_messages');
  if (input.authorBanned) return skip('author_banned');
  const account = accountReason(input.author, input.recipient);
  if (account) return skip(account);
  // The Postfach needs a verified address, so an unverified one could not open the link.
  if (input.recipient?.emailVerified !== true) return skip('recipient_unverified');
  return { send: true };
}

export type BroadcastSkipReason =
  'self' | 'recipient_inactive' | 'recipient_unverified' | 'blocked' | 'no_direct_messages';

export type BroadcastRecipientDecision =
  { send: true } | { send: false; reason: BroadcastSkipReason };

export interface BroadcastRecipientInput {
  senderUid: string;
  recipientUid: string;
  /** Firebase Auth account; null = deleted. */
  recipient: MailAccount | null;
  /** A block in either direction (dm_blocks). */
  blocked: boolean;
  /** dm_settings/{recipient}.allowDirectMessages (default on). */
  recipientAllowsDirectMessages: boolean;
}

/**
 * Whether one member gets the admin's Sammelnachricht in her Postfach. Mirrors
 * what firestore.rules check when a member writes a private message (block of
 * the recipient, "keine Privatnachrichten"), plus the messenger's own premise
 * that both sides have a verified address, and a block by the sender. The
 * messenger flag and the sender's own state are checked once for the whole
 * broadcast (broadcastRefusal in adminBroadcastLogic.ts).
 */
export function decideBroadcastRecipient(
  input: BroadcastRecipientInput
): BroadcastRecipientDecision {
  const no = (reason: BroadcastSkipReason): BroadcastRecipientDecision => ({
    send: false,
    reason,
  });
  if (input.recipientUid === input.senderUid) return no('self');
  if (!input.recipient || input.recipient.disabled) return no('recipient_inactive');
  if (input.recipient.emailVerified !== true) return no('recipient_unverified');
  if (input.blocked) return no('blocked');
  if (!input.recipientAllowsDirectMessages) return no('no_direct_messages');
  return { send: true };
}

export interface EventChatMailInput {
  /** app_settings/chat mode. */
  mode: unknown;
  organizerIsAdmin: boolean;
  authorUid: string;
  /** events/{id}.createdBy; null when unknown. */
  organizerUid: string | null;
  eventStatus: unknown;
  text: unknown;
  /** notifyOnEventChat of the organizer (default on). */
  prefEnabled: boolean;
  /** The organizer blocked the author in the Postfach. */
  blocked: boolean;
  authorBanned: boolean;
  author: MailAccount | null;
  organizer: MailAccount | null;
}

/** Whether a new Kerzenraum message may mail the organizer; the daily throttle comes after. */
export function decideEventChatMail(input: EventChatMailInput): ChatMailDecision {
  if (input.mode !== 'all' && input.mode !== 'admins') return skip('flag_off');
  if (!input.organizerUid) return skip('no_organizer');
  if (input.organizerUid === input.authorUid) return skip('author_is_organizer');
  if (input.eventStatus !== 'approved') return skip('event_not_approved');
  if (!canReceiveChatMention(input.mode, input.organizerIsAdmin)) return skip('not_admin');
  if (!input.prefEnabled) return skip('opted_out');
  if (typeof input.text !== 'string' || input.text.trim() === '') return skip('empty_text');
  if (input.blocked) return skip('blocked');
  if (input.authorBanned) return skip('author_banned');
  const account = accountReason(input.author, input.organizer);
  if (account) return skip(account);
  return { send: true };
}

/** A mute/ban is active while `until` lies in the future. */
export function isBanActive(untilMs: number | null, nowMs: number): boolean {
  return untilMs !== null && untilMs > nowMs;
}

export function directMessageUrl(baseUrl: string, authorUid: string): string {
  return `${baseUrl}/postfach/${encodeURIComponent(authorUid)}`;
}

export function eventChatUrl(baseUrl: string, slug: string | null, eventId: string): string {
  return `${baseUrl}/event/${encodeURIComponent(slug || eventId)}#kerzenraum`;
}
