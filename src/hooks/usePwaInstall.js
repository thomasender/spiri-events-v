import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pwa-install-pref';
export const PWA_POPUP_DELAY_MS = 15000;
export const PWA_MOBILE_QUERY = '(max-width: 800px)';
const IOS_USER_AGENT = /iPhone|iPad|iPod/i;

// Module-level state so the captured `beforeinstallprompt` event and the
// global window listeners survive React Strict-Mode double-invocation, route
// changes and component remounts. Without this, a route change would clear
// the ref and the captured event would be lost.
let deferredPrompt = null;
let promptBridgeAttached = false;

function attachPromptBridge() {
  if (promptBridgeAttached || typeof window === 'undefined') return;
  promptBridgeAttached = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // preventDefault stops Chrome from showing its own mini-infobar, so we
    // own the entire install UX. Re-fire the event as a custom one for any
    // mounted hook instances.
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    try {
      localStorage.setItem(STORAGE_KEY, 'accepted');
    } catch {
      /* storage might be blocked — non-fatal */
    }
    window.dispatchEvent(new CustomEvent('pwa-install-completed'));
  });
}

export function readStoredPref() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'accepted' || value === 'dismissed' ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredPref(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* non-fatal — storage quota / privacy mode */
  }
}

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  if (IOS_USER_AGENT.test(navigator.userAgent)) return true;
  // iPadOS 13+ identifies as Mac in Safari but exposes touch capability.
  return /Mac/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  );
}

export function isMobileViewport() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(PWA_MOBILE_QUERY).matches === true;
}

// Clears the deferred prompt ref. Exposed for tests that fake the event and
// then want to assert it cannot be re-fired.
export function _resetPwaInstallStateForTests() {
  deferredPrompt = null;
  promptBridgeAttached = false;
}

// Triggering the native prompt requires the captured event. We resolve the
// caller's promise with the userChoice payload (or 'unavailable' if the
// prompt has already been consumed / never fired). The outcome is also
// broadcast so any mounted hook instance can update its pref state without
// us needing to thread setters through module-level code.
async function promptForInstallImpl() {
  if (!deferredPrompt) return { outcome: 'unavailable' };
  const event = deferredPrompt;
  deferredPrompt = null;
  event.prompt();
  let choice;
  try {
    choice = await event.userChoice;
  } catch {
    choice = { outcome: 'dismissed' };
  }
  const accepted = choice?.outcome === 'accepted';
  writeStoredPref(accepted ? 'accepted' : 'dismissed');
  window.dispatchEvent(new CustomEvent('pwa-install-decided', { detail: { accepted } }));
  return choice;
}

export function usePwaInstall() {
  const [installAvailable, setInstallAvailable] = useState(deferredPrompt != null);
  const [pref, setPrefState] = useState(readStoredPref);
  const [standalone, setStandalone] = useState(isStandaloneDisplay);
  const [mobileViewport, setMobileViewport] = useState(isMobileViewport);

  useEffect(() => {
    attachPromptBridge();
    if (deferredPrompt) setInstallAvailable(true);

    const onAvailable = () => setInstallAvailable(true);
    const onCompleted = () => {
      setInstallAvailable(false);
      setPrefState('accepted');
    };
    const onDecided = (event) => {
      setInstallAvailable(false);
      setPrefState(event.detail?.accepted ? 'accepted' : 'dismissed');
    };
    window.addEventListener('pwa-install-available', onAvailable);
    window.addEventListener('pwa-install-completed', onCompleted);
    window.addEventListener('pwa-install-decided', onDecided);

    let mql = null;
    const onMediaChange = (event) => setMobileViewport(event.matches);
    if (typeof window !== 'undefined' && window.matchMedia) {
      mql = window.matchMedia(PWA_MOBILE_QUERY);
      if (mql.addEventListener) mql.addEventListener('change', onMediaChange);
      else if (mql.addListener) mql.addListener(onMediaChange);
    }

    return () => {
      window.removeEventListener('pwa-install-available', onAvailable);
      window.removeEventListener('pwa-install-completed', onCompleted);
      window.removeEventListener('pwa-install-decided', onDecided);
      if (mql) {
        if (mql.removeEventListener) mql.removeEventListener('change', onMediaChange);
        else if (mql.removeListener) mql.removeListener(onMediaChange);
      }
    };
  }, []);

  const requestInstall = useCallback(() => promptForInstallImpl(), []);

  const dismissPermanently = useCallback(() => {
    writeStoredPref('dismissed');
    setPrefState('dismissed');
  }, []);

  const clearPreference = useCallback(() => {
    writeStoredPref(null);
    setPrefState(null);
  }, []);

  return {
    // Whether the Chrome-family beforeinstallprompt event has fired and is
    // still pending. iOS Safari never sets this true.
    installAvailable,
    // Persisted preference: 'accepted' | 'dismissed' | null.
    pref,
    // True when the app is already installed (display-mode: standalone).
    isStandalone: standalone,
    // True when viewport is at or below the mobile breakpoint.
    isMobileViewport: mobileViewport,
    // Best-guess iOS / iPadOS detection, for the footer-link path.
    isIOSDevice: isIOSDevice(),
    // Triggers the native install prompt. Returns userChoice outcome.
    requestInstall,
    // Sets the persisted preference to 'dismissed' so the popup is suppressed
    // on subsequent page loads. Use for both "Nicht jetzt" and the X button.
    dismissPermanently,
    // Resets the persisted preference — useful for the "reset for testing"
    // affordance and for users who later want to re-enable the prompt.
    clearPreference,
  };
}
