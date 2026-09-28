import { Link } from 'react-router-dom';
import { usePwaInstall, isIOSDevice } from '../hooks/usePwaInstall';
import { PWA_OPEN_REQUEST_EVENT } from './PwaInstallPrompt';
import './Footer.css';

export default function Footer() {
  const { installAvailable, isStandalone, isMobileViewport, requestInstall } = usePwaInstall();
  const isIOS = isIOSDevice();

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
        <span className="footer-copy">© 2026 tribe Vorarlberg</span>
        <nav className="footer-nav" aria-label="Footer-Navigation">
          <Link to="/ueber-uns">Über uns</Link>
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
        </nav>
      </div>
    </footer>
  );
}
