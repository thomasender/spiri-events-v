/**
 * Super-Admin callables for the Landkreis / Bezirk -> region mapping (UI: the
 * "Zuordnung" tab in the Verwaltung; pure logic in regionMapping.ts).
 *
 *   adminGetRegionMappingLocks()              districts that still have events
 *   adminSaveRegionMapping({ moves })         move districts to other regions
 *
 * Security model:
 * - Only Super-Admins (admin_users/{uid}.role == 'Admin') may call them, checked
 *   server-side on every call.
 * - The backend structure (which districts exist, and which country they are in)
 *   is fixed in the generated register; the client can only name districts from
 *   it and regions of the same country. Everything is validated again here.
 * - A district that still has events (in the region that holds it) cannot move:
 *   events keep their `regionId`, so moving would hide them. That keeps the
 *   mapping free of any event migration; it is meant to be edited BEFORE a region
 *   gets events. `failed-precondition` with `reason: 'events-in-district'`.
 * - An active region can never lose its last district.
 * - The new lists and an `admin_audit_log` entry are written in one batch.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { assertSuperAdmin, readRoleDoc, type RoleDocReader } from './staffRoles';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { AUDIT_LOG_COLLECTION } from './adminModerators';
import { REGION_DATA } from './regionData';
import { resolveRegionId } from './regions';
import {
  CATALOG_BY_KEY,
  buildMappingRegisters,
  currentAssignment,
  planMappingChange,
  type MappingChange,
  type MappingMove,
  type MappingRegion,
} from './regionMapping';

if (getApps().length === 0) {
  initializeApp();
}

type Doc = Record<string, unknown>;

const MAX_MOVES = 700;

export interface RegionMappingDeps {
  readRoleDoc: RoleDocReader;
  /** All `regions/{id}` docs. */
  listRegionDocs: () => Promise<Array<{ id: string; data: Doc }>>;
  /** Every event, only `bezirk` and `regionId` are needed. */
  listEventDistricts: () => Promise<Doc[]>;
  /** Writes the changed region docs and the audit entry in one batch. */
  commit: (args: {
    actorUid: string;
    changes: MappingChange[];
    regions: MappingRegion[];
  }) => Promise<void>;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
}

export interface RegionMappingLocks {
  /** district key ("DE|Roth") -> number of events in it. */
  locks: Record<string, number>;
}

export interface SaveRegionMappingResult {
  changes: Array<{ regionId: string; name: string; added: string[]; removed: string[] }>;
}

export function parseMoves(raw: unknown): MappingMove[] {
  const list = raw && typeof raw === 'object' ? (raw as Doc).moves : null;
  if (!Array.isArray(list) || list.length === 0) {
    throw new HttpsError('invalid-argument', 'moves must be a non-empty list.');
  }
  if (list.length > MAX_MOVES) {
    throw new HttpsError('invalid-argument', 'Too many moves in one request.');
  }
  return list.map((m) => {
    const move = (m && typeof m === 'object' ? m : {}) as Doc;
    if (typeof move.districtKey !== 'string' || typeof move.toRegionId !== 'string') {
      throw new HttpsError('invalid-argument', 'Each move needs districtKey and toRegionId.');
    }
    return { districtKey: move.districtKey, toRegionId: move.toRegionId };
  });
}

