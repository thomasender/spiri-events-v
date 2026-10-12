import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { setAnalyticsConsent } from '../lib/analytics';
import { CONSENT_OPEN_EVENT, readConsent, writeConsent } from '../lib/analyticsConsent';
import './CookieConsent.css';

export default function CookieConsent() {
  const [open, setOpen] = useState(() => readConsent() === null);
  const dialogRef = useRef(null);
  const focusOnOpen = useRef(false);

  // Apply the stored decision at app start. Without one nothing is sent.
  useEffect(() => {
    setAnalyticsConsent(readConsent() === 'granted');
  }, []);

  useEffect(() => {
    const onOpen = () => {
      focusOnOpen.current = true;
      setOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  // Reserve space so the floating buttons move above the banner instead of
  // sitting underneath it.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    const update = () => {
      const height = dialogRef.current?.offsetHeight ?? 0;
      root.style.setProperty('--cookie-banner-offset', `${height}px`);
    };
    update();
    document.body.classList.add('cookie-banner-open');
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      document.body.classList.remove('cookie-banner-open');
      root.style.removeProperty('--cookie-banner-offset');
    };
  }, [open]);

  useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      dialogRef.current?.focus();
    }
  }, [open]);

  const decide = useCallback((granted) => {
    writeConsent(granted);
    setAnalyticsConsent(granted);
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="cookie-consent"
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-text"
      tabIndex={-1}
      data-testid="cookie-consent"
    >
      <h2 id="cookie-consent-title" className="cookie-consent-title">
        Statistik &amp; Cookies
      </h2>
      <p id="cookie-consent-text" className="cookie-consent-text">
        Wir würden gern anonym messen, wie die Seite genutzt wird, um sie zu verbessern. Dafür
        verwenden wir Google Analytics, aber nur mit deiner Zustimmung. Die Seite funktioniert in
        beiden Fällen gleich. Mehr dazu in der <Link to="/datenschutz">Datenschutzerklärung</Link>.
      </p>
      <div className="cookie-consent-actions">
        <button
          type="button"
          className="cookie-consent-btn"
          onClick={() => decide(false)}
          data-testid="cookie-consent-deny"
        >
          Ablehnen
        </button>
        <button
          type="button"
          className="cookie-consent-btn"
          onClick={() => decide(true)}
          data-testid="cookie-consent-accept"
        >
          Akzeptieren
        </button>
      </div>
    </div>
  );
}
