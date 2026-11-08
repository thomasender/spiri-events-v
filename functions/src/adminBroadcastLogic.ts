// Pure logic of the admin's Sammelnachricht ("PN an alle Mitglieder"): request
// validation, text normalisation, the summary snippet, packets, throttle and
// skip counters. No Firebase here, so it is unit-testable
// (tests/lib/adminBroadcast.spec.ts); the callable lives in adminBroadcast.ts.
// See docs/messenger.md "Sammelnachricht".

import { HttpsError } from 'firebase-functions/v2/https';
import type { BroadcastSkipReason } from './chatMailNotify';

/** Same limit as a normal private message (src/utils/messenger.js DM_MAX_LENGTH). */
export const BROADCAST_TEXT_MAX = 1000;
/** At most this many recipients per Sammelnachricht. */
export const BROADCAST_MAX_RECIPIENTS = 500;
/** One Sammelnachricht per admin within this window. */
export const BROADCAST_COOLDOWN_MS = 10 * 60 * 1000;
/** Recipients per write batch: 2 writes each (thread summary + message), under the 500 limit. */
export const BROADCAST_PACKET_SIZE = 200;
/** Auth getUsers() accepts at most 100 identifiers per call. */
export const AUTH_LOOKUP_SIZE = 100;
/** KEEP IN SYNC with DM_SNIPPET_LENGTH in src/utils/messenger.js (rules allow 140). */
export const DM_SNIPPET_LENGTH = 120;

export const BROADCAST_COLLECTION = 'admin_broadcasts';
/** Server-only throttle doc per admin (firestore.rules deny every client). */
export const BROADCAST_LOCK_COLLECTION = 'admin_broadcast_locks';

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const UID_RE = /^[^/]{1,128}$/;

// KEEP IN SYNC with normalizeChatText / chatTextLength in src/utils/chat.js:
// the Sammelnachricht is cleaned exactly like a message typed in the Postfach.
const UNWANTED_CHARS = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u200B\\u200E\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]',
  'g'
);

export function normalizeBroadcastText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(UNWANTED_CHARS, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Length as users count it: one emoji is one character. */
export function broadcastTextLength(text: string): number {
  if (!text) return 0;
  // Intl.Segmenter exists on Node 22; the es2020 lib of tsconfig just lacks its types.
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale: string,
        options: { granularity: 'grapheme' }
      ) => { segment(input: string): Iterable<unknown> };
    }
  ).Segmenter;
  if (!Segmenter) return Array.from(text).length;
  let count = 0;
  for (const _segment of new Segmenter('de', { granularity: 'grapheme' }).segment(text)) {
    count += 1;
  }
  return count;
}

/** KEEP IN SYNC with dmSnippet in src/utils/messenger.js (thread summary in the inbox). */
export function dmSnippet(text: string): string {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(flat);
  return chars.length > DM_SNIPPET_LENGTH
    ? `${chars.slice(0, DM_SNIPPET_LENGTH - 1).join('')}…`
    : flat;
}

/** KEEP IN SYNC with threadIdFor in src/utils/messenger.js and the dm_threads rules. */
export function threadIdFor(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

export interface BroadcastRequest {
  recipientUids: string[];
  text: string;
  dryRun: boolean;
  requestId: string;
}

/**
 * Validates the callable's data. Recipients are de-duplicated; the cap applies
 * to distinct members. Messages are shown to the admin, so they are German.
 */
export function validateBroadcastRequest(raw: unknown): BroadcastRequest {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(data.recipientUids)) {
    throw new HttpsError('invalid-argument', 'Bitte wähle Empfänger:innen aus.');
  }
  const uids = Array.from(
    new Set(data.recipientUids.filter((u): u is string => typeof u === 'string' && UID_RE.test(u)))
  );
  if (uids.length !== new Set(data.recipientUids).size) {
    throw new HttpsError('invalid-argument', 'Die Empfängerliste ist ungültig.');
  }
  if (uids.length === 0) {
    throw new HttpsError('invalid-argument', 'Bitte wähle Empfänger:innen aus.');
  }
  if (uids.length > BROADCAST_MAX_RECIPIENTS) {
    throw new HttpsError(
      'invalid-argument',
      `Höchstens ${BROADCAST_MAX_RECIPIENTS} Empfänger:innen pro Nachricht.`
    );
  }
  const text = normalizeBroadcastText(data.text);
  if (!text) throw new HttpsError('invalid-argument', 'Die Nachricht ist leer.');
  if (broadcastTextLength(text) > BROADCAST_TEXT_MAX) {
    throw new HttpsError(
      'invalid-argument',
      `Die Nachricht darf höchstens ${BROADCAST_TEXT_MAX} Zeichen lang sein.`
    );
  }
  const requestId = typeof data.requestId === 'string' ? data.requestId : '';
  if (!REQUEST_ID_RE.test(requestId)) {
    throw new HttpsError('invalid-argument', 'Die Anfrage ist ungültig. Bitte lade die Seite neu.');
  }
  return { recipientUids: uids, text, dryRun: data.dryRun === true, requestId };
}

