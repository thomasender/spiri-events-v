// Pure logic for the "event cancelled" e-mail to users who favorited an event.
// No Firebase imports, so it is unit-testable (tests/lib/eventCancellation.spec.ts).

export interface CancellationSnapshot {
  status?: unknown;
  cancelled?: unknown;
  cancelledDates?: unknown;
  date?: unknown;
  endDate?: unknown;
  recurrence?: unknown;
}

export interface CancellationChange {
  /** The whole event (all dates) was newly cancelled. */
  wholeEvent: boolean;
  /** Newly cancelled dates (YYYY-MM-DD), sorted. Empty for a whole-event cancellation of a series. */
  dates: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((d): d is string => typeof d === 'string' && ISO_DATE.test(d));
}

function isRecurring(snapshot: CancellationSnapshot): boolean {
  return (
    typeof snapshot.recurrence === 'string' &&
    snapshot.recurrence !== '' &&
    snapshot.recurrence !== 'none'
  );
}

/**
 * Which cancellations are new in this update and should be announced?
 * Only published events, only cancellations that were not there before (so
 * re-saving the event never sends the e-mail twice) and only dates that have
 * not passed yet (`todayIso` = YYYY-MM-DD in the site's time zone).
 */
export function detectNewCancellations(
  before: CancellationSnapshot,
  after: CancellationSnapshot,
  todayIso: string
): CancellationChange | null {
  if (after.status !== 'approved') return null;

  if (after.cancelled === true && before.cancelled !== true) {
    if (isRecurring(after)) return { wholeEvent: true, dates: [] };
    const date = typeof after.date === 'string' && ISO_DATE.test(after.date) ? after.date : null;
    const lastDay =
      typeof after.endDate === 'string' && ISO_DATE.test(after.endDate) ? after.endDate : date;
    if (lastDay && lastDay < todayIso) return null;
    return { wholeEvent: true, dates: date ? [date] : [] };
  }

  // Dates cancelled while the whole event is cancelled need no extra e-mail.
  if (after.cancelled === true) return null;

  const previous = new Set(readDates(before.cancelledDates));
  const added = Array.from(new Set(readDates(after.cancelledDates)))
    .filter((d) => !previous.has(d) && d >= todayIso)
    .sort();
  if (added.length === 0) return null;
  return { wholeEvent: false, dates: added };
}

export interface FavoriteRecipient {
  uid: string;
  email: string;
  displayName?: string | null;
}

export interface FavoriteUserInfo {
  email?: string | null;
  displayName?: string | null;
  disabled?: boolean;
}

/**
 * Turns the uids who favorited the event into e-mail recipients: skips users
 * without an e-mail address, disabled accounts, users who switched the e-mail
 * off and the organizer who cancelled it. Each recipient gets their own
 * e-mail, so no address is ever shown to anyone else.
 */
export function selectFavoriteRecipients(
  favoriterUids: string[],
  users: Map<string, FavoriteUserInfo>,
  wantsEmail: (uid: string) => boolean,
  ownerUid?: string | null
): FavoriteRecipient[] {
  const seenUids = new Set<string>();
  const seenEmails = new Set<string>();
  const out: FavoriteRecipient[] = [];
  for (const uid of favoriterUids) {
    if (!uid || seenUids.has(uid)) continue;
    seenUids.add(uid);
    if (ownerUid && uid === ownerUid) continue;
    const user = users.get(uid);
    if (!user || user.disabled) continue;
    const email = typeof user.email === 'string' ? user.email.trim() : '';
    if (!email) continue;
    const key = email.toLowerCase();
    if (seenEmails.has(key)) continue;
    if (!wantsEmail(uid)) continue;
    seenEmails.add(key);
    out.push({ uid, email, displayName: user.displayName ?? null });
  }
  return out;
}

/** Today's date (YYYY-MM-DD) in Vorarlberg. */
export function todayInVienna(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
