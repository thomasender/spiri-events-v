const STORAGE_KEY_PREFIX = 'eventWizardDraft';
const SCHEMA_VERSION = 1;

// A visitor without an account fills in the wizard too (docs/guest-event-draft.md).
// Their draft lives under `eventWizardDraft:guest` until they sign in; then it
// moves to `eventWizardDraft:{uid}` once (adoptGuestWizardDraft).
export const GUEST_DRAFT_ID = 'guest';
// A guest draft that nobody picked up is dropped after about two weeks.
export const GUEST_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Storage id of the draft: the uid, or GUEST_DRAFT_ID without an account. */
export function wizardDraftOwner(user) {
  return user?.uid || GUEST_DRAFT_ID;
}

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

export function loadWizardDraft(uid, now = Date.now()) {
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
    if (
      uid === GUEST_DRAFT_ID &&
      (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > GUEST_DRAFT_MAX_AGE_MS)
    ) {
      clearWizardDraft(uid);
      return null;
    }
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

/**
 * True while a guest draft that reached the wizard's last page (Zusammenfassung)
 * waits in this browser: only then the confirmation mail leads back to it.
 * Merely opening the wizard also stores a (nearly empty) draft.
 */
export function hasGuestWizardDraft() {
  const draft = loadWizardDraft(GUEST_DRAFT_ID);
  return Number.isInteger(draft?.currentStep) && draft.currentStep >= 4;
}

/**
 * After login / signup: move the guest draft onto the account, once. The guest
 * draft is the newer work, so its values win over an older draft of the account.
 * Returns true when a guest draft was taken over.
 */
export function adoptGuestWizardDraft(uid) {
  if (!uid || uid === GUEST_DRAFT_ID) return false;
  const guest = loadWizardDraft(GUEST_DRAFT_ID);
  if (!guest) return false;
  const existing = loadWizardDraft(uid);
  const merged = existing
    ? { ...existing, ...guest, formData: { ...existing.formData, ...guest.formData } }
    : guest;
  if (!saveWizardDraft(uid, merged)) return false;
  clearWizardDraft(GUEST_DRAFT_ID);
  return true;
}