/** Log id: one admin + her request id, so a double click finds the first send. */
export function broadcastDocId(senderUid: string, requestId: string): string {
  return `${senderUid}_${requestId}`;
}

export interface BroadcastSender {
  /** app_settings/messenger mode. */
  mode: unknown;
  /** The admin's own Auth account; null = missing. */
  account: { disabled: boolean; emailVerified?: boolean } | null;
  /** Active chat mute/ban of the admin (also blocks her private messages). */
  banned: boolean;
}

/**
 * Reason to refuse the whole Sammelnachricht, or null. The Postfach must be
 * open for all members ('all'): in 'admins' or 'off' mode the recipients could
 * not even open their inbox.
 */
export function broadcastRefusal(sender: BroadcastSender): string | null {
  if (sender.mode !== 'all') {
    return 'Das Postfach ist gerade nicht für alle Mitglieder freigeschaltet. Schalte es zuerst unter Kommunikation → Chat für alle frei.';
  }
  if (!sender.account || sender.account.disabled) {
    return 'Dein Konto kann gerade keine Nachrichten senden.';
  }
  if (sender.account.emailVerified !== true) {
    return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
  }
  if (sender.banned) {
    return 'Dein Konto ist im Chat gerade stummgeschaltet und kann keine Nachrichten senden.';
  }
  return null;
}

/** Milliseconds until the admin may send the next Sammelnachricht, 0 = now. */
export function broadcastWaitMs(
  lastSentAtMs: number | null,
  nowMs: number,
  cooldownMs: number = BROADCAST_COOLDOWN_MS
): number {
  if (lastSentAtMs === null) return 0;
  return Math.max(0, lastSentAtMs + cooldownMs - nowMs);
}

export function broadcastWaitMessage(waitMs: number): string {
  const minutes = Math.max(1, Math.ceil(waitMs / 60000));
  return `Du kannst nur alle 10 Minuten eine Sammelnachricht senden. Bitte warte noch ${minutes} ${
    minutes === 1 ? 'Minute' : 'Minuten'
  }.`;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be positive');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type BroadcastSkipCounts = Partial<Record<BroadcastSkipReason | 'write_failed', number>>;

export function countReasons(
  reasons: readonly (BroadcastSkipReason | 'write_failed')[]
): BroadcastSkipCounts {
  const out: BroadcastSkipCounts = {};
  for (const r of reasons) out[r] = (out[r] ?? 0) + 1;
  return out;
}

/** What one recipient's thread gets, the same fields the Postfach client writes. */
export function threadWrite(
  senderUid: string,
  recipientUid: string,
  text: string,
  exists: boolean,
  now: unknown
): { kind: 'update' | 'create'; data: Record<string, unknown> } {
  const summary = {
    lastMessageText: dmSnippet(text),
    lastMessageAt: now,
    lastMessageBy: senderUid,
  };
  if (exists) return { kind: 'update', data: summary };
  return {
    kind: 'create',
    data: {
      participants: [senderUid, recipientUid].sort(),
      ...summary,
      readAt: { [senderUid]: now },
      createdAt: now,
    },
  };
}

export function messageWrite(
  senderUid: string,
  text: string,
  broadcastId: string,
  now: unknown
): Record<string, unknown> {
  return { text, authorUid: senderUid, createdAt: now, broadcastId };
}
