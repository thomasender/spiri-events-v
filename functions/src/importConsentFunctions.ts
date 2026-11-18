/**
 * Firebase wiring of the event import's preview, consent, outreach and purge
 * (logic and security model: importConsent.ts; docs/event-import.md).
 */
import { randomUUID } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { ALLOWED_ORIGINS } from './allowedOrigins';
import { AUDIT_LOG_COLLECTION } from './adminModerators';
import { readRoleDoc } from './staffRoles';
import { enforceRateLimit } from './rateLimit';
import { regionNameOf } from './regions';
import { projectSiteOrigin } from './siteOrigin';
import { findFreeSlug } from './eventSlug';
import { deleteEventAssets } from './eventStorageCleanup';
import {
  IMPORT_BLOCKLIST,
  IMPORT_CANDIDATES,
  IMPORT_ORGANIZERS,
  IMPORT_OUTREACH,
  IMPORT_SETTINGS_DOC,
  type ConsentState,
  type LegalForm,
  type SyncMode,
} from './eventImport';
import {
  DELETE_FIELD,
  IMPORT_PREVIEW_VIEWS,
  OUTREACH_DOC_ID,
  PREVIEW_ACTOR,
  createPreviewLinkHandler,
  generatePreviewToken,
  getImportPreviewHandler,
  isImportDataExpired,
  planOrganizerPurge,
  sendOutreachMailHandler,
  submitImportConsentHandler,
  type ImportDeps,
  type OrganizerRecord,
  type OutreachLog,
  type Patch,
} from './importConsent';
import {
  FETCH_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  copyConsentedImages,
  storageDownloadUrl,
} from './importImages';
import { OUTREACH_REPLY_TO } from './importOutreachMail';
import {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  MAILGUN_EU_BASE,
  MAILGUN_FROM,
  MAILGUN_REPLY_TO,
  isMailgunDryRun,
  sendMailgunMessage,
} from './mailgun';

if (getApps().length === 0) {
  initializeApp();
}

const REGION = 'europe-west3';

const millis = (value: unknown): number | null => {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return null;
};

function toOrganizer(id: string, d: DocumentData): OrganizerRecord {
  return {
    id,
    name: typeof d.name === 'string' ? d.name : '',
    website: typeof d.website === 'string' ? d.website : '',
    contactEmail: typeof d.contactEmail === 'string' && d.contactEmail ? d.contactEmail : null,
    legalForm: (d.legalForm ?? 'unknown') as LegalForm,
    regionId: typeof d.regionId === 'string' ? d.regionId : '',
    consent: (d.consent ?? 'none') as ConsentState,
    syncMode: (d.syncMode ?? 'curated_once') as SyncMode,
    previewTokenHash: typeof d.previewTokenHash === 'string' ? d.previewTokenHash : null,
    previewTokenExpiresAtMs: millis(d.previewTokenExpiresAt),
    deleteAfterMs: millis(d.deleteAfter),
    consentRecord: d.consentRecord && typeof d.consentRecord === 'object' ? d.consentRecord : null,
  };
}

/** Plan patches -> Firestore values (DELETE_FIELD -> FieldValue.delete()). */
function firestorePatch(patch: Patch): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [k, v === DELETE_FIELD ? FieldValue.delete() : v])
  );
}

async function sendOutreachViaMailgun(mail: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ id: string }> {
  if (isMailgunDryRun(process.env)) {
    logger.info('MAILGUN dry-run: would send import outreach mail', {
      to: mail.to,
      subject: mail.subject,
    });
    return { id: 'dry-run' };
  }
  const apiKey = MAILGUN_API_KEY.value();
  const domain = MAILGUN_DOMAIN.value();
  const from = MAILGUN_FROM.value();
  if (!apiKey || !domain || !from) throw new Error('Mailgun credentials are not configured.');
  const result = await sendMailgunMessage(MAILGUN_EU_BASE, {
    apiKey,
    domain,
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    replyTo: MAILGUN_REPLY_TO.value() || OUTREACH_REPLY_TO,
    // The links carry the private preview token: no click tracking redirects.
    tracking: false,
  });
  return { id: result.id };
}

