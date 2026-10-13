/**
 * Super-Admin callables to manage Regions-Moderator:innen (ticket 18; the UI
 * follows in ticket 19).
 *
 *   adminSetRegionModerator({ uid, regionIds })  grant / change / revoke ([])
 *   adminListRegionModerators()                  current moderators
 *
 * Security model:
 * - Only Super-Admins (admin_users/{uid}.role == 'Admin') may call them,
 *   checked server-side on every call. Moderators cannot manage moderators.
 * - admin_users is written here via the Admin SDK only; firestore.rules lets
 *   no client write it.
 * - These functions never create, change or remove a Super-Admin: a target
 *   whose admin_users doc has any role other than 'RegionModerator', or whose
 *   token carries role 'Admin', is refused. Hence the number of Super-Admins
 *   can never drop through them ("the last Super-Admin cannot be removed"
 *   holds trivially; demoting Admins is out of scope and stays a manual
 *   step via the Firebase console / a script).
 * - A caller can never target herself (no self-promotion, no self-lockout).
 * - Every effective change writes an `admin_audit_log` entry in the same
 *   transaction as the role change. A no-op (same regions, or revoking a
 *   non-moderator) writes nothing and reports `changed: false`.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Timestamp } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import {
  REGION_MODERATOR_ROLE,
  SUPER_ADMIN_ROLE,
  assertSuperAdmin,
  readRoleDoc,
  validateModeratorRegionIds,
  type RoleDocReader,
} from './staffRoles';
import { REGION_IDS } from './regions';

if (getApps().length === 0) {
  initializeApp();
}

const ALLOWED_ORIGINS = [
  'https://www.thetribe.at',
  'https://thetribe.at',
  'https://spirieventsvbg.web.app',
  'http://localhost:5180',
];

export const AUDIT_LOG_COLLECTION = 'admin_audit_log';

type Doc = Record<string, unknown>;

export interface TargetUser {
  uid: string;
  email?: string;
  displayName?: string;
  disabled?: boolean;
  customClaims?: Record<string, unknown>;
}

export interface RoleSnapshot {
  role: string;
  regionIds: string[];
}

export interface AuditEntry {
  action: 'grantRegionModerator' | 'updateRegionModerator' | 'revokeRegionModerator';
  actorUid: string;
  targetUid: string;
  targetEmail: string | null;
  before: RoleSnapshot | null;
  after: RoleSnapshot | null;
}

/** The writes of one role change; implemented as a Firestore transaction. */
export interface RoleTransaction {
  getRoleDoc(uid: string): Promise<Doc | null>;
  setModerator(
    uid: string,
    data: { regionIds: string[]; email: string | null; updatedBy: string }
  ): void;
  deleteRoleDoc(uid: string): void;
  addAuditEntry(entry: AuditEntry): void;
}

export interface SetModeratorDeps {
  readRoleDoc: RoleDocReader;
  getUser: (uid: string) => Promise<TargetUser | null>;
  runTransaction: <T>(fn: (tx: RoleTransaction) => Promise<T>) => Promise<T>;
}

export interface SetModeratorResult {
  uid: string;
  role: 'RegionModerator' | null;
  regionIds: string[];
  changed: boolean;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
}

export function assertTargetUid(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }
  const uid = raw.trim();
  if (!uid || uid.length > 128 || uid.includes('/')) {
    throw new HttpsError('invalid-argument', 'uid is invalid.');
  }
  return uid;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function storedRegionIds(doc: Doc): string[] {
  const raw = Array.isArray(doc.regionIds) ? doc.regionIds : [];
  return REGION_IDS.filter((id) => raw.includes(id));
}

export async function setRegionModeratorHandler(
  request: CallableRequest,
  deps: SetModeratorDeps
): Promise<SetModeratorResult> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);

  const data = (request.data ?? {}) as { uid?: unknown; regionIds?: unknown };
  const uid = assertTargetUid(data.uid);
  if (uid === actorUid) {
    throw new HttpsError('failed-precondition', 'You cannot change your own role.');
  }
  const regionIds = validateModeratorRegionIds(data.regionIds);

  const user = await deps.getUser(uid);
  if (!user) {
    throw new HttpsError('not-found', 'No account with this uid.');
  }
  if (user.customClaims?.role === SUPER_ADMIN_ROLE) {
    throw new HttpsError('failed-precondition', 'Super-Admins cannot be changed here.');
  }
  const email = typeof user.email === 'string' && user.email ? user.email : null;

  return deps.runTransaction(async (tx) => {
    const current = await tx.getRoleDoc(uid);
    // Any existing doc that is not a moderator doc (role 'Admin', a missing
    // or unknown role) belongs to a Super-Admin or is unknown: never touch it.
    if (current && current.role !== REGION_MODERATOR_ROLE) {
      throw new HttpsError('failed-precondition', 'Super-Admins cannot be changed here.');
    }
    const before: RoleSnapshot | null = current
      ? { role: REGION_MODERATOR_ROLE, regionIds: storedRegionIds(current) }
      : null;

    if (regionIds.length === 0) {
      if (!current) return { uid, role: null, regionIds: [], changed: false };
      tx.deleteRoleDoc(uid);
      tx.addAuditEntry({
        action: 'revokeRegionModerator',
        actorUid: actorUid as string,
        targetUid: uid,
        targetEmail: email,
        before,
        after: null,
      });
      return { uid, role: null, regionIds: [], changed: true };
    }

    // Idempotent: the same regions again change nothing (a doc with unknown
    // or duplicate ids is rewritten in canonical form).
    if (current && Array.isArray(current.regionIds) && sameIds(current.regionIds, regionIds)) {
      return { uid, role: REGION_MODERATOR_ROLE, regionIds, changed: false };
    }

    tx.setModerator(uid, { regionIds, email, updatedBy: actorUid as string });
    tx.addAuditEntry({
      action: current ? 'updateRegionModerator' : 'grantRegionModerator',
      actorUid: actorUid as string,
      targetUid: uid,
      targetEmail: email,
      before,
      after: { role: REGION_MODERATOR_ROLE, regionIds },
    });
    return { uid, role: REGION_MODERATOR_ROLE, regionIds, changed: true };
  });
}

