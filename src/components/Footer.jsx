import { Link, useLocation } from 'react-router-dom';
import { usePwaInstall, isIOSDevice } from '../hooks/usePwaInstall';
import { PWA_OPEN_REQUEST_EVENT } from './PwaInstallPrompt';
import { requestConsentBanner } from '../lib/analyticsConsent';
import { LEGACY_SITE_NAME } from '../config/brand';
import { useRegion } from '../hooks/useRegion';
import { regionCanonicalPath, regionPath, regionSlugFromPath } from '../utils/regionRouting';
import { isRegionSlug } from '../utils/regions';
import './Footer.css';

export default function Footer() {
  const { installAvailable, isStandalone, isMobileViewport, requestInstall } = usePwaInstall();
  const isIOS = isIOSDevice();
  // Unchanged `/ueber-uns` while Vorarlberg is the only active region; combined views use it too.
  const { regionId, allRegions, combinedView, comingSoon } = useRegion();
  const { pathname } = useLocation();
  // A coming-soon region is not the context region (that falls back to the
  // default), so its own address names the region.
  const comingSoonSlug = comingSoon ? regionSlugFromPath(pathname) : null;
  const aboutPath =
    comingSoonSlug && isRegionSlug(comingSoonSlug)
      ? regionPath(comingSoonSlug, '/ueber-uns')
      : combinedView || comingSoonSlug
        ? '/ueber-uns'
        : regionCanonicalPath(regionId, '/ueber-uns', allRegions);

  // The link is removed from the DOM (not just visually hidden) on desktop
  // and on standalone runs. On desktop, Chrome shows its own install UI and
  // iOS users on desktop Safari can't install at all — neither path leads
  // somewhere useful for our footer link to point.
  const showInstallLink = !isStandalone && isMobileViewport;

  const handleInstallClick = (event) => {
    // If we have a captured beforeinstallprompt event, fire the native prompt
    // and let the browser handle the rest. Otherwise (iOS, or the event was
    // already consumed), open the popup dialog with the iOS Share-menu
    // instructions — on non-iOS without an installable prompt yet, we let
    // the auto-popup timer handle the ask instead of showing the iOS steps
    // to a non-iOS user.
    if (installAvailable) {
      event.preventDefault();
      requestInstall();
      return;
    }
    if (isIOS) {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent(PWA_OPEN_REQUEST_EVENT, { detail: { mode: 'ios' } }));
    }
  };

  return (
    <footer className="footer">
      <div className="footer-container">
        <span className="footer-copy">© 2026 {LEGACY_SITE_NAME}</span>
        <nav className="footer-nav" aria-label="Footer-Navigation">
          <Link to={aboutPath}>Über uns</Link>
          {showInstallLink && (
            <button
              type="button"
              className="footer-install-link"
              onClick={handleInstallClick}
              aria-haspopup="dialog"
              data-testid="footer-install-link"
            >
              App installieren
            </button>
          )}
          <Link to="/impressum">Impressum</Link>
          <Link to="/datenschutz">Datenschutz</Link>
          <button
            type="button"
            className="footer-cookie-link"
            onClick={requestConsentBanner}
            data-testid="footer-cookie-settings"
          >
            Cookie-Einstellungen
          </button>
        </nav>
      </div>
    </footer>
  );
}
