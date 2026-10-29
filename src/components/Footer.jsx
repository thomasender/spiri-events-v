import { Link } from 'react-router-dom';
import { usePwaInstall, isIOSDevice } from '../hooks/usePwaInstall';
import { PWA_OPEN_REQUEST_EVENT } from './PwaInstallPrompt';
import { requestConsentBanner } from '../lib/analyticsConsent';
import { COPYRIGHT_NOTICE } from '../config/brand';
import { useRegion } from '../hooks/useRegion';
import { useAuth } from '../hooks/useAuth';
import DonateLink from './DonateLink';
import { RegionPickButton } from './RegionSwitcher';
import { aboutPathFor } from '../utils/regionRouting';
import './Footer.css';

export default function Footer() {
  const { installAvailable, isStandalone, isMobileViewport, requestInstall } = usePwaInstall();
  const isIOS = isIOSDevice();
  const { role, user } = useAuth();
  // The page's own region / combined view (on Impressum / Datenschutz the one the
  // visitor came from) decides; a coming-soon region is not the context region, so
  // `regionId` alone would fall back to the default. Unchanged `/ueber-uns` while
  // Vorarlberg is the only active region; combined views use it too.
  const { regionId, allRegions, pageSlug } = useRegion();
  const aboutPath = aboutPathFor({ pageSlug, regionId, regions: allRegions });

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
        <span className="footer-copy">{COPYRIGHT_NOTICE}</span>
        <nav className="footer-nav" aria-label="Footer-Navigation">
          <DonateLink className="footer-donate-link" testId="footer-donate-link" />
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
          {/* Visitors without an account (also in the header) and Super-Admins. */}
          {(!user || role === 'Admin') && (
            <RegionPickButton className="region-pick-button--footer" testId="footer-region-pick" />
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