/** Events per district key; an event counts for the district only while its region holds it. */
export function countEventsPerDistrict(
  events: readonly Doc[],
  regions: readonly MappingRegion[]
): Record<string, number> {
  const holder = currentAssignment(regions);
  const countryOf = new Map(regions.map((r) => [r.id, r.country]));
  const counts: Record<string, number> = {};
  for (const ev of events) {
    const bezirk = typeof ev.bezirk === 'string' ? ev.bezirk : null;
    if (!bezirk) continue;
    const regionId = resolveRegionId(ev);
    const country = countryOf.get(regionId);
    if (!country) continue;
    const key = `${country}|${bezirk}`;
    if (holder.get(key) !== regionId) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function loadRegions(deps: RegionMappingDeps): Promise<MappingRegion[]> {
  return buildMappingRegisters(await deps.listRegionDocs());
}

export async function getRegionMappingLocksHandler(
  request: CallableRequest,
  deps: RegionMappingDeps
): Promise<RegionMappingLocks> {
  await assertSuperAdmin(request.auth?.uid, deps.readRoleDoc);
  const [regions, events] = await Promise.all([loadRegions(deps), deps.listEventDistricts()]);
  return { locks: countEventsPerDistrict(events, regions) };
}

export async function saveRegionMappingHandler(
  request: CallableRequest,
  deps: RegionMappingDeps
): Promise<SaveRegionMappingResult> {
  const actorUid = request.auth?.uid;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  const moves = parseMoves(request.data);

  const [regions, events] = await Promise.all([loadRegions(deps), deps.listEventDistricts()]);
  const { changes, errors } = planMappingChange(regions, moves);
  if (errors.length) {
    throw new HttpsError('failed-precondition', 'This assignment is not possible.', {
      reason: 'mapping-invalid',
      errors,
    });
  }
  if (changes.length === 0) return { changes: [] };

  // A district that leaves a region must have no events there.
  const counts = countEventsPerDistrict(events, regions);
  const blocked = changes
    .flatMap((c) => {
      const country = regions.find((r) => r.id === c.regionId)?.country;
      return c.removed.map((name) => ({ key: `${country}|${name}`, name }));
    })
    .filter((d) => CATALOG_BY_KEY.has(d.key) && (counts[d.key] ?? 0) > 0)
    .map((d) => ({ districtKey: d.key, district: d.name, events: counts[d.key] }));
  if (blocked.length) {
    throw new HttpsError('failed-precondition', 'Districts with events cannot be moved.', {
      reason: 'events-in-district',
      blocked,
    });
  }

  await deps.commit({ actorUid: actorUid as string, changes, regions });
  return {
    changes: changes.map((c) => ({
      regionId: c.regionId,
      name: c.name,
      added: c.added,
      removed: c.removed,
    })),
  };
}

// ── Firebase wiring ──────────────────────────────────────────────────────

const deps: RegionMappingDeps = {
  readRoleDoc,
  async listRegionDocs() {
    const snap = await getFirestore().collection('regions').get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  },
  async listEventDistricts() {
    const snap = await getFirestore().collection('events').select('bezirk', 'regionId').get();
    return snap.docs.map((d) => d.data());
  },
  async commit({ actorUid, changes, regions }) {
    const db = getFirestore();
    const batch = db.batch();
    const byId = new Map(regions.map((r) => [r.id, r]));
    const datum = new Map(REGION_DATA.map((r) => [r.slug, r]));
    for (const change of changes) {
      const ref = db.collection('regions').doc(change.regionId);
      const region = byId.get(change.regionId) as MappingRegion;
      const snap = await ref.get();
      // Only keys firestore.rules' isValidRegion allows, so the doc stays editable
      // from the client afterwards. A missing doc is created like seed-regions does.
      batch.set(
        ref,
        {
          bezirke: change.after,
          mappingUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...(snap.exists
            ? {}
            : {
                name: region.name,
                slug: change.regionId,
                order: region.order,
                active: false,
                contactEmail: '',
                seo: { title: '', description: '' },
                timezone: datum.get(change.regionId)?.timezone,
                createdAt: FieldValue.serverTimestamp(),
              }),
        },
        { merge: true }
      );
    }
    batch.create(db.collection(AUDIT_LOG_COLLECTION).doc(), {
      action: 'saveRegionMapping',
      actorUid,
      changes: changes.map((c) => ({
        regionId: c.regionId,
        added: c.added,
        removed: c.removed,
      })),
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  },
};

export const adminGetRegionMappingLocks = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<RegionMappingLocks> => {
    logMissingAppCheck('adminGetRegionMappingLocks', request);
    return getRegionMappingLocksHandler(request, deps);
  }
);

export const adminSaveRegionMapping = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<SaveRegionMappingResult> => {
    logMissingAppCheck('adminSaveRegionMapping', request);
    const result = await saveRegionMappingHandler(request, deps);
    if (result.changes.length) {
      logger.info('adminSaveRegionMapping', {
        actorUid: request.auth?.uid,
        regions: result.changes.map((c) => c.regionId),
      });
    }
    return result;
  }
);
