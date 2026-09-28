import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePwaInstall, isIOSDevice } from '../hooks/usePwaInstall';
import './Footer.css';

export default function Footer() {
  const { installAvailable, isStandalone, isMobileViewport, requestInstall } = usePwaInstall();
  const isIOS = isIOSDevice();
  // On iOS Safari the browser never exposes the native install prompt, so
  // there's no programmatic way to trigger installation. Instead we surface
  // a disclosure block under the link with the manual Share-menu steps.
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  // The link is removed from the DOM (not just visually hidden) on desktop
  // and on standalone runs. On desktop, Chrome shows its own install UI and
  // iOS users on desktop Safari can't install at all — neither path leads
  // somewhere useful for our footer link to point.
  const showInstallLink = !isStandalone && isMobileViewport;

  const handleInstallClick = (event) => {
    // If we have a captured beforeinstallprompt event, fire the native prompt
    // and let the browser handle the rest. Otherwise (iOS, or the event was
    // already consumed), fall through to the disclosure behaviour below.
    if (installAvailable) {
      event.preventDefault();
      requestInstall();
      return;
    }
    if (isIOS) {
      event.preventDefault();
      setShowIOSHelp((value) => !value);
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
              aria-expanded={isIOS ? showIOSHelp : undefined}
              aria-controls={isIOS ? 'pwa-install-ios-help' : undefined}
              data-testid="footer-install-link"
            >
              App installieren
            </button>
          )}
          <Link to="/impressum">Impressum</Link>
          <Link to="/datenschutz">Datenschutz</Link>
        </nav>
      </div>
      {showInstallLink && isIOS && showIOSHelp && (
        <div className="footer-ios-help" id="pwa-install-ios-help">
          <div className="footer-ios-help-inner">
            <p className="footer-ios-help-title">So installierst du die App auf deinem iPhone:</p>
            <ol className="footer-ios-help-steps">
              <li>
                Tippe unten in Safari auf das <strong>Teilen-Symbol</strong> (Quadrat mit Pfeil nach
                oben).
              </li>
              <li>
                Scrolle nach unten und wähle <strong>„Zum Home-Bildschirm“</strong>.
              </li>
              <li>
                Bestätige mit <strong>„Hinzufügen“</strong>. tribe erscheint dann als App-Icon auf
                deinem Startbildschirm.
              </li>
            </ol>
          </div>
        </div>
      )}
    </footer>
  );
}
