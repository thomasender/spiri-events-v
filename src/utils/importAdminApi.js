// Super-Admin API of the event import tab (docs/event-import.md, "Admin tab").
// One thin module around the callables of the import backend and the
// blocklist / progress reads, so tests can mock it as a whole.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import app, { callable, db } from '../lib/firebase';
import {
  IMPORT_BLOCKLIST,
  IMPORT_CANDIDATES,
  IMPORT_ORGANIZERS,
  IMPORT_VISIBILITY_DOC,
  blocklistIdAsync,
  blocklistKind,
  normalizeBlocklistValue,
} from './eventImport';

async function call(name, data) {
  const result = await callable(name)(data);
  return result.data;
}

/** Ticket 3: write the event for a candidate. `force` overrides pilotExcluded. */
export const importAcceptCandidate = ({ candidateId, force = false }) =>
  call('importAcceptCandidate', force ? { candidateId, force: true } : { candidateId });

export const importRejectCandidate = ({ candidateId, reason }) =>
  call('importRejectCandidate', { candidateId, reason });

/** Ticket 5/6: private preview link `{ url, expiresAt }`. */
export const createPreviewLink = ({ organizerId, regenerate = false }) =>
  call('createPreviewLink', regenerate ? { organizerId, regenerate: true } : { organizerId });

/** True only in the production Firebase project (the one place real organizers are mailed). */
export const isProductionProject = () => app?.options?.projectId === 'spirieventsvbg';

/**
 * Kill switch and daily limit of the real outreach mail (app_settings/importOutreach, rules:
 * Super-Admin only, limit 1..50). The backend enforces both; this only writes them.
 */
export const saveOutreachSettings = ({ productionEnabled, dailyLimit }) =>
  setDoc(doc(db, 'app_settings', 'importOutreach'), {
    productionEnabled: productionEnabled === true,
    dailyLimit: Math.min(50, Math.max(1, Math.floor(Number(dailyLimit)) || 1)),
    updatedAt: serverTimestamp(),
  });

/** Super-Admin: mark an organizer as declined (e.g. a "Nein" reply by mail), like the decline link. */
export const importDeclineOrganizer = ({ organizerId }) =>
  call('importDeclineOrganizer', { organizerId });

/** Ticket 5/6: outreach mail; without `testRecipient` only on production with the switch on. */
export const sendOutreachMail = ({ organizerId, testRecipient }) =>
  call('sendOutreachMail', testRecipient ? { organizerId, testRecipient } : { organizerId });

// ── Blocklist (client access allowed for Super-Admins by firestore.rules) ──

/** Whether the e-mail address / domain is on the blocklist. */
export async function isOnBlocklist(emailOrDomain) {
  if (!normalizeBlocklistValue(emailOrDomain)) return false;
  const id = await blocklistIdAsync(emailOrDomain);
  return (await getDoc(doc(db, IMPORT_BLOCKLIST, id))).exists();
}

/** Only the hash is stored (doc id), never the plain address. */
export async function addToBlocklist(emailOrDomain, uid, reason = 'manuell gesperrt') {
  const id = await blocklistIdAsync(emailOrDomain);
  await setDoc(doc(db, IMPORT_BLOCKLIST, id), {
    kind: blocklistKind(emailOrDomain),
    reason,
    createdAt: serverTimestamp(),
    createdBy: uid,
  });
  return id;
}

export async function removeFromBlocklist(emailOrDomain) {
  const id = await blocklistIdAsync(emailOrDomain);
  await deleteDoc(doc(db, IMPORT_BLOCKLIST, id));
  return id;
}

// ── Region progress (Regionen tab) ────────────────────────────────────

/**
 * Curated events of a region and how many of them have consent, computed on
 * the client from bounded reads: published candidates (they hold the event id)
 * and the organizers' consent state. `null` when the reads fail.
 */
export async function fetchImportProgress(regionId) {
  try {
    const [candidates, organizers] = await Promise.all([
      getDocs(
        query(
          collection(db, IMPORT_CANDIDATES),
          where('regionId', '==', regionId),
          where('status', '==', 'published'),
          limit(200)
        )
      ),
      getDocs(
        query(collection(db, IMPORT_ORGANIZERS), where('regionId', '==', regionId), limit(500))
      ),
    ]);
    // Only an organizer who really consented counts. `claimed` is NOT consent
    // (docs/event-import.md): a claim overwrites `consent` and keeps the event's
    // `curation.consentAt`, so a claimed organizer counts only through events
    // that carry `curation.consentAt`.
    const events = candidates.docs.map((d) => d.data()).filter((c) => c.eventId);
    const consentedOrganizers = new Set(
      organizers.docs
        .filter((d) => ['manual_ok', 'sync_ok'].includes(d.data().consent))
        .map((d) => d.id)
    );
    const eventDocs = await Promise.all(
      events
        .filter((c) => !consentedOrganizers.has(c.organizerRef))
        .map((c) => getDoc(doc(db, 'events', c.eventId)))
    );
    const consentedByEvent = eventDocs.filter((e) => e.exists() && e.data()?.curation?.consentAt);
    return {
      importedEvents: events.length,
      consentedEvents:
        events.filter((c) => consentedOrganizers.has(c.organizerRef)).length +
        consentedByEvent.length,
    };
  } catch (err) {
    console.warn('Import progress failed:', err);
    return null;
  }
}

/**
 * "Zurückstellen" / "Wieder öffnen": a Super-Admin moves a candidate between
 * `found` and `reviewed` directly (the rules allow the write for Super-Admins).
 */
export async function setCandidateStatus(candidateId, status) {
  if (status !== 'found' && status !== 'reviewed') throw new Error(`Ungültiger Status: ${status}`);
  await updateDoc(doc(db, IMPORT_CANDIDATES, candidateId), { status });
}

/** Switch "Import-Events für Moderator:innen im Prüfen-Tab sichtbar". */
export async function setModeratorsSeeInReview(value) {
  await setDoc(doc(db, IMPORT_VISIBILITY_DOC), {
    moderatorsSeeInReview: Boolean(value),
    updatedAt: serverTimestamp(),
  });
}