/** GET an image without following redirects, with timeout and size cap. */
async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'image/*' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`not an image (${type})`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_IMAGE_BYTES) throw new Error('image too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty response');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error('image too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function convertImage(data: Buffer): Promise<{ full: Buffer; thumb: Buffer }> {
  const base = sharp(data, { limitInputPixels: 50_000_000 }).rotate();
  const full = await base
    .clone()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const thumb = await base
    .clone()
    .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  return { full, thumb };
}

async function deleteEvent(db: Firestore, eventId: string): Promise<void> {
  await deleteEventAssets(getStorage().bucket(), eventId);
  await db.recursiveDelete(db.collection('events').doc(eventId));
}

function firestoreDeps(): ImportDeps {
  const db = getFirestore();
  const organizers = db.collection(IMPORT_ORGANIZERS);
  const outreachRef = (id: string) =>
    organizers.doc(id).collection(IMPORT_OUTREACH).doc(OUTREACH_DOC_ID);
  return {
    now: () => Date.now(),
    generateToken: generatePreviewToken,
    siteOrigin: projectSiteOrigin(),
    projectId: process.env.GCLOUD_PROJECT,
    readRoleDoc,
    enforceRateLimit,
    async getOrganizer(id) {
      const snap = await organizers.doc(id).get();
      return snap.exists ? toOrganizer(snap.id, snap.data() ?? {}) : null;
    },
    async findOrganizerByTokenHash(hash) {
      const snap = await organizers.where('previewTokenHash', '==', hash).limit(1).get();
      const doc = snap.docs[0];
      return doc ? toOrganizer(doc.id, doc.data()) : null;
    },
    async updateOrganizer(id, patch) {
      await organizers.doc(id).update(firestorePatch(patch));
    },
    async listCuratedEvents(organizerId) {
      const snap = await db
        .collection('events')
        .where('curation.organizerRef', '==', organizerId)
        .get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    async listCandidates(organizerId) {
      const snap = await db
        .collection(IMPORT_CANDIDATES)
        .where('organizerRef', '==', organizerId)
        .get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    async logPreviewView(organizerId, view) {
      await organizers.doc(organizerId).collection(IMPORT_PREVIEW_VIEWS).add(view);
    },
    async addAuditEntry(entry) {
      await db
        .collection(AUDIT_LOG_COLLECTION)
        .add({ ...entry, createdAt: FieldValue.serverTimestamp() });
    },
    async getCuratorUid() {
      const snap = await db.doc(IMPORT_SETTINGS_DOC).get();
      const uid = snap.get('curatorUid');
      return typeof uid === 'string' && uid ? uid : null;
    },
    async resolveApprovalSlug(eventId, slug) {
      return findFreeSlug(slug, async (candidate) => {
        const snap = await db
          .collection('events')
          .where('slug', '==', candidate)
          .where('status', '==', 'approved')
          .get();
        return snap.docs.some((d) => d.id !== eventId);
      });
    },
    async applyConsentPlan(plan) {
      const batch = db.batch();
      batch.update(organizers.doc(plan.organizerId), firestorePatch(plan.organizerPatch));
      for (const { id, patch } of plan.eventUpdates) {
        batch.update(db.collection('events').doc(id), firestorePatch(patch));
      }
      for (const { id, patch } of plan.candidateUpdates) {
        batch.update(db.collection(IMPORT_CANDIDATES).doc(id), firestorePatch(patch));
      }
      for (const entry of plan.blocklist) {
        batch.set(db.collection(IMPORT_BLOCKLIST).doc(entry.id), {
          kind: entry.kind,
          reason: 'declined',
          createdAt: FieldValue.serverTimestamp(),
          createdBy: PREVIEW_ACTOR,
        });
      }
      await batch.commit();
      // Deleting events (with storage and subcollections) cannot join the batch.
      for (const id of plan.eventDeletes) await deleteEvent(db, id);
    },
    copyConsentedImages: (items) => {
      const bucket = getStorage().bucket();
      return copyConsentedImages(items, {
        now: () => Date.now(),
        fetchImage,
        convert: convertImage,
        async upload(path, data, contentType) {
          const token = randomUUID();
          await bucket.file(path).save(data, {
            contentType,
            resumable: false,
            metadata: {
              cacheControl: 'public, max-age=31536000, immutable',
              metadata: { firebaseStorageDownloadTokens: token },
            },
          });
          return storageDownloadUrl(bucket.name, path, token);
        },
        async updateEvent(eventId, patch) {
          await db.collection('events').doc(eventId).update(patch);
        },
        log: (message, data) => logger.warn(message, data),
      });
    },
    async existingBlocklistIds(ids) {
      const refs = ids.map((id) => db.collection(IMPORT_BLOCKLIST).doc(id));
      const snaps = await db.getAll(...refs);
      return snaps.filter((s) => s.exists).map((s) => s.id);
    },
    async getOutreach(organizerId) {
      const snap = await outreachRef(organizerId).get();
      return snap.exists ? (snap.data() as OutreachLog) : null;
    },
    async claimOutreach(organizerId, log) {
      return db.runTransaction(async (t) => {
        const ref = outreachRef(organizerId);
        const snap = await t.get(ref);
        if (snap.exists && snap.get('status') !== 'failed') return false;
        t.set(ref, log);
        return true;
      });
    },
    async updateOutreach(organizerId, patch) {
      await outreachRef(organizerId).update(patch);
    },
    sendMail: sendOutreachViaMailgun,
    regionNameOf,
  };
}

const MAIL_SECRETS = [MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM, MAILGUN_REPLY_TO];

export const createPreviewLink = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('createPreviewLink', request);
    return createPreviewLinkHandler(request, firestoreDeps());
  }
);

