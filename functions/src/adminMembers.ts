import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  REGION_MODERATOR_ROLE,
  SUPER_ADMIN_ROLE,
  assertStaff,
  assertSuperAdmin,
  profileEditableByModerator,
  readRoleDoc,
  profileVisibleToModerator,
  type StaffRole,
} from './staffRoles';
import { DEFAULT_REGION_ID, DIRECTORY_REGIONS, isRegionId } from './regions';
import { ensureCustomRegions } from './customRegions';
import { ALLOWED_ORIGINS } from './allowedOrigins';

if (getApps().length === 0) {
  initializeApp();
}

const DISPLAY_NAME_MAX = 80;
const USERNAME_MAX = 40;
const MAX_CATEGORIES = 5;
const MAX_CATEGORY_LENGTH = 60;

export interface MemberRow {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  username: string;
  slug: string;
  photoURL: string;
  listedInDirectory: boolean;
  directoryHidden: boolean;
  directoryCategories: string[];
  directoryRegions: string[];
  directoryRegionIds: string[];
  instagramConsent: boolean;
  instagramHandle: string;
  // Vereinsmitglied (badge on the profile photo). Super-Admin scope only.
  clubMember: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  disabled: boolean;
  // Super-Admin scope only (listMembersHandler): existing staff role.
  staffRole?: 'Admin' | 'RegionModerator' | null;
}

export interface AuthRecord {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  disabled?: boolean;
  displayName?: string;
  photoURL?: string;
  metadata?: { creationTime?: string; lastSignInTime?: string };
  customClaims?: Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Merges an Auth record with the (optional) public profile document into the
// flat row the admin table shows.
export function buildMemberRow(
  user: AuthRecord,
  profile: Record<string, unknown> = {},
  privateProfile: Record<string, unknown> = {}
): MemberRow {
  const social = privateProfile.socialMedia;
  const instagram =
    social && typeof social === 'object' ? str((social as Record<string, unknown>).instagram) : '';
  return {
    uid: user.uid,
    email: user.email ?? null,
    emailVerified: user.emailVerified === true,
    displayName: str(profile.displayName) || str(user.displayName),
    username: str(profile.username),
    slug: str(profile.slug),
    photoURL: str(profile.photoURL) || str(user.photoURL),
    listedInDirectory: profile.listedInDirectory === true,
    directoryHidden: profile.directoryHidden === true,
    directoryCategories: strList(profile.directoryCategories),
    directoryRegions: strList(profile.directoryRegions),
    directoryRegionIds: strList(profile.directoryRegionIds).filter(isRegionId),
    instagramConsent: privateProfile.instagramConsentDefault === true,
    instagramHandle: instagram.trim(),
    clubMember: profile.clubMember === true,
    createdAt: toIso(user.metadata?.creationTime),
    lastSignInAt: toIso(user.metadata?.lastSignInTime),
    disabled: user.disabled === true,
  };
}

export interface MemberPatch {
  displayName?: string;
  username?: string;
  directoryCategories?: string[];
  directoryRegions?: string[];
  listedInDirectory?: boolean;
  clubMember?: boolean;
}

// Patch fields that live only on the public profile (no copy on users/{uid}).
// clubMember: set by Super-Admins only; the owner's rules exclude it.
export const PUBLIC_ONLY_MEMBER_FIELDS: readonly (keyof MemberPatch)[] = ['clubMember'];

// Validates an admin edit. Only the whitelisted public-profile fields are
// accepted; the e-mail address (login) is deliberately not editable here.
export function validateMemberPatch(
  raw: unknown,
  extraDistricts: readonly string[] = []
): MemberPatch {
  if (!raw || typeof raw !== 'object') {
    throw new HttpsError('invalid-argument', 'changes must be an object.');
  }
  const input = raw as Record<string, unknown>;
  const allowed = [
    'displayName',
    'username',
    'directoryCategories',
    'directoryRegions',
    'listedInDirectory',
    'clubMember',
  ];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw new HttpsError('invalid-argument', `Field "${key}" cannot be edited.`);
    }
  }
  const patch: MemberPatch = {};
  if ('displayName' in input) {
    const v = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    if (!v || v.length > DISPLAY_NAME_MAX) {
      throw new HttpsError('invalid-argument', 'displayName is empty or too long.');
    }
    patch.displayName = v;
  }
  if ('username' in input) {
    const v = typeof input.username === 'string' ? input.username.trim() : '';
    if (v.length > USERNAME_MAX) {
      throw new HttpsError('invalid-argument', 'username is too long.');
    }
    patch.username = v;
  }
  if ('directoryRegions' in input) {
    const list = strList(input.directoryRegions);
    if (list.some((r) => !DIRECTORY_REGIONS.includes(r) && !extraDistricts.includes(r))) {
      throw new HttpsError('invalid-argument', 'Unknown region.');
    }
    patch.directoryRegions = Array.from(new Set(list));
  }
  if ('directoryCategories' in input) {
    const list = Array.from(
      new Set(
        strList(input.directoryCategories)
          .map((c) => c.trim())
          .filter(Boolean)
      )
    );
    if (list.length > MAX_CATEGORIES || list.some((c) => c.length > MAX_CATEGORY_LENGTH)) {
      throw new HttpsError('invalid-argument', 'Too many or too long categories.');
    }
    patch.directoryCategories = list;
  }
  if ('listedInDirectory' in input) {
    if (typeof input.listedInDirectory !== 'boolean') {
      throw new HttpsError('invalid-argument', 'listedInDirectory must be a boolean.');
    }
    patch.listedInDirectory = input.listedInDirectory;
  }
  if ('clubMember' in input) {
    if (typeof input.clubMember !== 'boolean') {
      throw new HttpsError('invalid-argument', 'clubMember must be a boolean.');
    }
    patch.clubMember = input.clubMember;
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpsError('invalid-argument', 'No changes given.');
  }
  return patch;
}

