// Pure helpers of the community chat (docs/chat.md); no Firebase here.

export const CHAT_RETENTION_DAYS = 10;
export const DM_RETENTION_DAYS = 90;
export const CHAT_RESOLVED_REPORT_RETENTION_DAYS = 30;
export const REPORT_MAIL_MIN_INTERVAL_MS = 15 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionCutoffMs(nowMs: number, days: number = CHAT_RETENTION_DAYS): number {
  return nowMs - days * DAY_MS;
}

/** At most one report mail per interval, so a flood of reports cannot flood the admins. */
export function shouldSendReportMail(
  lastSentAtMs: number | null,
  nowMs: number,
  minIntervalMs: number = REPORT_MAIL_MIN_INTERVAL_MS
): boolean {
  return lastSentAtMs === null || nowMs - lastSentAtMs >= minIntervalMs;
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function buildReportMail(
  report: { messageText?: unknown; messageAuthorName?: unknown },
  openCount: number,
  adminUrl: string
): { subject: string; text: string } {
  const author = clean(report.messageAuthorName, 80) || 'Unbekannt';
  const excerpt = clean(report.messageText, 200);
  const others = openCount > 1 ? `\n\nInsgesamt warten ${openCount} Meldungen auf dich.` : '';
  return {
    subject: 'Neue Meldung im Chat „Lagerfeuer“',
    text: `Eine Nachricht von ${author} wurde gemeldet:\n\n„${excerpt}“${others}\n\nZur Moderation: ${adminUrl}`,
  };
}

/** The mail names only the reported person: private messages are not for the admins' inbox. */
export function buildDmReportMail(
  report: { reportedName?: unknown },
  openCount: number,
  adminUrl: string
): { subject: string; text: string } {
  const who = clean(report.reportedName, 80) || 'Unbekannt';
  const others = openCount > 1 ? `\n\nInsgesamt warten ${openCount} Meldungen auf dich.` : '';
  return {
    subject: 'Neue Meldung einer Privatnachricht',
    text: `Eine Unterhaltung mit ${who} wurde gemeldet. Den gemeldeten Ausschnitt findest du in der Verwaltung.${others}\n\nZur Moderation: ${adminUrl}`,
  };
}

// ---- @mentions (docs/chat.md) ------------------------------------------------

// Keep in sync with MENTION_MAX in src/utils/mentions.js and the rules.
export const MENTION_MAX = 10;
export const MENTION_EXCERPT_MAX = 140;

/** Who a message mentions: uids only, no duplicates, never the author, at most MENTION_MAX. */
export function mentionTargets(raw: unknown, authorUid: string): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const uids: string[] = [];
  for (const uid of Object.keys(raw as Record<string, unknown>)) {
    if (uids.length >= MENTION_MAX) break;
    if (uid && uid.length <= 128 && !uid.includes('/') && uid !== authorUid) uids.push(uid);
  }
  return uids;
}

/** One line of the message for the notification, shortened. */
export function mentionExcerpt(text: unknown): string {
  const flat = clean(text, 10_000);
  return flat.length > MENTION_EXCERPT_MAX ? `${flat.slice(0, MENTION_EXCERPT_MAX - 1)}…` : flat;
}

/** Whether a person can open the room at all: the chat flag decides (docs/chat.md). */
export function canReceiveChatMention(mode: unknown, isAdmin: boolean): boolean {
  if (mode === 'all') return true;
  if (mode === 'admins') return isAdmin;
  return false;
}
