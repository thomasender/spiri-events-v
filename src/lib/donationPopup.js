// Weekly donation pop-in, shown until the visitor clicks "Jetzt unterstützen".
// Switch it off with DONATION_POPUP_ENABLED. Admins can always preview it by
// adding ?spendenpopup=1 to any URL.
export const DONATION_POPUP_ENABLED = true;
export const DONATION_POPUP_STORAGE_KEY = 'donation-popup-last-shown';
export const DONATION_POPUP_CLICKED_KEY = 'donation-popup-donate-clicked';
export const DONATION_POPUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const DONATION_POPUP_DELAY_MS = 20000;
export const DONATION_POPUP_PREVIEW_PARAM = 'spendenpopup';

// Pages where asking for a donation would be noise or redundant.
const EXCLUDED_PREFIXES = ['/spenden', '/login', '/admin', '/auth-action', '/profil'];

export function isExcludedPath(pathname) {
  return EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isPreviewRequested(search) {
  return new URLSearchParams(search).get(DONATION_POPUP_PREVIEW_PARAM) === '1';
}

export function readLastShown() {
  try {
    const value = Number(window.localStorage.getItem(DONATION_POPUP_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function markShown(now = Date.now()) {
  try {
    window.localStorage.setItem(DONATION_POPUP_STORAGE_KEY, String(now));
  } catch {
    /* without storage the pop-in simply shows once per page load */
  }
}

export function hasClickedDonate() {
  try {
    return window.localStorage.getItem(DONATION_POPUP_CLICKED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remembered for good: the visitor is never asked again. */
export function markDonateClicked() {
  try {
    window.localStorage.setItem(DONATION_POPUP_CLICKED_KEY, '1');
  } catch {
    /* without storage the weekly cadence still applies per page load */
  }
}

/** True when the visitor has not seen the pop-in within the last 7 days. */
export function isDueThisWeek(lastShown, now = Date.now()) {
  return lastShown === null || now - lastShown >= DONATION_POPUP_INTERVAL_MS || lastShown > now;
}

/**
 * True when the account is at least 7 days old. Visitors without an account and
 * accounts without a (valid) creation time count as old enough, so only
 * verifiably fresh registrations are held back.
 */
export function isAccountOldEnough(creationTime, now = Date.now()) {
  if (!creationTime) return true;
  const created = new Date(creationTime).getTime();
  if (!Number.isFinite(created)) return true;
  return now - created >= DONATION_POPUP_INTERVAL_MS;
}
