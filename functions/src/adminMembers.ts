import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

const ALLOWED_ORIGINS = [
  'https://www.thetribe.at',
  'https://thetribe.at',
  'https://spirieventsvbg.web.app',
  'http://localhost:5180',
];

const BEZIRKE = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'];
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
  createdAt: string | null;
  lastSignInAt: string | null;
  disabled: boolean;
}

export interface AuthRecord {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  disabled?: boolean;
  displayName?: string;
  photoURL?: string;
  metadata?: { creationTime?: string; lastSignInTime?: string };
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
export function buildMemberRow(user: AuthRecord, profile: Record<string, unknown> = {}): MemberRow {
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
}

// Validates an admin edit. Only the whitelisted public-profile fields are
// accepted; the e-mail address (login) is deliberately not editable here.
export function validateMemberPatch(raw: unknown): MemberPatch {
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
    if (list.some((r) => !BEZIRKE.includes(r))) {
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
  if (Object.keys(patch).length === 0) {
    throw new HttpsError('invalid-argument', 'No changes given.');
  }
  return patch;
}

async function assertAdmin(uid: string | undefined): Promise<void> {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const snap = await getFirestore().collection('admin_users').doc(uid).get();
  if (!snap.exists || snap.data()?.role !== 'Admin') {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
}

export const adminListMembers = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS },
  async (request): Promise<{ members: MemberRow[] }> => {
    await assertAdmin(request.auth?.uid);

    const auth = getAuth();
    const users: AuthRecord[] = [];
    let pageToken: string | undefined;
    do {
      const page = await auth.listUsers(1000, pageToken);
      users.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken);

    const db = getFirestore();
    const profiles = new Map<string, Record<string, unknown>>();
    const refs = users.map((u) => db.doc(`users/${u.uid}/publicProfile/data`));
    // getAll accepts many refs but keep batches modest.
    for (let i = 0; i < refs.length; i += 300) {
      const snaps = await db.getAll(...refs.slice(i, i + 300));
      snaps.forEach((snap, idx) => {
        if (snap.exists) profiles.set(users[i + idx].uid, snap.data() ?? {});
      });
    }

    return { members: users.map((u) => buildMemberRow(u, profiles.get(u.uid))) };
  }
);

export const adminUpdateMember = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS },
  async (request): Promise<{ ok: true }> => {
    await assertAdmin(request.auth?.uid);
    const data = (request.data ?? {}) as { uid?: unknown; changes?: unknown };
    if (typeof data.uid !== 'string' || !data.uid) {
      throw new HttpsError('invalid-argument', 'uid is required.');
    }
    const patch = validateMemberPatch(data.changes);

    const db = getFirestore();
    const publicRef = db.doc(`users/${data.uid}/publicProfile/data`);
    const privateRef = db.doc(`users/${data.uid}`);
    const [publicSnap, privateSnap] = await Promise.all([publicRef.get(), privateRef.get()]);
    if (!publicSnap.exists && !privateSnap.exists) {
      throw new HttpsError('not-found', 'Member has no profile yet.');
    }

    const current = { ...(privateSnap.data() ?? {}), ...(publicSnap.data() ?? {}) };
    const merged = { ...current, ...patch };
    if (merged.listedInDirectory === true && strList(merged.directoryCategories).length < 1) {
      throw new HttpsError(
        'failed-precondition',
        'A directory listing needs at least one category.'
      );
    }

    const update = { ...patch, updatedAt: FieldValue.serverTimestamp() };
    const batch = db.batch();
    if (publicSnap.exists) batch.update(publicRef, update);
    if (privateSnap.exists) batch.update(privateRef, update);
    try {
      await batch.commit();
    } catch (err) {
      logger.error('adminUpdateMember: batch commit failed', { uid: data.uid, err });
      throw new HttpsError('internal', `Save failed: ${(err as Error)?.message ?? 'unknown'}`);
    }
    return { ok: true };
  }
);
