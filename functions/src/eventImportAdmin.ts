/**
 * Super-Admin callables of the event import (docs/event-import.md). The
 * discovery script (scripts/import-curated-events.mjs) only writes
 * `import_candidates`; an event is created here, when a Super-Admin accepts
 * a candidate.
 *
 *   importAcceptCandidate({ candidateId, force? })  candidate -> pending event
 *   importRejectCandidate({ candidateId, reason })  candidate -> rejected
 *
 * Security model (as adminRegions.ts):
 * - Super-Admins only (admin_users/{uid}.role == 'Admin'), checked on every call.
 * - Accepting refuses blocklisted organizers, organizers who declined, candidates
 *   that are not open any more, and `pilotExcluded` candidates (individuals)
 *   unless `force: true`.
 * - The event is written `pending`, owned by the curator account
 *   (`app_settings/import.curatorUid`), with `curation` and WITHOUT
 *   `curation.consentAt`: it stays hidden until the organizer consented. No
 *   image fields, no organizer e-mail; `onEventCreated` skips curated events,
 *   so no "new event submitted" mail goes out (notificationRouting.ts).
 * - Event, candidate update and `admin_audit_log` entry are one transaction.
 *   Accepting an already accepted candidate returns the existing event.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { assertSuperAdmin, readRoleDoc, type RoleDocReader } from './staffRoles';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { AUDIT_LOG_COLLECTION } from './adminModerators';
import { eventSlugPlace, findFreeSlug, generateEventSlug } from './eventSlug';
import {
  IMPORT_BLOCKLIST,
  IMPORT_CANDIDATES,
  IMPORT_ORGANIZERS,
  IMPORT_SETTINGS_DOC,
  candidateToEventData,
  isBlocked,
  type ImportCandidate,
  type ImportOrganizer,
} from './eventImport';

if (getApps().length === 0) {
  initializeApp();
}

type Doc = Record<string, unknown>;

/** Candidate states a Super-Admin can still decide on. */
const OPEN_STATUSES = ['found', 'reviewed', 'duplicate'] as const;
const MAX_REASON = 500;

export interface ImportAuditEntry {
  action: 'importAcceptCandidate' | 'importRejectCandidate';
  actorUid: string;
  candidateId: string;
  organizerRef: string;
  regionId: string;
  eventId?: string;
  force?: boolean;
  reason?: string;
}

export interface AcceptWrite {
  candidateId: string;
  eventData: Doc;
  audit: ImportAuditEntry;
  actorUid: string;
}

export interface RejectWrite {
  candidateId: string;
  reason: string;
  audit: ImportAuditEntry;
  actorUid: string;
}

export interface ImportAdminDeps {
  readRoleDoc: RoleDocReader;
  getCandidate: (id: string) => Promise<Doc | null>;
  getOrganizer: (id: string) => Promise<Doc | null>;
  /** `app_settings/import.curatorUid`, or null. */
  readCuratorUid: () => Promise<string | null>;
  /** Doc ids of import_blocklist. */
  listBlockedIds: () => Promise<Set<string>>;
  isSlugTaken: (slug: string) => Promise<boolean>;
  /**
   * Creates the event and marks the candidate `published` (+ eventId) and
   * writes the audit entry, atomically. Re-reads the candidate inside the
   * transaction: when it was accepted meanwhile, nothing is written and the
   * existing event id is returned with `created: false`.
   */
  commitAccept: (write: AcceptWrite) => Promise<{ eventId: string; created: boolean }>;
  /** Marks the candidate `rejected` + audit entry, atomically. */
  commitReject: (write: RejectWrite) => Promise<void>;
  now: () => Date;
}

export interface AcceptResult {
  candidateId: string;
  eventId: string;
  /** False when the candidate had been accepted before (nothing written). */
  created: boolean;
  slug: string;
}

export interface RejectResult {
  candidateId: string;
  changed: boolean;
}

interface CallableRequest {
  auth?: { uid?: string } | null;
  data?: unknown;
}

function parseCandidateId(data: Doc): string {
  const id = data.candidateId;
  if (typeof id !== 'string' || !id.trim() || id.length > 200 || id.includes('/')) {
    throw new HttpsError('invalid-argument', 'candidateId is missing.');
  }
  return id.trim();
}