// Super-Admin only (role 'Admin' in admin_users). Kept under its old name for
// adminAnalyticsReport; region moderators do NOT pass it.
export function assertAdmin(uid: string | undefined): Promise<void> {
  return assertSuperAdmin(uid);
}

// What a region moderator gets per member: what the public profile shows plus
// registration date and the Instagram handle/sharing consent (product owner
// decision). No e-mail, sign-in metadata or account state.
export interface ModeratorMemberRow {
  uid: string;
  displayName: string;
  username: string;
  slug: string;
  photoURL: string;
  listedInDirectory: boolean;
  directoryHidden: boolean;
  directoryCategories: string[];
  directoryRegions: string[];
  directoryRegionIds: string[];
  instagramConsent: boolean;
  instagramHandle: string;
  createdAt: string | null;
}

export function toModeratorMemberRow(row: MemberRow): ModeratorMemberRow {
  return {
    uid: row.uid,
    displayName: row.displayName,
    username: row.username,
    slug: row.slug,
    photoURL: row.photoURL,
    listedInDirectory: row.listedInDirectory,
    directoryHidden: row.directoryHidden,
    directoryCategories: row.directoryCategories,
    directoryRegions: row.directoryRegions,
    directoryRegionIds: row.directoryRegionIds,
    instagramConsent: row.instagramConsent,
    instagramHandle: row.instagramHandle,
    createdAt: row.createdAt,
  };
}

export type MemberListResult =
  | { scope: { role: 'Admin' }; members: MemberRow[] }
  | { scope: { role: 'RegionModerator'; regionIds: string[] }; members: ModeratorMemberRow[] };

type Doc = Record<string, unknown>;

// Super-Admin: every member with all fields (unchanged). Moderator: only
// members whose public profile is listed in one of her regions (profiles
// without directoryRegionIds count as Vorarlberg, members without a profile
// belong to no region), reduced to ModeratorMemberRow.
export function membersForRole(
  role: StaffRole,
  users: AuthRecord[],
  profiles: Map<string, Doc>,
  privates: Map<string, Doc>
): MemberListResult {
  if (role.kind === 'superAdmin') {
    return {
      scope: { role: 'Admin' },
      members: users.map((u) => buildMemberRow(u, profiles.get(u.uid), privates.get(u.uid))),
    };
  }
  return {
    scope: { role: 'RegionModerator', regionIds: [...role.regionIds] },
    members: users
      .filter((u) => profileVisibleToModerator(profiles.get(u.uid), role.regionIds))
      .map((u) =>
        toModeratorMemberRow(buildMemberRow(u, profiles.get(u.uid), privates.get(u.uid) ?? {}))
      ),
  };
}

export interface ListMembersDeps {
  readRoleDoc: (uid: string) => Promise<Doc | null>;
  listAuthUsers: () => Promise<AuthRecord[]>;
  readDocs: (paths: string[]) => Promise<Map<string, Doc>>;
}

