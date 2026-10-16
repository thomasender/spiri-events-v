/**
 * Super-Admin callables to switch regions on and off (ticket 32; UI: the
 * "Regionen" tab in the Verwaltung).
 *
 *   adminListRegionActivation()                         status of every region
 *   adminSetRegionActive({ regionId, active, override }) switch one region
 *
 * Security model:
 * - Only Super-Admins (admin_users/{uid}.role == 'Admin') may call them,
 *   checked server-side on every call. Regions-Moderator:innen get
 *   permission-denied.
 * - The activation conditions (regionActivation.ts) are computed here with the
 *   Admin SDK, never taken from the client. Unmet conditions refuse the
 *   activation with `failed-precondition` and details
 *   `{ reason: 'conditions-unmet', unmet, moderatorCount, upcomingEventCount }`
 *   unless the caller passes `override: true` (the UI asks first).
 * - Vorarlberg can never be deactivated.
 * - The region flag and an `admin_audit_log` entry are written in one
 *   transaction. A no-op (region already in that state) writes nothing.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import {
  REGION_MODERATOR_ROLE,
  assertSuperAdmin,
  readRoleDoc,
  type RoleDocReader,
} from './staffRoles';
import { isRegionId } from './regions';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { AUDIT_LOG_COLLECTION } from './adminModerators';
import {
  MIN_REGION_MODERATORS,
  MIN_UPCOMING_EVENTS,
  decideRegionActive,
  regionActivationStatuses,
  type RegionActivationStatus,
  type UnmetCondition,
} from './regionActivation';

if (getApps().length === 0) {
  initializeApp();
}

type Doc = Record<string, unknown>;

export interface RegionAuditEntry {
  action: 'activateRegion' | 'deactivateRegion';
  actorUid: string;
  regionId: string;
  active: boolean;
  /** True when the region was activated although conditions were unmet. */
  override: boolean;
  unmet: UnmetCondition[];
  moderatorCount: number;
  upcomingEventCount: number;
}

/** The writes of one switch; implemented as a Firestore transaction. */
export interface RegionTransaction {
  getRegionDoc(regionId: string): Promise<Doc | null>;
  setRegionActive(regionId: string, active: boolean): void;
  addAuditEntry(entry: RegionAuditEntry): void;
}

export interface RegionStatusDeps {
  readRoleDoc: RoleDocReader;
  /** All admin_users docs with role 'RegionModerator'. */
  listModeratorDocs: () => Promise<Doc[]>;
  /** All events with status 'approved' (only the date/region fields are needed). */
  listApprovedEvents: () => Promise<Doc[]>;
  /** Today as YYYY-MM-DD in Europe/Vienna. */
  today: () => string;
}

export interface SetRegionActiveDeps extends RegionStatusDeps {
  runTransaction: <T>(fn: (tx: RegionTransaction) => Promise<T>) => Promise<T>;
}

export interface SetRegionActiveResult {
  regionId: string;
  active: boolean;
  changed: boolean;
  override: boolean;
  status: RegionActivationStatus;
}

export interface ListRegionActivationResult {
  regions: RegionActivationStatus[];
  minModerators: number;
  minUpcomingEvents: number;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
}

export function parseSetRegionActiveInput(raw: unknown): {
  regionId: string;
  active: boolean;
  override: boolean;
} {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Doc;
  if (!isRegionId(data.regionId)) {
    throw new HttpsError('invalid-argument', 'Unknown region.');
  }
  if (typeof data.active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'active must be true or false.');
  }
  if (data.override !== undefined && typeof data.override !== 'boolean') {
    throw new HttpsError('invalid-argument', 'override must be true or false.');
  }
  return { regionId: data.regionId, active: data.active, override: data.override === true };
}

async function loadStatuses(deps: RegionStatusDeps): Promise<RegionActivationStatus[]> {
  const [moderators, events] = await Promise.all([
    deps.listModeratorDocs(),
    deps.listApprovedEvents(),
  ]);
  return regionActivationStatuses(moderators, events, deps.today());
}

export async function listRegionActivationHandler(
  request: CallableRequest,
  deps: RegionStatusDeps
): Promise<ListRegionActivationResult> {
  await assertSuperAdmin(request.auth?.uid, deps.readRoleDoc);
  return {
    regions: await loadStatuses(deps),
    minModerators: MIN_REGION_MODERATORS,
    minUpcomingEvents: MIN_UPCOMING_EVENTS,
  };
}

