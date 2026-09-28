import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Smartphone } from 'lucide-react';
import { usePwaInstall, PWA_POPUP_DELAY_MS, isIOSDevice } from '../hooks/usePwaInstall';
import './PwaInstallPrompt.css';

// Custom event the Footer (and any other caller) dispatches to ask the popup
// to open. `detail.mode` picks which UI to render; the only value used today
// is `'ios'` (manual Share-menu steps). Anything else is ignored — the native
// install path is owned by the auto-timer below, not by external triggers,
// because iOS is the only path that can't trigger it itself.
export const PWA_OPEN_REQUEST_EVENT = 'pwa-install-open-requested';

// PwaInstallPrompt
//
// Mobile-only bottom-sheet that surfaces the Chrome-family `beforeinstallprompt`
// prompt after the user has spent some engaged time on the site. Designed for
// modern PWA UX (15 s delay, resets on route change, single ask per device):
//
//   - Non-iOS: after `PWA_POPUP_DELAY_MS` of engaged browsing on a fresh route,
//     we open the popup with the native install CTA. The browser fires
//     `beforeinstallprompt`, we capture it in usePwaInstall and replay it from
//     the "Installieren" button.
//   - iOS Safari never fires that event, so the popup is reached via the
//     "App installieren" footer link, which dispatches PWA_OPEN_REQUEST_EVENT
//     with `{ mode: 'ios' }`. The popup renders the manual Share-menu steps
//     instead of an install button.
//   - Once the user installs, the `appinstalled` event flips a localStorage
//     flag and the popup never reappears.
//   - Once the user dismisses ("Nicht jetzt"), the same flag is set so we
//     don't bug them again. The footer link stays so they can install later.
//   - The timer resets on every route change — this is the engagement signal
//     the user implicitly gives by navigating, and matches what most modern
//     PWAs (Twitter, Starbucks, Pinterest) do.
//
// Mounted once near the top of the React tree (App.jsx), alongside the other
// global chrome components (SeedBootstrap, ThemeApplier).
export default function PwaInstallPrompt() {
  const location = useLocation();
  const {
    installAvailable,
    pref,
    isStandalone,
    isMobileViewport: mobileViewport,
    requestInstall,
    dismissPermanently,
  } = usePwaInstall();
  const isIOS = isIOSDevice();
  const [open, setOpen] = useState(false);
  // Which UI to render when open. 'native' = the installable-prompt flow.
  // 'ios' = the manual Share-menu steps for iOS Safari.
  const [mode, setMode] = useState(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Auto-eligibility gates the native auto-popup only. External triggers
  // (the footer link on iOS) open the popup regardless of this flag — iOS
  // users never have `installAvailable`, so without that exception the iOS
  // path would be permanently suppressed.
  const autoPopupEligible =
    !isStandalone && pref !== 'accepted' && pref !== 'dismissed' && installAvailable;

  const closePopup = useCallback(() => {
    setOpen(false);
    setMode(null);
  }, []);

  const handleDismiss = useCallback(() => {
    closePopup();
    dismissPermanently();
  }, [closePopup, dismissPermanently]);

  const handleIOSClose = useCallback(() => {
    // iOS has no programmatic install — closing the dialog shouldn't burn
    // the dismissed pref. The footer link stays so the user can re-open it.
    closePopup();
  }, [closePopup]);

  const handleInstall = useCallback(async () => {
    closePopup();
    const choice = await requestInstall();
    if (choice?.outcome === 'unavailable') {
      // The browser-native prompt was lost between capture and click (tab
      // suspended, another component consumed it, etc.). Fall back to the
      // dismissed state so we don't re-pop immediately.
      dismissPermanently();
    }
  }, [requestInstall, dismissPermanently, closePopup]);

  // External trigger: the footer "App installieren" link dispatches this when
  // the browser-native prompt isn't available (iOS, or before
  // beforeinstallprompt has fired on non-iOS — though on non-iOS we let the
  // auto-popup handle that case and the footer is a no-op).
  useEffect(() => {
    const onOpenRequested = (event) => {
      if (event.detail?.mode === 'ios') {
        setMode('ios');
        setOpen(true);
      }
    };
    window.addEventListener(PWA_OPEN_REQUEST_EVENT, onOpenRequested);
    return () => window.removeEventListener(PWA_OPEN_REQUEST_EVENT, onOpenRequested);
  }, []);

  // Reset the delay on every route change. Resolving an engaged user from
  // a fresh route is the right time to ask — they're clearly browsing, not
  // bouncing. The effect dependency on autoPopupEligible ensures we don't
  // queue a timer once the user has accepted, dismissed or left mobile
  // viewport, and isIOS excludes iOS (handled via the footer link instead).
  useEffect(() => {
    if (!mobileViewport || !autoPopupEligible || isIOS) return undefined;

    const timer = window.setTimeout(() => {
      setMode('native');
      setOpen(true);
    }, PWA_POPUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [location.pathname, mobileViewport, autoPopupEligible, isIOS]);

  // Re-evaluate the eligibility gate: if the user accepts the install via
  // the footer link while this component is mounted, pref flips to 'accepted'
  // and we should not also show our own native popup. Only the native mode
  // auto-closes — the iOS mode is user-driven and stays open until dismissed.
  useEffect(() => {
    if (!autoPopupEligible && open && mode === 'native') {
      closePopup();
    }
  }, [autoPopupEligible, open, mode, closePopup]);

  // Focus management: remember what had focus before we opened, jump focus
  // into the close button on open, restore on close. Without this, the
  // dialog swallows keyboard focus on mobile talkback / switch control.
  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    closeButtonRef.current?.focus();

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (mode === 'ios') handleIOSClose();
        else handleDismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, mode, handleDismiss, handleIOSClose]);

  if (!open) return null;

  return (
    <div
      className="pwa-install-overlay"
      role="presentation"
      onClick={mode === 'ios' ? handleIOSClose : handleDismiss}
      data-testid="pwa-install-overlay"
    >
      <div
        className="pwa-install-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        aria-describedby="pwa-install-description"
        onClick={(event) => event.stopPropagation()}
        data-testid="pwa-install-sheet"
        data-mode={mode}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="pwa-install-close"
          aria-label="Schließen"
          onClick={mode === 'ios' ? handleIOSClose : handleDismiss}
          data-testid="pwa-install-close"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="pwa-install-icon" aria-hidden="true">
          <Smartphone size={28} />
        </div>
        <h2 id="pwa-install-title" className="pwa-install-title">
          {mode === 'ios' ? 'App auf dem iPhone installieren' : 'tribe als App installieren'}
        </h2>
        {mode === 'ios' ? (
          <IosInstallInstructions descriptionId="pwa-install-description" />
        ) : (
          <>
            <p id="pwa-install-description" className="pwa-install-description">
              Mit der App hast du tribe Vorarlberg immer griffbereit — auch ohne Browser zu öffnen.
              Schneller Zugriff direkt vom Startbildschirm.
            </p>
            <div className="pwa-install-actions">
              <button
                type="button"
                className="btn btn-primary pwa-install-install"
                onClick={handleInstall}
                data-testid="pwa-install-install"
              >
                Installieren
              </button>
              <button
                type="button"
                className="pwa-install-later"
                onClick={handleDismiss}
                data-testid="pwa-install-later"
              >
                Nicht jetzt
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IosInstallInstructions({ descriptionId }) {
  return (
    <>
      <p id={descriptionId} className="pwa-install-description">
        So fügst du tribe zu deinem Startbildschirm hinzu:
      </p>
      <ol className="pwa-install-ios-steps" data-testid="pwa-install-ios-steps">
        <li>
          Tippe unten in Safari auf das <strong>Teilen-Symbol</strong> (Quadrat mit Pfeil nach
          oben).
        </li>
        <li>
          Scrolle nach unten und wähle <strong>„Zum Home-Bildschirm“</strong>.
        </li>
        <li>
          Bestätige mit <strong>„Hinzufügen“</strong>. tribe erscheint dann als App-Icon auf deinem
          Startbildschirm.
        </li>
      </ol>
    </>
  );
}
