/**
 * Region-aware routing of the admin-facing "new event submitted" mail
 * (ticket 20). Pure: no firebase-admin import, every Firestore/Auth/Mailgun
 * access comes in through `AdminEventMailDeps`, so Vitest covers the whole
 * path without an emulator (tests/lib/adminEventRouting.spec.ts).
 *
 * The mail itself is switched off (`ADMIN_EVENT_EMAILS_ENABLED = false` in
 * notifications.ts, Trello 8ioEr9T1, to save Mailgun quota). With the flag off
 * `sendSubmittedAdminMail` returns before touching any dependency: nothing is
 * read, nothing is sent. Once the flag is flipped back on, a submission of an
 * event in region R goes to
 *   - the Super-Admins (as before) and the shared submitted inbox (as before),
 *   - the Regions-Moderator:innen whose `regionIds` include R (email from
 *     Auth; disabled accounts and accounts without email are skipped),
 *   - `regions/{R}.contactEmail` when set and plausible,
 * deduplicated case-insensitively. Events without `regionId` count as
 * Vorarlberg, online events go by their `regionId` like every other event.
 * Moderators never get mail about another region's events.
 */
import { isRegionId, resolveRegionId } from './regions';
import { parseStaffRole } from './staffRoles';

export interface MailAccount {
  uid: string;
  email: string;
}

export interface RoutedRecipient {
  uid?: string | null;
  email: string;
}

/** `admin_users/{uid}` as read from Firestore. */
export interface StaffDocEntry {
  uid: string;
  data: unknown;
}

/** Auth user as far as routing cares (firebase-admin UserRecord subset). */
export interface AuthUserLike {
  uid: string;
  email?: string | null;
  disabled?: boolean;
}

/** `regions/{id}` merged with what routing needs. */
export interface RegionInfo {
  id: string;
  name?: string | null;
  active?: boolean;
  contactEmail?: string | null;
}

/** The moderation region of an event: `regionId`, else Vorarlberg. */
export function eventMailRegionId(eventData: unknown): string {
  return resolveRegionId(eventData);
}

/** Uids of moderators responsible for `regionId` (never other regions). */
export function moderatorUidsForRegion(docs: StaffDocEntry[], regionId: string): string[] {
  if (!isRegionId(regionId)) return [];
  return docs
    .filter((doc) => {
      const role = parseStaffRole(doc.data);
      return role?.kind === 'regionModerator' && role.regionIds.includes(regionId);
    })
    .map((doc) => doc.uid)
    .filter((uid) => typeof uid === 'string' && uid.length > 0);
}

/** Auth users -> mail accounts; disabled accounts and missing emails are dropped. */
export function mailableAccounts(users: AuthUserLike[]): MailAccount[] {
  const out: MailAccount[] = [];
  for (const user of users) {
    if (!user || user.disabled) continue;
    const email = typeof user.email === 'string' ? user.email.trim() : '';
    if (!email) continue;
    out.push({ uid: user.uid, email });
  }
  return out;
}

const PLAUSIBLE_EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** The region's contact address, or null when unset or not an address. */
export function regionContactEmail(region: RegionInfo | null | undefined): string | null {
  const raw = typeof region?.contactEmail === 'string' ? region.contactEmail.trim() : '';
  return raw && PLAUSIBLE_EMAIL.test(raw) ? raw : null;
}

/**
 * Region name for subject/body, only when more than one region is active.
 * With a single active region (today: Vorarlberg) the mail stays exactly as
 * before (dark launch).
 */