export const getImportPreview = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('getImportPreview', request);
    return getImportPreviewHandler(request, firestoreDeps());
  }
);

export const submitImportConsent = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, memory: '512MiB', ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('submitImportConsent', request);
    const result = await submitImportConsentHandler(request, firestoreDeps());
    logger.info('submitImportConsent', {
      consent: result.consent,
      changed: result.changed,
      approvedEvents: result.approvedEvents,
      imagesCopied: result.imagesCopied,
    });
    return result;
  }
);

export const sendOutreachMail = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, secrets: MAIL_SECRETS, ...appCheckOptions() },
  async (request) => {
    logMissingAppCheck('sendOutreachMail', request);
    const result = await sendOutreachMailHandler(request, firestoreDeps());
    logger.info('sendOutreachMail', {
      actorUid: request.auth?.uid,
      test: result.test,
      messageId: result.messageId,
    });
    return result;
  }
);

/**
 * Daily: organizers who did not answer (consent none / asked) and whose
 * `deleteAfter` passed lose their candidates, never-public curated events,
 * contact address, preview token and preview log. The organizer doc stays as
 * a tombstone (name, website, consent, outreach log) so nobody is mailed twice.
 */
export const purgeExpiredImportData = onSchedule(
  { region: REGION, schedule: 'every day 04:10', timeZone: 'Europe/Vienna' },
  async () => {
    const db = getFirestore();
    const deps = firestoreDeps();
    const nowMs = Date.now();
    const snap = await db
      .collection(IMPORT_ORGANIZERS)
      .where('deleteAfter', '<=', Timestamp.fromMillis(nowMs))
      .get();
    let purged = 0;
    for (const doc of snap.docs) {
      const organizer = toOrganizer(doc.id, doc.data());
      if (!isImportDataExpired(organizer, nowMs)) continue;
      try {
        const [events, candidates] = await Promise.all([
          deps.listCuratedEvents(organizer.id),
          deps.listCandidates(organizer.id),
        ]);
        const plan = planOrganizerPurge(organizer, events, candidates, new Date(nowMs));
        for (const id of plan.eventDeletes) await deleteEvent(db, id);
        const batch = db.batch();
        for (const id of plan.candidateDeletes)
          batch.delete(db.collection(IMPORT_CANDIDATES).doc(id));
        batch.update(doc.ref, firestorePatch(plan.organizerPatch));
        await batch.commit();
        if (plan.deletePreviewViews) {
          await db.recursiveDelete(doc.ref.collection(IMPORT_PREVIEW_VIEWS));
        }
        await deps.addAuditEntry({
          action: 'importPurge',
          actorUid: 'system',
          organizerId: organizer.id,
          deletedEvents: plan.eventDeletes.length,
          deletedCandidates: plan.candidateDeletes.length,
        });
        purged += 1;
      } catch (err) {
        logger.error('Failed to purge import organizer', {
          id: doc.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logger.info('Purged expired import data', { purged, scanned: snap.size });
  }
);
