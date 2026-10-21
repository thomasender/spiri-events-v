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