export function parseAcceptInput(raw: unknown): { candidateId: string; force: boolean } {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Doc;
  if (data.force !== undefined && typeof data.force !== 'boolean') {
    throw new HttpsError('invalid-argument', 'force must be true or false.');
  }
  return { candidateId: parseCandidateId(data), force: data.force === true };
}

export function parseRejectInput(raw: unknown): { candidateId: string; reason: string } {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Doc;
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (!reason || reason.length > MAX_REASON) {
    throw new HttpsError('invalid-argument', `reason is required (max ${MAX_REASON} characters).`);
  }
  return { candidateId: parseCandidateId(data), reason };
}

function refuse(reason: string, message: string): never {
  throw new HttpsError('failed-precondition', message, { reason });
}

export async function importAcceptCandidateHandler(
  request: CallableRequest,
  deps: ImportAdminDeps
): Promise<AcceptResult> {
  const actorUid = request.auth?.uid as string | undefined;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  const { candidateId, force } = parseAcceptInput(request.data);

  const candidate = await deps.getCandidate(candidateId);
  if (!candidate) throw new HttpsError('not-found', 'Candidate does not exist.');
  // Accepting twice is harmless: hand back the event that exists.
  if (candidate.status === 'published' && typeof candidate.eventId === 'string') {
    return { candidateId, eventId: candidate.eventId, created: false, slug: '' };
  }
  if (!(OPEN_STATUSES as readonly unknown[]).includes(candidate.status)) {
    refuse('status', `Candidate is ${String(candidate.status)}, not open.`);
  }

  const organizerRef = typeof candidate.organizerRef === 'string' ? candidate.organizerRef : '';
  const organizer = organizerRef ? await deps.getOrganizer(organizerRef) : null;
  if (!organizer) refuse('organizer-missing', 'The organizer of this candidate does not exist.');
  const org = organizer as Doc;
  if (org.consent === 'declined' || org.syncMode === 'declined') {
    refuse('organizer-declined', 'The organizer declined; nothing is imported from them.');
  }
  const blockedIds = await deps.listBlockedIds();
  if (
    isBlocked(
      {
        email: typeof org.contactEmail === 'string' ? org.contactEmail : null,
        website: typeof org.website === 'string' ? org.website : null,
      },
      blockedIds
    )
  ) {
    refuse('blocked', 'The organizer is on the blocklist.');
  }
  // No distinction by legal form any more (Thomas, 2026-11-24): individuals are accepted like everyone else.

  const curatorUid = await deps.readCuratorUid();
  if (!curatorUid) {
    refuse('no-curator', 'No curator account: run scripts/ensure-curator-account.mjs.');
  }

  let eventData: Doc;
  try {
    eventData = candidateToEventData(
      candidate as unknown as ImportCandidate,
      org as unknown as ImportOrganizer,
      curatorUid as string,
      { now: deps.now() }
    );
  } catch (err) {
    throw new HttpsError('invalid-argument', (err as Error).message);
  }

  const slug = await findFreeSlug(
    generateEventSlug(
      String(eventData.title),
      String(eventData.category),
      eventSlugPlace(eventData),
      String(eventData.date)
    ),
    deps.isSlugTaken
  );
  eventData.slug = slug;

  const { eventId, created } = await deps.commitAccept({
    candidateId,
    eventData,
    actorUid: actorUid as string,
    audit: {
      action: 'importAcceptCandidate',
      actorUid: actorUid as string,
      candidateId,
      organizerRef,
      regionId: String(eventData.regionId),
      force,
    },
  });
  return { candidateId, eventId, created, slug };
}

export async function importRejectCandidateHandler(
  request: CallableRequest,
  deps: ImportAdminDeps
): Promise<RejectResult> {
  const actorUid = request.auth?.uid as string | undefined;
  await assertSuperAdmin(actorUid, deps.readRoleDoc);
  const { candidateId, reason } = parseRejectInput(request.data);

  const candidate = await deps.getCandidate(candidateId);
  if (!candidate) throw new HttpsError('not-found', 'Candidate does not exist.');
  if (candidate.status === 'rejected') return { candidateId, changed: false };
  if (!(OPEN_STATUSES as readonly unknown[]).includes(candidate.status)) {
    refuse('status', `Candidate is ${String(candidate.status)}, not open.`);
  }
  await deps.commitReject({
    candidateId,
    reason,
    actorUid: actorUid as string,
    audit: {
      action: 'importRejectCandidate',
      actorUid: actorUid as string,
      candidateId,
      organizerRef: typeof candidate.organizerRef === 'string' ? candidate.organizerRef : '',
      regionId: typeof candidate.regionId === 'string' ? candidate.regionId : '',
      reason,
    },
  });
  return { candidateId, changed: true };
}

