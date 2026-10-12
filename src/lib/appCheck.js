// Firebase App Check for the browser app (reCAPTCHA).
//
// Inert unless a site key is configured: without VITE_RECAPTCHA_SITE_KEY, in
// the emulators and in plain dev builds nothing is initialised and the app
// behaves exactly as before. Initialising must never break the page, so every
// failure ends in a console warning and the "appcheck:failed" window event
// (the AppCheckBanner listens to it).
import {
  initializeAppCheck,
  getToken,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
} from 'firebase/app-check';

export const APP_CHECK_FAILED_EVENT = 'appcheck:failed';

function notifyFailure() {
  try {
    window.dispatchEvent(new CustomEvent(APP_CHECK_FAILED_EVENT));
  } catch {
    // no window (tests, SSR): nothing to tell
  }
}

/**
 * @param app      the Firebase app
 * @param env      import.meta.env (injectable for tests)
 * @returns the AppCheck instance, or null when App Check is not active
 */
export function setupAppCheck(app, env = import.meta.env) {
  const siteKey =
    typeof env.VITE_RECAPTCHA_SITE_KEY === 'string' ? env.VITE_RECAPTCHA_SITE_KEY.trim() : '';
  if (!siteKey) return null;
  if (env.VITE_USE_EMULATORS === 'true') return null;

  try {
    // A debug token only ever applies to local development against production.
    const debugToken =
      env.DEV && typeof env.VITE_APPCHECK_DEBUG_TOKEN === 'string'
        ? env.VITE_APPCHECK_DEBUG_TOKEN.trim()
        : '';
    if (debugToken) {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    } else if (env.DEV) {
      // Plain dev builds are not registered with reCAPTCHA: stay inert.
      return null;
    }

    const provider =
      env.VITE_RECAPTCHA_PROVIDER === 'v3'
        ? new ReCaptchaV3Provider(siteKey)
        : new ReCaptchaEnterpriseProvider(siteKey);
    const appCheck = initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });

    // Fetch the first token in the background so a blocked reCAPTCHA is noticed
    // early; the first render never waits for it.
    getToken(appCheck).catch((err) => {
      console.warn('App Check token unavailable:', err?.code || err?.name || 'unknown error');
      notifyFailure();
    });
    return appCheck;
  } catch (err) {
    console.warn('App Check could not be initialised:', err?.code || err?.name || 'unknown error');
    notifyFailure();
    return null;
  }
}
