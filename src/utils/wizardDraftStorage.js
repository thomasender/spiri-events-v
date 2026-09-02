const STORAGE_KEY_PREFIX = 'eventWizardDraft';
const SCHEMA_VERSION = 1;

function buildStorageKey(uid) {
  if (!uid) return null;
  return `${STORAGE_KEY_PREFIX}:${uid}`;
}

function isSerializable(value) {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

export function saveWizardDraft(uid, draft) {
  const key = buildStorageKey(uid);
  if (!key) return false;
  if (!draft || typeof draft !== 'object') return false;
  if (!isSerializable(draft)) return false;

  try {
    const payload = {
      version: SCHEMA_VERSION,
      savedAt: Date.now(),
      draft,
    };
    localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadWizardDraft(uid) {
  const key = buildStorageKey(uid);
  if (!key) return null;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!parsed.draft || typeof parsed.draft !== 'object') return null;
    if (!parsed.draft.formData || typeof parsed.draft.formData !== 'object') return null;
    return parsed.draft;
  } catch {
    return null;
  }
}

export function clearWizardDraft(uid) {
  const key = buildStorageKey(uid);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable (private mode, quota, disabled cookies).
    // Clearing is best-effort — failing silently is acceptable.
  }
}
