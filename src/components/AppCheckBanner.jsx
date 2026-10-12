import { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { APP_CHECK_FAILED_EVENT } from '../lib/appCheck';
import './AppCheckBanner.css';

const SESSION_KEY = 'appCheckBannerShown';

function alreadyShown() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markShown() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // storage blocked: the banner may show again after a reload, that is fine
  }
}

// Tells visitors whose browser blocks the security check (reCAPTCHA) what to
// do, instead of leaving them with a page that silently stops loading data.
// Shown at most once per session, only after App Check itself reported a
// failure (never for ordinary permission errors).
export default function AppCheckBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onFailed = () => {
      if (alreadyShown()) return;
      markShown();
      setVisible(true);
    };
    window.addEventListener(APP_CHECK_FAILED_EVENT, onFailed);
    return () => window.removeEventListener(APP_CHECK_FAILED_EVENT, onFailed);
  }, []);

  if (!visible) return null;

  return (
    <div className="app-check-banner" role="alert" data-testid="app-check-banner">
      <ShieldAlert size={18} aria-hidden="true" />
      <p>
        Die Sicherheitsprüfung konnte nicht abgeschlossen werden. Bitte lade die Seite neu. Wenn das
        Problem bleibt, schalte Werbe- oder Tracking-Blocker für diese Seite aus.
      </p>
      <div className="app-check-banner-actions">
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Seite neu laden
        </button>
        <button
          type="button"
          className="app-check-banner-close"
          aria-label="Hinweis schließen"
          onClick={() => setVisible(false)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
