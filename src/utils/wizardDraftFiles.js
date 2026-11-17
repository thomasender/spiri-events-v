import { GUEST_DRAFT_ID, GUEST_DRAFT_MAX_AGE_MS } from './wizardDraftStorage';

// The photos of the "Event erstellen" wizard (Titelbild, extra Instagram photo)
// do not fit into localStorage, so they live in IndexedDB under the same id as
// the text draft (uid or `guest`, wizardDraftStorage.js). Everything here is
// best-effort: without IndexedDB (old browser, some private modes) the
// functions resolve to null / false and the wizard asks for the photo again.
// Files are stored as ArrayBuffer (older Safari cannot store Blobs).
//
// A copy also stays in memory for the running page: going to /login and back
// (no reload) gets the photos back at once, without waiting for IndexedDB.

const DB_NAME = 'eventWizardDraft';
const DB_VERSION = 1;
const STORE = 'files';
const SLOTS = ['cover', 'instagram'];
const memory = new Map();

function getFactory() {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
}

function openDb() {
  const factory = getFactory();
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

// Runs `fn(store)` in one transaction; resolves to the value of the request it
// returns (or undefined), or to `fallback` on any error.
async function withStore(mode, fn, fallback) {
  const db = await openDb();
  if (!db) return fallback;
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      let result;
      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => resolve(fallback);
      tx.onabort = () => resolve(fallback);
    });
  } catch {
    return fallback;
  } finally {
    db.close();
  }
}

async function serializeFile(file) {
  if (!file) return null;
  const buffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Response(file).arrayBuffer();
  return {
    buffer,
    name: file.name || 'bild',
    type: file.type || '',
    lastModified: file.lastModified || Date.now(),
  };
}

function deserializeFile(stored) {
  if (!stored || !stored.buffer) return null;
  try {
    return new File([stored.buffer], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified,
    });
  } catch {
    return null;
  }
}

function isExpired(record, now) {
  return typeof record?.savedAt !== 'number' || now - record.savedAt > GUEST_DRAFT_MAX_AGE_MS;
}

/**
 * Stores the wizard photos `{ cover, instagram }` (File or null) for `ownerId`.
 * Both null removes the entry. Resolves to true when written.
 */
export async function saveWizardDraftFiles(ownerId, files = {}) {
  if (!ownerId) return false;
  if (SLOTS.every((slot) => !files[slot])) memory.delete(ownerId);
  else memory.set(ownerId, { cover: files.cover || null, instagram: files.instagram || null });
  try {
    const record = { savedAt: Date.now() };
    for (const slot of SLOTS) record[slot] = await serializeFile(files[slot]);
    if (SLOTS.every((slot) => !record[slot])) {
      await clearWizardDraftFiles(ownerId);
      return true;
    }
    const ok = await withStore('readwrite', (store) => store.put(record, ownerId), false);
    return ok !== false;
  } catch {
    return false;
  }
}

/** The photos kept in memory for this page load (see top), or null. Synchronous. */
export function peekWizardDraftFiles(ownerId) {
  return (ownerId && memory.get(ownerId)) || null;
}

/**
 * The stored photos `{ cover, instagram }` (File or null), or null when there
 * is nothing (or it is older than about two weeks, then it is removed).
 */
export async function loadWizardDraftFiles(ownerId, now = Date.now()) {
  if (!ownerId) return null;
  if (memory.has(ownerId)) return memory.get(ownerId);
  const record = await withStore('readonly', (store) => store.get(ownerId), null);
  if (!record) return null;
  if (isExpired(record, now)) {
    await clearWizardDraftFiles(ownerId);
    return null;
  }
  return { cover: deserializeFile(record.cover), instagram: deserializeFile(record.instagram) };
}

export async function clearWizardDraftFiles(ownerId) {
  if (!ownerId) return;
  memory.delete(ownerId);
  await withStore('readwrite', (store) => store.delete(ownerId), undefined);
}

/** After login / signup: the guest's photos move onto the account, once. */
export async function adoptGuestWizardDraftFiles(uid, now = Date.now()) {
  if (!uid || uid === GUEST_DRAFT_ID) return false;
  if (memory.has(GUEST_DRAFT_ID)) {
    memory.set(uid, memory.get(GUEST_DRAFT_ID));
    memory.delete(GUEST_DRAFT_ID);
  }
  const record = await withStore('readonly', (store) => store.get(GUEST_DRAFT_ID), null);
  if (!record) return false;
  if (!isExpired(record, now)) {
    const ok = await withStore('readwrite', (store) => store.put(record, uid), false);
    if (ok === false) return false;
  }
  await clearWizardDraftFiles(GUEST_DRAFT_ID);
  return !isExpired(record, now);
}

/** Drops every entry older than about two weeks (photos nobody came back for). */
export async function pruneWizardDraftFiles(now = Date.now()) {
  await withStore(
    'readwrite',
    (store) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (isExpired(cursor.value, now)) cursor.delete();
        cursor.continue();
      };
      return null;
    },
    undefined
  );
}
