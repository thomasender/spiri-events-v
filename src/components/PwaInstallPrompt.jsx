import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Smartphone } from 'lucide-react';
import { usePwaInstall, PWA_POPUP_DELAY_MS, isIOSDevice } from '../hooks/usePwaInstall';
import './PwaInstallPrompt.css';

// PwaInstallPrompt
//
// Mobile-only bottom-sheet that surfaces the Chrome-family `beforeinstallprompt`
// prompt after the user has spent some engaged time on the site. Designed for
// modern PWA UX (15 s delay, resets on route change, single ask per device):
//
//   - iOS Safari is intentionally excluded — it never fires the event, so the
//     prompt would never surface. iOS users get the equivalent affordance via
//     the "App installieren" link in the footer, which shows inline steps.
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
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  const isIOS = isIOSDevice();

  // The popup should never appear for iOS Safari (the underlying event never
  // fires there) nor for users who are already running the installed app.
  const popupEligible =
    !isIOS && !isStandalone && pref !== 'accepted' && pref !== 'dismissed' && installAvailable;

  const handleDismiss = useCallback(() => {
    setOpen(false);
    dismissPermanently();
  }, [dismissPermanently]);

  const handleInstall = useCallback(async () => {
    setOpen(false);
    const choice = await requestInstall();
    if (choice?.outcome === 'unavailable') {
      // The browser-native prompt was lost between capture and click (tab
      // suspended, another component consumed it, etc.). Fall back to the
      // dismissed state so we don't re-pop immediately.
      dismissPermanently();
    }
  }, [requestInstall, dismissPermanently]);

  // Reset the delay on every route change. Resolving an engaged user from
  // a fresh route is the right time to ask — they're clearly browsing, not
  // bouncing. The effect dependency on popupEligible ensures we don't queue
  // a timer once the user has accepted, dismissed or left mobile viewport.
  useEffect(() => {
    if (!mobileViewport || !popupEligible) return undefined;

    const timer = window.setTimeout(() => {
      setOpen(true);
    }, PWA_POPUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [location.pathname, mobileViewport, popupEligible]);

  // Re-evaluate the eligibility gate on every render: if the user accepts the
  // install via the footer link while this component is mounted, pref flips to
  // 'accepted' and we should not also show our own popup.
  useEffect(() => {
    if (!popupEligible && open) setOpen(false);
  }, [popupEligible, open]);

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
        handleDismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, handleDismiss]);

  if (!open) return null;

  return (
    <div
      className="pwa-install-overlay"
      role="presentation"
      onClick={handleDismiss}
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
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="pwa-install-close"
          aria-label="Schließen"
          onClick={handleDismiss}
          data-testid="pwa-install-close"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="pwa-install-icon" aria-hidden="true">
          <Smartphone size={28} />
        </div>
        <h2 id="pwa-install-title" className="pwa-install-title">
          tribe als App installieren
        </h2>
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
      </div>
    </div>
  );
}
