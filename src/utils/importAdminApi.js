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
  where,
} from 'firebase/firestore';
import { callable, db } from '../lib/firebase';
import {
  IMPORT_BLOCKLIST,
  IMPORT_CANDIDATES,
  IMPORT_ORGANIZERS,
  PUBLISHABLE_CONSENT_STATES,
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

/** Ticket 5/6: outreach mail; on staging only with `testRecipient`. */
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
    const consented = new Set(
      organizers.docs
        .filter((d) => PUBLISHABLE_CONSENT_STATES.includes(d.data().consent))
        .map((d) => d.id)
    );
    const events = candidates.docs.map((d) => d.data()).filter((c) => c.eventId);
    return {
      importedEvents: events.length,
      consentedEvents: events.filter((c) => consented.has(c.organizerRef)).length,
    };
  } catch (err) {
    console.warn('Import progress failed:', err);
    return null;
  }
}
