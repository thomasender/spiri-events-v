// Event import, claim (docs/event-import.md, "Claim"): client-side helpers for
// /uebernehmen, the "Veranstalter-Übernahme" banner and the wizard hint. No
// Firebase imports; the callables are in src/lib/eventClaim.js.

// Same format as TOKEN_PATTERN in functions/src/eventImportClaim.ts.
export const CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

// The claim token waits here while the person logs in or creates an account
// (and confirms the e-mail, possibly in another tab), so it never travels in
// a URL again: not in `from`, not in the confirmation mail's `next`.
export const PENDING_CLAIM_KEY = 'pendingClaimToken';
export const PENDING_CLAIM_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const BANNER_KEY_PREFIX = 'claimBannerDismissed:';

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function isClaimToken(value) {
  return typeof value === 'string' && CLAIM_TOKEN_PATTERN.test(value);
}

export function savePendingClaimToken(token, now = Date.now()) {
  if (!isClaimToken(token)) return;
  try {
    storage()?.setItem(PENDING_CLAIM_KEY, JSON.stringify({ token, savedAt: now }));
  } catch {
    /* private mode: the token then only lives for this page */
  }
}

export function readPendingClaimToken(now = Date.now()) {
  try {
    const raw = storage()?.getItem(PENDING_CLAIM_KEY);
    if (!raw) return null;
    const { token, savedAt } = JSON.parse(raw);
    if (!isClaimToken(token) || typeof savedAt !== 'number') return null;
    if (now - savedAt > PENDING_CLAIM_MAX_AGE_MS) {
      clearPendingClaimToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function hasPendingClaimToken() {
  return readPendingClaimToken() !== null;
}

export function clearPendingClaimToken() {
  try {
    storage()?.removeItem(PENDING_CLAIM_KEY);
  } catch {
    /* ignore */
  }
}

/** The banner in "Meine Events" shows once per account until dismissed or used. */
export function isClaimBannerDismissed(uid) {
  try {
    return Boolean(uid) && storage()?.getItem(`${BANNER_KEY_PREFIX}${uid}`) === '1';
  } catch {
    return false;
  }
}

export function dismissClaimBanner(uid) {
  try {
    if (uid) storage()?.setItem(`${BANNER_KEY_PREFIX}${uid}`, '1');
  } catch {
    /* ignore */
  }
}

/** German text for a claim error (HttpsError `details.reason` first). */
export function claimErrorMessage(err) {
  const reason = err?.details?.reason;
  switch (reason) {
    case 'email-not-verified':
      return 'Bitte bestätige zuerst deine E-Mail-Adresse. Danach kannst du deine Events übernehmen.';
    case 'invalid-token':
      return 'Dieser Link ist ungültig. Bitte öffne ihn direkt aus unserer E-Mail.';
    case 'token-expired':
      return 'Dieser Link ist abgelaufen. Schreib uns kurz an admin@thetribe.at, dann helfen wir dir weiter.';
    case 'already-claimed':
      return 'Diese Events wurden schon von einem anderen Konto übernommen. Wenn das nicht stimmt, schreib uns an admin@thetribe.at.';
    case 'declined':
    case 'blocked':
      return 'Für diesen Veranstalter können wir keine Events mehr übernehmen. Schreib uns bei Fragen an admin@thetribe.at.';
    case 'curator':
      return 'Mit dem Redaktionskonto kann man keine Events übernehmen.';
    case 'no-organizer':
      return 'Für deine E-Mail-Adresse haben wir keine Events gefunden.';
    default:
      break;
  }
  const code = String(err?.code || '').replace(/^functions\//, '');
  if (code === 'resource-exhausted') {
    return 'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann noch einmal.';
  }
  if (code === 'unauthenticated') return 'Bitte melde dich zuerst an.';
  return 'Das hat leider nicht geklappt. Bitte versuche es später noch einmal.';
}

/** German summary of a successful claimCuratedEvents result. */
export function claimResultMessage(result) {
  if (result?.status === 'claimed') {
    const n = Number(result.eventCount) || 0;
    if (n === 0) return 'Deine Events gehören schon zu deinem Konto.';
    return n === 1
      ? 'Geschafft! Ein Event gehört jetzt zu deinem Konto. Du findest es unter „Meine Events“.'
      : `Geschafft! ${n} Events gehören jetzt zu deinem Konto. Du findest sie unter „Meine Events“.`;
  }
  if (result?.status === 'requested') {
    return 'Danke! Wir prüfen kurz, ob die Events zu dir gehören. Danach findest du sie unter „Meine Events“.';
  }
  if (result?.status === 'request-rejected') {
    return 'Wir konnten deine Anfrage leider nicht bestätigen. Schreib uns bei Fragen an admin@thetribe.at.';
  }
  return '';
}