export function mailRegionLabel(regions: RegionInfo[], regionId: string): string | null {
  const activeCount = regions.filter((r) => r.active === true).length;
  if (activeCount <= 1) return null;
  const name = regions.find((r) => r.id === regionId)?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

/**
 * Final recipient list: Super-Admins, then the shared inbox (both exactly as
 * before), then the region's moderators, then the region contact address.
 * Case-insensitive dedup keeps the first entry, so an address that is both a
 * Super-Admin and a moderator keeps its uid (and its unsubscribe setting).
 */
export function buildRegionalAdminRecipients({
  superAdmins,
  moderators,
  submittedInbox,
  contactEmail,
}: {
  superAdmins: MailAccount[];
  moderators: MailAccount[];
  submittedInbox?: string | null;
  contactEmail?: string | null;
}): RoutedRecipient[] {
  const seen = new Set<string>();
  const out: RoutedRecipient[] = [];
  const add = (email: unknown, uid: string | null) => {
    if (typeof email !== 'string') return;
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(uid ? { uid, email } : { email });
  };
  for (const a of superAdmins) add(a.email, a.uid);
  if (submittedInbox) add(submittedInbox, null);
  for (const m of moderators) add(m.email, m.uid);
  if (contactEmail) add(contactEmail, null);
  return out;
}

export interface AdminEventMailDeps {
  /** Super-Admin accounts (cached getAdminAccounts in adminEmails.ts). */
  loadSuperAdmins: () => Promise<MailAccount[]>;
  /** All `admin_users` docs with role RegionModerator. */
  loadModeratorDocs: () => Promise<StaffDocEntry[]>;
  /** Auth lookup by uid (missing uids are simply absent). */
  loadAuthUsers: (uids: string[]) => Promise<AuthUserLike[]>;
  /** The `regions` collection (name, active, contactEmail). */
  loadRegions: () => Promise<RegionInfo[]>;
  /** Unsubscribe filter (notifyOnSubmitted), same as every other mail. */
  filterByPreferences: (recipients: RoutedRecipient[]) => Promise<RoutedRecipient[]>;
  /** Sends one mail; resolves true when delivered. Must not throw for one bad address. */
  send: (to: string, regionLabel: string | null) => Promise<boolean>;
  warn?: (message: string, data?: Record<string, unknown>) => void;
}

export interface AdminEventMailResult {
  enabled: boolean;
  regionId: string;
  regionLabel: string | null;
  recipients: RoutedRecipient[];
  sent: number;
}

/**
 * Resolves the region-aware recipients. Failures while reading moderators or
 * the region doc never fail the function: they are logged and the mail goes
 * to the Super-Admins as before (nothing gets lost).
 */
export async function resolveAdminEventRecipients(
  eventData: unknown,
  deps: AdminEventMailDeps,
  submittedInbox?: string | null
): Promise<{ regionId: string; regionLabel: string | null; recipients: RoutedRecipient[] }> {
  const regionId = eventMailRegionId(eventData);
  const warn = deps.warn ?? (() => undefined);
  const superAdmins = await deps.loadSuperAdmins();

  let moderators: MailAccount[] = [];
  try {
    const uids = moderatorUidsForRegion(await deps.loadModeratorDocs(), regionId);
    if (uids.length > 0) {
      const users = await deps.loadAuthUsers(uids);
      const byUid = new Map(users.map((u) => [u.uid, u]));
      moderators = mailableAccounts(uids.map((uid) => byUid.get(uid)).filter(isAuthUser));
      if (moderators.length < uids.length) {
        warn('Some region moderators have no usable email and are skipped', {
          regionId,
          skipped: uids.length - moderators.length,
        });
      }
    }
  } catch (err) {
    warn('Could not resolve region moderators; mailing Super-Admins only', { regionId, err });
    moderators = [];
  }

  let regions: RegionInfo[] = [];
  try {
    regions = await deps.loadRegions();
  } catch (err) {
    warn('Could not read regions; no region contact, no region label', { regionId, err });
    regions = [];
  }
  const region = regions.find((r) => r.id === regionId) ?? null;

  return {
    regionId,
    regionLabel: mailRegionLabel(regions, regionId),
    recipients: buildRegionalAdminRecipients({
      superAdmins,
      moderators,
      submittedInbox,
      contactEmail: regionContactEmail(region),
    }),
  };
}

function isAuthUser(value: AuthUserLike | undefined): value is AuthUserLike {
  return !!value;
}

/**
 * The whole "new event submitted" admin mail. `enabled` is
 * ADMIN_EVENT_EMAILS_ENABLED: when false NOTHING happens (no reads, no sends).
 */
export async function sendSubmittedAdminMail({
  enabled,
  eventData,
  submittedInbox,
  deps,
}: {
  enabled: boolean;
  eventData: unknown;
  submittedInbox?: string | null;
  deps: AdminEventMailDeps;
}): Promise<AdminEventMailResult> {
  if (!enabled) {
    return {
      enabled: false,
      regionId: eventMailRegionId(eventData),
      regionLabel: null,
      recipients: [],
      sent: 0,
    };
  }
  const resolved = await resolveAdminEventRecipients(eventData, deps, submittedInbox);
  const recipients = await deps.filterByPreferences(resolved.recipients);
  let sent = 0;
  for (const { email } of recipients) {
    if (await deps.send(email, resolved.regionLabel)) sent += 1;
  }
  return { enabled: true, ...resolved, recipients, sent };
}
