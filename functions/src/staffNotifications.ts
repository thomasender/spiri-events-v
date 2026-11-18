/**
 * Moderator applications and in-app notes for the team (Trello 6afc59ed).
 * Pure logic only: no Firestore access here, so Vitest covers it without an
 * emulator (tests/lib/staffNotifications.spec.ts). The wiring lives in
 * moderatorApplication.ts (submit, daily reminder) and moderatorInvites.ts
 * (invite from an application, closing it on acceptModeratorInvite).
 *
 *   moderator_applications/{id}  one application; written only by functions.
 *     { name, email, message, regionId | null, hasPhoto, status, createdAt,
 *       reminderSentAt, invitedAt, invitedBy, inviteId, doneAt, acceptedUid }
 *     status: 'open' -> 'invited' (someone pressed "hinzufügen") -> 'done'
 *     (the person finished the onboarding). The photo is not stored: it only
 *     goes to the Super-Admins as a mail attachment (`hasPhoto` says it existed).
 *   staff_notifications/{id}     one card per recipient; written only by
 *     functions, the recipient reads it and may only set `readAt`.
 *     { recipientUid, kind, audience, applicationId, name, email, message,
 *       regionIds, hasPhoto, createdAt, readAt }
 *
 * Recipients: the Regions-Moderator:innen of the application's region plus
 * every Super-Admin, each once. An application without region goes to the
 * Super-Admins only.
 */
import { REGION_IDS, isRegionId } from './regions';
import { parseStaffRole, type StaffRole } from './staffRoles';

export const APPLICATIONS_COLLECTION = 'moderator_applications';
export const STAFF_NOTIFICATIONS_COLLECTION = 'staff_notifications';

/** An application still open after this long reminds the Super-Admins once. */
export const APPLICATION_REMINDER_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export type ApplicationStatus = 'open' | 'invited' | 'done';

/**
 * application:          a new application (everyone who may act on it)
 * applicationReminder:  still open after three days (Super-Admins)
 * newModerator:         the person finished the onboarding
 */
export type StaffNotificationKind = 'application' | 'applicationReminder' | 'newModerator';
export type StaffNotificationAudience = 'superAdmin' | 'moderator';

/** `admin_users/{uid}` as read from Firestore. */
export interface StaffDocEntry {
  uid: string;
  data: unknown;
}

/** One `moderator_applications` doc, times as epoch millis. */
export interface ApplicationRecord {
  name: string;
  email: string;
  message: string;
  regionId: string | null;
  hasPhoto: boolean;
  status: ApplicationStatus;
  createdAtMs: number;
  reminderSentAtMs: number | null;
}

export function parseApplicationStatus(raw: unknown): ApplicationStatus {
  return raw === 'invited' || raw === 'done' ? raw : 'open';
}

export interface StaffRecipients {
  superAdminUids: string[];
  moderatorUids: string[];
}

/**
 * Who hears about something in `regionIds`: every Super-Admin, plus the
 * moderators of (at least one of) those regions. `null` / no region = only
 * the Super-Admins. A uid is listed once; `excludeUids` (e.g. the new
 * moderator herself) is left out.
 */
export function staffRecipients(
  docs: readonly StaffDocEntry[],
  regionIds: readonly string[] | null,
  excludeUids: readonly string[] = []
): StaffRecipients {
  const regions = (regionIds ?? []).filter(isRegionId);
  const seen = new Set<string>(excludeUids);
  const superAdminUids: string[] = [];
  const moderatorUids: string[] = [];
  for (const entry of docs) {
    const uid = entry?.uid;
    if (typeof uid !== 'string' || !uid || seen.has(uid)) continue;
    const role = parseStaffRole(entry.data);
    if (role?.kind === 'superAdmin') {
      seen.add(uid);
      superAdminUids.push(uid);
    } else if (
      role?.kind === 'regionModerator' &&
      role.regionIds.some((r) => regions.includes(r))
    ) {
      seen.add(uid);
      moderatorUids.push(uid);
    }
  }
  return { superAdminUids, moderatorUids };
}

/** The once-only reminder is due: still open, none sent yet, three days old. */
export function isReminderDue(app: ApplicationRecord, now: number): boolean {
  return (
    app.status === 'open' &&
    app.reminderSentAtMs === null &&
    app.createdAtMs > 0 &&
    now - app.createdAtMs >= APPLICATION_REMINDER_AFTER_MS
  );
}

/**
 * May this staff member invite the applicant? Super-Admins always; a
 * moderator only for an application in one of her own regions (never for
 * one without region).
 */