export async function listMembersHandler(
  request: { auth?: { uid?: string } | null },
  deps: ListMembersDeps
): Promise<MemberListResult> {
  const role = await assertStaff(request.auth?.uid, deps.readRoleDoc);
  const users = await deps.listAuthUsers();
  const byUid = async (path: (uid: string) => string) => {
    const docs = await deps.readDocs(users.map((u) => path(u.uid)));
    const map = new Map<string, Doc>();
    for (const u of users) {
      const d = docs.get(path(u.uid));
      if (d) map.set(u.uid, d);
    }
    return map;
  };
  const profiles = await byUid((uid) => `users/${uid}/publicProfile/data`);
  // Instagram consent + handle live in the private users/{uid} doc. A
  // moderator gets them only for members of her regions, so only those are read.
  if (role.kind !== 'superAdmin') {
    const visible = users.filter((u) =>
      profileVisibleToModerator(profiles.get(u.uid), role.regionIds)
    );
    const docs = await deps.readDocs(visible.map((u) => `users/${u.uid}`));
    const visiblePrivates = new Map<string, Doc>();
    for (const u of visible) {
      const d = docs.get(`users/${u.uid}`);
      if (d) visiblePrivates.set(u.uid, d);
    }
    return membersForRole(role, users, profiles, visiblePrivates);
  }
  const privates = await byUid((uid) => `users/${uid}`);
  // Super-Admins also see who already has a staff role, so the Moderation tab
  // can show Super-Admins as such instead of offering them as moderators.
  const staffDocs = await byUid((uid) => `admin_users/${uid}`);
  const claimsByUid = new Map(users.map((u) => [u.uid, u.customClaims]));
  const result = membersForRole(role, users, profiles, privates) as {
    scope: { role: 'Admin' };
    members: MemberRow[];
  };
  return {
    ...result,
    members: result.members.map((m) => ({
      ...m,
      staffRole: memberStaffRole(staffDocs.get(m.uid) ?? null, claimsByUid.get(m.uid)),
    })),
  };
}

/**
 * Staff role of a member as the role callables see it: token claim 'Admin'
 * or any admin_users doc that is not a moderator doc counts as Super-Admin
 * (adminSetRegionModerator refuses to touch those).
 */
export function memberStaffRole(
  doc: Doc | null,
  claims: Record<string, unknown> | undefined
): 'Admin' | 'RegionModerator' | null {
  if (claims?.role === SUPER_ADMIN_ROLE) return 'Admin';
  if (!doc) return null;
  return doc.role === REGION_MODERATOR_ROLE ? 'RegionModerator' : 'Admin';
}

// Fields a region moderator may change on a member of her region(s):
// directory curation only, not the identity (display name, username) and not
// the Vereinsmitgliedschaft (clubMember), which stays with the Super-Admins.
export const MODERATOR_MEMBER_FIELDS: readonly (keyof MemberPatch)[] = [
  'listedInDirectory',
  'directoryCategories',
  'directoryRegions',
];

export interface UpdateMemberDeps {
  readRoleDoc: (uid: string) => Promise<Doc | null>;
  readProfiles: (uid: string) => Promise<{ publicData: Doc | null; privateData: Doc | null }>;
  // Districts stored in regions/{id}.bezirke (e.g. Tirol), valid next to the
  // built-in DIRECTORY_REGIONS. Optional: without it only the built-in list counts.
  readRegionDistricts?: () => Promise<string[]>;
  // `update` goes to the public profile; `privateUpdate` (defaults to the same
  // doc) to users/{uid}, without the public-only fields.
  writeProfiles: (
    uid: string,
    update: Doc,
    targets: { public: boolean; private: boolean },
    privateUpdate?: Doc
  ) => Promise<void>;
}

function hasDirectoryRegionIds(profile: Doc | null): boolean {
  const ids = profile?.directoryRegionIds;
  return Array.isArray(ids) && ids.length > 0;
}