export async function setRegionActiveHandler(
  request: CallableRequest,
  deps: SetRegionActiveDeps
): Promise<SetRegionActiveResult> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  const { regionId, active, override } = parseSetRegionActiveInput(request.data);

  // Counts are read outside the transaction (a query over all approved events
  // would lock them all); a race with a single event approval is harmless.
  const status = (await loadStatuses(deps)).find((s) => s.regionId === regionId);
  if (!status) {
    throw new HttpsError('invalid-argument', 'Unknown region.');
  }

  return deps.runTransaction(async (tx) => {
    const current = await tx.getRegionDoc(regionId);
    if (!current) {
      // Region docs are created by scripts/seed-regions.mjs; never invent one here.
      throw new HttpsError('not-found', 'Region document does not exist.');
    }
    const decision = decideRegionActive({
      regionId,
      active,
      override,
      currentActive: current.active === true,
      status,
    });
    switch (decision.kind) {
      case 'refuse-permanent':
        throw new HttpsError('failed-precondition', 'Vorarlberg cannot be deactivated.', {
          reason: 'permanent-region',
        });
      case 'refuse-unmet':
        throw new HttpsError('failed-precondition', 'Activation conditions not met.', {
          reason: 'conditions-unmet',
          unmet: decision.unmet,
          moderatorCount: status.moderatorCount,
          upcomingEventCount: status.upcomingEventCount,
          minModerators: MIN_REGION_MODERATORS,
          minUpcomingEvents: MIN_UPCOMING_EVENTS,
        });
      case 'unchanged':
        return { regionId, active, changed: false, override: false, status };
      case 'write':
        tx.setRegionActive(regionId, active);
        tx.addAuditEntry({
          action: active ? 'activateRegion' : 'deactivateRegion',
          actorUid: actorUid as string,
          regionId,
          active,
          override: decision.override,
          unmet: status.unmet,
          moderatorCount: status.moderatorCount,
          upcomingEventCount: status.upcomingEventCount,
        });
        return { regionId, active, changed: true, override: decision.override, status };
    }
  });
}

// ── Firebase wiring ──────────────────────────────────────────────────────

function viennaToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

const statusDeps: RegionStatusDeps = {
  readRoleDoc,
  async listModeratorDocs() {
    const snap = await getFirestore()
      .collection('admin_users')
      .where('role', '==', REGION_MODERATOR_ROLE)
      .get();
    return snap.docs.map((d) => d.data());
  },
  async listApprovedEvents() {
    const snap = await getFirestore()
      .collection('events')
      .where('status', '==', 'approved')
      .select(
        'status',
        'regionId',
        'isOnline',
        'date',
        'endDate',
        'recurrence',
        'recurrenceEndDate',
        'customDates',
        'exceptionDates'
      )
      .get();
    return snap.docs.map((d) => d.data());
  },
  today: viennaToday,
};

const setRegionActiveDeps: SetRegionActiveDeps = {
  ...statusDeps,
  runTransaction: (fn) => {
    const db = getFirestore();
    return db.runTransaction(async (t) => {
      const writes: Array<() => void> = [];
      const tx: RegionTransaction = {
        async getRegionDoc(regionId) {
          const snap = await t.get(db.collection('regions').doc(regionId));
          return snap.exists ? (snap.data() ?? {}) : null;
        },
        setRegionActive(regionId, active) {
          // Only keys firestore.rules' isValidRegion allows, so the doc stays
          // editable from the client afterwards.
          writes.push(() =>
            t.update(db.collection('regions').doc(regionId), {
              active,
              updatedAt: FieldValue.serverTimestamp(),
            })
          );
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

export const adminListRegionActivation = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<ListRegionActivationResult> => {
    logMissingAppCheck('adminListRegionActivation', request);
    return listRegionActivationHandler(request, statusDeps);
  }
);

export const adminSetRegionActive = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<SetRegionActiveResult> => {
    logMissingAppCheck('adminSetRegionActive', request);
    const result = await setRegionActiveHandler(request, setRegionActiveDeps);
    if (result.changed) {
      logger.info('adminSetRegionActive', {
        actorUid: request.auth?.uid,
        regionId: result.regionId,
        active: result.active,
        override: result.override,
      });
    }
    return result;
  }
);