export function canInviteApplicant(role: StaffRole | null, applicationRegionId: string | null) {
  if (!role) return false;
  if (role.kind === 'superAdmin') return true;
  return Boolean(applicationRegionId && role.regionIds.includes(applicationRegionId));
}

/**
 * Region of the invitation: the application's region; for an application
 * without one a Super-Admin names it (`requested`). Null = no valid region.
 */
export function inviteRegionIdFor(
  role: StaffRole | null,
  applicationRegionId: string | null,
  requested: unknown
): string | null {
  if (applicationRegionId) return isRegionId(applicationRegionId) ? applicationRegionId : null;
  if (role?.kind === 'superAdmin' && typeof requested === 'string' && isRegionId(requested)) {
    return requested;
  }
  return null;
}

export interface StaffNotificationInput {
  recipientUid: string;
  kind: StaffNotificationKind;
  audience: StaffNotificationAudience;
  applicationId: string | null;
  name: string;
  email: string | null;
  message: string | null;
  regionIds: string[];
  hasPhoto: boolean;
}

/** One note per recipient for a new application (moderators of the region + Super-Admins). */
export function applicationNotifications(
  docs: readonly StaffDocEntry[],
  applicationId: string,
  app: Pick<ApplicationRecord, 'name' | 'email' | 'message' | 'regionId' | 'hasPhoto'>
): StaffNotificationInput[] {
  const regionIds = app.regionId ? [app.regionId] : [];
  const { superAdminUids, moderatorUids } = staffRecipients(docs, app.regionId ? regionIds : null);
  const base = {
    kind: 'application' as const,
    applicationId,
    name: app.name,
    email: app.email,
    message: app.message,
    regionIds,
    hasPhoto: app.hasPhoto,
  };
  return [
    ...superAdminUids.map((recipientUid) => ({
      ...base,
      recipientUid,
      audience: 'superAdmin' as const,
    })),
    ...moderatorUids.map((recipientUid) => ({
      ...base,
      recipientUid,
      audience: 'moderator' as const,
    })),
  ];
}

/** The three-day reminder: Super-Admins only. */
export function reminderNotifications(
  docs: readonly StaffDocEntry[],
  applicationId: string,
  app: Pick<ApplicationRecord, 'name' | 'email' | 'message' | 'regionId' | 'hasPhoto'>
): StaffNotificationInput[] {
  return staffRecipients(docs, null).superAdminUids.map((recipientUid) => ({
    recipientUid,
    kind: 'applicationReminder',
    audience: 'superAdmin',
    applicationId,
    name: app.name,
    email: app.email,
    message: app.message,
    regionIds: app.regionId ? [app.regionId] : [],
    hasPhoto: app.hasPhoto,
  }));
}

/**
 * "Neue:r Moderator:in für Region X": a confirmation for the Super-Admins and
 * a reminder of the team's chat group for the moderators of those regions.
 * The new moderator herself gets nothing.
 */
export function newModeratorNotifications(
  docs: readonly StaffDocEntry[],
  input: { uid: string; name: string; regionIds: readonly string[]; applicationId: string | null }
): StaffNotificationInput[] {
  const regionIds = REGION_IDS.filter((id) => input.regionIds.includes(id));
  const { superAdminUids, moderatorUids } = staffRecipients(docs, regionIds, [input.uid]);
  const base = {
    kind: 'newModerator' as const,
    applicationId: input.applicationId,
    name: input.name,
    email: null,
    message: null,
    regionIds,
    hasPhoto: false,
  };
  return [
    ...superAdminUids.map((recipientUid) => ({
      ...base,
      recipientUid,
      audience: 'superAdmin' as const,
    })),
    ...moderatorUids.map((recipientUid) => ({
      ...base,
      recipientUid,
      audience: 'moderator' as const,
    })),
  ];
}

/** Mail to the Super-Admins when an application is still open after three days. */
export function buildApplicationReminderMail(
  app: Pick<ApplicationRecord, 'name' | 'email' | 'regionId'>,
  regionName: string | null,
  adminUrl: string
): { subject: string; text: string } {
  const region = regionName ?? 'keine bestimmte Region';
  return {
    subject: `Erinnerung: Bewerbung von ${app.name} ist noch offen`,
    text: [
      `Die Bewerbung als Moderator:in von ${app.name} (${app.email}, Region: ${region}) ist seit drei Tagen offen.`,
      'Bisher hat niemand aus dem Team die Person eingeladen.',
      '',
      `Bewerbung ansehen: ${adminUrl}`,
    ].join('\n'),
  };
}