export async function updateMemberHandler(
  request: { auth?: { uid?: string } | null; data?: unknown },
  deps: UpdateMemberDeps
): Promise<{ ok: true }> {
  const role = await assertStaff(request.auth?.uid, deps.readRoleDoc);
  const data = (request.data ?? {}) as { uid?: unknown; changes?: unknown };
  if (typeof data.uid !== 'string' || !data.uid || data.uid.includes('/')) {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }
  const uid = data.uid;
  const changes = data.changes as Record<string, unknown> | null | undefined;
  const extraDistricts =
    changes && typeof changes === 'object' && 'directoryRegions' in changes
      ? ((await deps.readRegionDistricts?.()) ?? [])
      : [];
  const patch = validateMemberPatch(data.changes, extraDistricts);

  const { publicData, privateData } = await deps.readProfiles(uid);
  if (role.kind === 'regionModerator') {
    const forbidden = Object.keys(patch).filter(
      (k) => !MODERATOR_MEMBER_FIELDS.includes(k as keyof MemberPatch)
    );
    if (forbidden.length > 0) {
      throw new HttpsError('permission-denied', 'Moderators cannot change these fields.');
    }
    // Staff accounts (Super-Admins, other moderators) are off limits, as are
    // members listed (also) outside her regions.
    if ((await deps.readRoleDoc(uid)) !== null) {
      throw new HttpsError('permission-denied', 'Staff accounts cannot be changed here.');
    }
    if (!profileEditableByModerator(publicData, role.regionIds)) {
      throw new HttpsError('permission-denied', 'Member is not (only) in your regions.');
    }
  }
  if (!publicData && !privateData) {
    throw new HttpsError('not-found', 'Member has no profile yet.');
  }
  if ('clubMember' in patch && !publicData) {
    throw new HttpsError('failed-precondition', 'Member has no public profile yet.');
  }

  const current = { ...(privateData ?? {}), ...(publicData ?? {}) };
  const merged = { ...current, ...patch };
  if (merged.listedInDirectory === true && strList(merged.directoryCategories).length < 1) {
    throw new HttpsError('failed-precondition', 'A directory listing needs at least one category.');
  }

  const update: Doc = { ...patch, updatedAt: FieldValue.serverTimestamp() };
  // A listing must carry its regions, or the region-scoped directory query
  // (array-contains on directoryRegionIds, used once the regionId migration is
  // marked complete) would miss it. Profiles that never saved the form (e.g.
  // fresh sign-ups) have none: give them the region they are read as.
  if (merged.listedInDirectory === true && !hasDirectoryRegionIds(publicData)) {
    update.directoryRegionIds = [DEFAULT_REGION_ID];
  }
  const privateUpdate: Doc = { ...update };
  for (const key of PUBLIC_ONLY_MEMBER_FIELDS) delete privateUpdate[key];
  // Nothing but public-only fields changed: leave users/{uid} alone.
  const touchesPrivate = Object.keys(patch).some(
    (k) => !PUBLIC_ONLY_MEMBER_FIELDS.includes(k as keyof MemberPatch)
  );
  try {
    await deps.writeProfiles(
      uid,
      update,
      { public: !!publicData, private: !!privateData && touchesPrivate },
      privateUpdate
    );
  } catch (err) {
    logger.error('adminUpdateMember: batch commit failed', { uid, err });
    throw new HttpsError('internal', `Save failed: ${(err as Error)?.message ?? 'unknown'}`);
  }
  return { ok: true };
}

const listMembersDeps: ListMembersDeps = {
  readRoleDoc,
  async listAuthUsers() {
    const auth = getAuth();
    const users: AuthRecord[] = [];
    let pageToken: string | undefined;
    do {
      const page = await auth.listUsers(1000, pageToken);
      users.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken);
    return users;
  },
  async readDocs(paths) {
    const db = getFirestore();
    const out = new Map<string, Doc>();
    // getAll accepts many refs but keep batches modest.
    for (let i = 0; i < paths.length; i += 300) {
      const chunk = paths.slice(i, i + 300);
      const snaps = await db.getAll(...chunk.map((p) => db.doc(p)));
      snaps.forEach((snap, idx) => {
        if (snap.exists) out.set(chunk[idx], snap.data() ?? {});
      });
    }
    return out;
  },
};

const updateMemberDeps: UpdateMemberDeps = {
  readRoleDoc,
  async readProfiles(uid) {
    const db = getFirestore();
    const [publicSnap, privateSnap] = await Promise.all([
      db.doc(`users/${uid}/publicProfile/data`).get(),
      db.doc(`users/${uid}`).get(),
    ]);
    return {
      publicData: publicSnap.exists ? (publicSnap.data() ?? {}) : null,
      privateData: privateSnap.exists ? (privateSnap.data() ?? {}) : null,
    };
  },
  async readRegionDistricts() {
    const snap = await getFirestore().collection('regions').get();
    return snap.docs.flatMap((d) => strList(d.data().bezirke));
  },
  async writeProfiles(uid, update, targets, privateUpdate = update) {
    const db = getFirestore();
    const batch = db.batch();
    if (targets.public) batch.update(db.doc(`users/${uid}/publicProfile/data`), update);
    if (targets.private) batch.update(db.doc(`users/${uid}`), privateUpdate);
    await batch.commit();
  },
};

// Super-Admins get every member; region moderators only members of their
// region(s) without sensitive fields (see membersForRole). Everyone else is
// rejected server-side.
export const adminListMembers = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<MemberListResult> => {
    logMissingAppCheck('adminListMembers', request);
    await ensureCustomRegions();
    return listMembersHandler(request, listMembersDeps);
  }
);

export const adminUpdateMember = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<{ ok: true }> => {
    logMissingAppCheck('adminUpdateMember', request);
    await ensureCustomRegions();
    return updateMemberHandler(request, updateMemberDeps);
  }
);
