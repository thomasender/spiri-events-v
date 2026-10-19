// Consent-gated Google Analytics 4 (via Firebase) with Consent Mode v2.
// Nothing from firebase/analytics is imported until the visitor consents.
// Every export is safe to call anywhere: failures never propagate.
import app from './firebase';

export const EVENTS = Object.freeze({
  PAGE_VIEW: 'page_view',
  SELECT_CONTENT: 'select_content',
  FILTER_APPLY: 'filter_apply',
  SEARCH: 'search',
  FAVORITE_ADD: 'favorite_add',
  FAVORITE_REMOVE: 'favorite_remove',
  SHARE: 'share',
  OUTBOUND_CLICK: 'outbound_click',
  ORGANIZER_LINK_CLICK: 'organizer_link_click',
  CALENDAR_ADD: 'calendar_add',
  CALENDAR_VIEW_CHANGE: 'calendar_view_change',
  DONATE_CLICK: 'donate_click',
  DONATE_COMPLETE: 'donate_complete',
  SIGN_UP: 'sign_up',
  LOGIN: 'login',
  EVENT_CREATE_START: 'event_create_start',
  EVENT_CREATE_SUBMIT: 'event_create_submit',
  PWA_INSTALL_PROMPT: 'pwa_install_prompt',
  PWA_INSTALL: 'pwa_install',
  EXCEPTION: 'exception',
});

const PII_KEYS = new Set([
  'email',
  'name',
  'displayname',
  'display_name',
  'user_id',
  'userid',
  'uid',
  'phone',
  'token',
]);

let consent = false;
let adminUser = false;
let sdk = null; // { mod, instance }
let initPromise = null;
let lastPageLocation = null; // previous in-app page, sent as page_referrer

function envAllowed() {
  try {
    if (import.meta.env.DEV) return false;
    if (import.meta.env.VITE_USE_EMULATORS === 'true') return false;
    if (import.meta.env.VITE_ANALYTICS_ENABLED === 'false') return false;
    if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return false;
    return true;
  } catch {
    return false;
  }
}

function consentState(granted) {
  return {
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  };
}

function collecting() {
  return consent && !adminUser;
}

function applyState() {
  if (!sdk) return;
  try {
    sdk.mod.setConsent(consentState(consent));
    sdk.mod.setAnalyticsCollectionEnabled(sdk.instance, collecting());
  } catch {
    /* ignore */
  }
}

async function load() {
  try {
    const mod = await import('firebase/analytics');
    if (!(await mod.isSupported())) return null;
    const instance = mod.initializeAnalytics(app, {
      config: {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    });
    sdk = { mod, instance };
    applyState();
    return sdk;
  } catch {
    return null;
  }
}

/** Loads GA after consent. Resolves true if analytics is active. */
export async function initAnalytics() {
  try {
    if (!consent || !envAllowed()) return false;
    if (!sdk) {
      initPromise ??= load();
      await initPromise;
      if (!sdk) initPromise = null;
    }
    return !!sdk && collecting();
  } catch {
    return false;
  }
}

/** Record the visitor's decision. Granting initialises GA, revoking stops it. */
export async function setAnalyticsConsent(granted) {
  consent = granted === true;
  try {
    if (consent) await initAnalytics();
    applyState();
  } catch {
    /* ignore */
  }
}

/** Admins send nothing. Call whenever the auth role is known/changes. */
export async function setAnalyticsAdminUser(isAdmin) {
  adminUser = isAdmin === true;
  applyState();
}

/** Current page URL without query string or hash (no tokens, no search terms). */
function currentPageLocation() {
  try {
    const { origin, pathname } = window.location;
    return origin && pathname ? `${origin}${pathname}` : undefined;
  } catch {
    return undefined;
  }
}

function cleanParams(params) {
  // page_location ties every event to the page it happened on, so the admin
  // statistics can count e.g. "Mehr Infos" clicks per event page.
  const out = { page_location: currentPageLocation() };
  if (out.page_location === undefined) delete out.page_location;
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || PII_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export async function trackEvent(name, params) {
  try {
    if (!collecting() || !envAllowed()) return;
    if (initPromise) await initPromise;
    if (!sdk || !collecting()) return;
    sdk.mod.logEvent(sdk.instance, name, cleanParams(params));
  } catch {
    /* ignore */
  }
}

/**
 * Sends page_view; query string and hash are always dropped. From the second
 * page view on, page_referrer is the previous page of this site, so the admin
 * statistics can show "came from Kalender / Verzeichnis …". The first one keeps
 * GA's default (the external referrer, e.g. Instagram).
 */
export async function trackPageView(path, title) {
  const clean = String(path ?? '').split(/[?#]/)[0];
  const location = currentPageLocation();
  const referrer = lastPageLocation && lastPageLocation !== location ? lastPageLocation : undefined;
  if (collecting() && envAllowed()) lastPageLocation = location ?? null;
  return trackEvent(EVENTS.PAGE_VIEW, {
    page_path: clean,
    page_title: title,
    page_referrer: referrer,
  });
}