export interface ModeratorListEntry {
  uid: string;
  email: string | null;
  displayName: string;
  disabled: boolean;
  regionIds: string[];
  updatedAt: string | null;
}

export interface ListModeratorsDeps {
  readRoleDoc: RoleDocReader;
  listModeratorDocs: () => Promise<Array<{ uid: string; data: Doc }>>;
  getUsers: (uids: string[]) => Promise<TargetUser[]>;
}

function toIso(value: unknown): string | null {
  if (value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString();
  }
  return null;
}

export async function listRegionModeratorsHandler(
  request: CallableRequest,
  deps: ListModeratorsDeps
): Promise<{ moderators: ModeratorListEntry[] }> {
  await assertSuperAdmin(request.auth?.uid, deps.readRoleDoc);
  const docs = (await deps.listModeratorDocs()).filter(
    (d) => d.data.role === REGION_MODERATOR_ROLE
  );
  const users = new Map((await deps.getUsers(docs.map((d) => d.uid))).map((u) => [u.uid, u]));
  const moderators = docs.map((d) => {
    const user = users.get(d.uid);
    return {
      uid: d.uid,
      email: user?.email ?? (typeof d.data.email === 'string' ? d.data.email : null),
      displayName: user?.displayName ?? '',
      disabled: user?.disabled === true,
      regionIds: storedRegionIds(d.data),
      updatedAt: toIso(d.data.updatedAt),
    };
  });
  moderators.sort((a, b) =>
    (a.displayName || a.email || a.uid).localeCompare(b.displayName || b.email || b.uid, 'de')
  );
  return { moderators };
}

// ── Firebase wiring ──────────────────────────────────────────────────────

async function getUserOrNull(uid: string): Promise<TargetUser | null> {
  try {
    return await getAuth().getUser(uid);
  } catch (err) {
    if ((err as { code?: string })?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

const setModeratorDeps: SetModeratorDeps = {
  readRoleDoc,
  getUser: getUserOrNull,
  runTransaction: (fn) => {
    const db = getFirestore();
    return db.runTransaction(async (t) => {
      const writes: Array<() => void> = [];
      const tx: RoleTransaction = {
        async getRoleDoc(uid) {
          const snap = await t.get(db.collection('admin_users').doc(uid));
          return snap.exists ? (snap.data() ?? {}) : null;
        },
        setModerator(uid, { regionIds, email, updatedBy }) {
          writes.push(() =>
            t.set(db.collection('admin_users').doc(uid), {
              role: REGION_MODERATOR_ROLE,
              regionIds,
              email,
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy,
            })
          );
        },
        deleteRoleDoc(uid) {
          writes.push(() => t.delete(db.collection('admin_users').doc(uid)));
        },
        addAuditEntry(entry) {
          writes.push(() =>
            t.create(db.collection(AUDIT_LOG_COLLECTION).doc(), {
              ...entry,
              createdAt: FieldValue.serverTimestamp(),
            })
          );
        },
      };
      const result = await fn(tx);
      // All reads happen before any write, as Firestore transactions require.
      writes.forEach((w) => w());
      return result;
    });
  },
};

const listModeratorsDeps: ListModeratorsDeps = {
  readRoleDoc,
  async listModeratorDocs() {
    const snap = await getFirestore()
      .collection('admin_users')
      .where('role', '==', REGION_MODERATOR_ROLE)
      .get();
    return snap.docs.map((d) => ({ uid: d.id, data: d.data() }));
  },
  async getUsers(uids) {
    const out: TargetUser[] = [];
    // Auth getUsers accepts at most 100 identifiers per call.
    for (let i = 0; i < uids.length; i += 100) {
      const res = await getAuth().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
      out.push(...res.users);
    }
    return out;
  },
};

export const adminSetRegionModerator = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<SetModeratorResult> => {
    logMissingAppCheck('adminSetRegionModerator', request);
    const result = await setRegionModeratorHandler(request, setModeratorDeps);
    if (result.changed) {
      logger.info('adminSetRegionModerator', {
        actorUid: request.auth?.uid,
        targetUid: result.uid,
        regionIds: result.regionIds,
      });
    }
    return result;
  }
);

export const adminListRegionModerators = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<{ moderators: ModeratorListEntry[] }> => {
    logMissingAppCheck('adminListRegionModerators', request);
    return listRegionModeratorsHandler(request, listModeratorsDeps);
  }
);
