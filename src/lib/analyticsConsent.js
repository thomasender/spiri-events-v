// Persistence for the analytics consent decision. localStorage can be missing
// or throw (private mode, blocked site data), so every access is guarded and
// the decision falls back to memory for the current session.
export const CONSENT_STORAGE_KEY = 'analytics-consent';
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 12 months
export const CONSENT_CHANGE_EVENT = 'analytics-consent-change';
export const CONSENT_OPEN_EVENT = 'analytics-consent-open';

let memoryDecision = null;

function isValid(decision, now) {
  return (
    decision &&
    (decision.value === 'granted' || decision.value === 'denied') &&
    Number.isFinite(decision.timestamp) &&
    now - decision.timestamp < CONSENT_MAX_AGE_MS
  );
}

/** Returns 'granted', 'denied', or null when there is no (valid, fresh) decision. */
export function readConsent(now = Date.now()) {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return isValid(parsed, now) ? parsed.value : null;
    }
  } catch {
    /* fall through to memory */
  }
  return isValid(memoryDecision, now) ? memoryDecision.value : null;
}

export function writeConsent(granted, now = Date.now()) {
  const decision = { value: granted ? 'granted' : 'denied', timestamp: now };
  memoryDecision = decision;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(decision));
  } catch {
    /* kept in memory only */
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: { granted } }));
  } catch {
    /* ignore */
  }
  return decision.value;
}

export function requestConsentBanner() {
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
}

/** Test helper. */
export function resetConsentMemory() {
  memoryDecision = null;
}