// ── Firebase wiring ──────────────────────────────────────────────────────

const importAdminDeps: ImportAdminDeps = {
  readRoleDoc,
  async getCandidate(id) {
    const snap = await getFirestore().collection(IMPORT_CANDIDATES).doc(id).get();
    return snap.exists ? (snap.data() ?? {}) : null;
  },
  async getOrganizer(id) {
    const snap = await getFirestore().collection(IMPORT_ORGANIZERS).doc(id).get();
    return snap.exists ? (snap.data() ?? {}) : null;
  },
  async readCuratorUid() {
    const snap = await getFirestore().doc(IMPORT_SETTINGS_DOC).get();
    const uid = snap.data()?.curatorUid;
    return typeof uid === 'string' && uid ? uid : null;
  },
  async listBlockedIds() {
    const snap = await getFirestore().collection(IMPORT_BLOCKLIST).select().get();
    return new Set(snap.docs.map((d) => d.id));
  },
  async isSlugTaken(slug) {
    const snap = await getFirestore().collection('events').where('slug', '==', slug).limit(1).get();
    return !snap.empty;
  },
  async commitAccept({ candidateId, eventData, audit, actorUid }) {
    const db = getFirestore();
    const candidateRef = db.collection(IMPORT_CANDIDATES).doc(candidateId);
    const eventRef = db.collection('events').doc();
    return db.runTransaction(async (t) => {
      const current = (await t.get(candidateRef)).data() ?? {};
      if (current.status === 'published' && typeof current.eventId === 'string') {
        return { eventId: current.eventId, created: false };
      }
      if (!(OPEN_STATUSES as readonly unknown[]).includes(current.status)) {
        refuse('status', `Candidate is ${String(current.status)}, not open.`);
      }
      t.create(eventRef, eventData);
      t.update(candidateRef, {
        status: 'published',
        eventId: eventRef.id,
        reviewedBy: actorUid,
        reviewedAt: FieldValue.serverTimestamp(),
      });
      t.create(db.collection(AUDIT_LOG_COLLECTION).doc(), {
        ...audit,
        eventId: eventRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { eventId: eventRef.id, created: true };
    });
  },
  async commitReject({ candidateId, reason, audit, actorUid }) {
    const db = getFirestore();
    const candidateRef = db.collection(IMPORT_CANDIDATES).doc(candidateId);
    await db.runTransaction(async (t) => {
      const current = (await t.get(candidateRef)).data() ?? {};
      if (!(OPEN_STATUSES as readonly unknown[]).includes(current.status)) {
        refuse('status', `Candidate is ${String(current.status)}, not open.`);
      }
      t.update(candidateRef, {
        status: 'rejected',
        rejectReason: reason,
        reviewedBy: actorUid,
        reviewedAt: FieldValue.serverTimestamp(),
      });
      t.create(db.collection(AUDIT_LOG_COLLECTION).doc(), {
        ...audit,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  },
  now: () => new Date(),
};

export const importAcceptCandidate = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<AcceptResult> => {
    logMissingAppCheck('importAcceptCandidate', request);
    const result = await importAcceptCandidateHandler(request, importAdminDeps);
    if (result.created) {
      logger.info('importAcceptCandidate', {
        actorUid: request.auth?.uid,
        candidateId: result.candidateId,
        eventId: result.eventId,
      });
    }
    return result;
  }
);

export const importRejectCandidate = onCall(
  { region: 'europe-west3', cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request): Promise<RejectResult> => {
    logMissingAppCheck('importRejectCandidate', request);
    const result = await importRejectCandidateHandler(request, importAdminDeps);
    if (result.changed) {
      logger.info('importRejectCandidate', {
        actorUid: request.auth?.uid,
        candidateId: result.candidateId,
      });
    }
    return result;
  }
);
