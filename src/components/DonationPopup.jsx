import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Heart, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { EVENTS, trackEvent } from '../lib/analytics';
import { readConsent } from '../lib/analyticsConsent';
import {
  DONATION_POPUP_DELAY_MS,
  DONATION_POPUP_ENABLED,
  isAccountOldEnough,
  isDueThisWeek,
  isExcludedPath,
  hasClickedDonate,
  isPreviewRequested,
  markDonateClicked,
  markShown,
  readLastShown,
} from '../lib/donationPopup';
import './DonationPopup.css';

// Friendly donation request, shown at most once a week per browser until the
// visitor clicks "Jetzt unterstützen". Admins preview it with ?spendenpopup=1.
export default function DonationPopup() {
  const { pathname, search } = useLocation();
  const { user, role, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [previewClosed, setPreviewClosed] = useState(false);
  const closeButtonRef = useRef(null);

  const isAdmin = Boolean(role);
  const preview = isAdmin && isPreviewRequested(search);
  const excluded = isExcludedPath(pathname);
  const creationTime = user?.metadata?.creationTime;

  useEffect(() => {
    if (loading || open) return undefined;
    if (preview) {
      if (!previewClosed) setOpen(true);
      return undefined;
    }
    // Wait until the cookie banner is out of the way, never bother admins.
    if (!DONATION_POPUP_ENABLED || isAdmin || excluded) return undefined;
    if (hasClickedDonate()) return undefined;
    // Brand-new accounts get a week of peace before the first ask.
    if (!isAccountOldEnough(creationTime)) return undefined;
    if (readConsent() === null || !isDueThisWeek(readLastShown())) return undefined;
    const timer = window.setTimeout(() => {
      markShown();
      setOpen(true);
    }, DONATION_POPUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [loading, open, preview, previewClosed, isAdmin, excluded, pathname, creationTime]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    closeButtonRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setPreviewClosed(true);
  };

  return (
    <div
      className="donation-popup-overlay"
      role="presentation"
      onClick={close}
      data-testid="donation-popup-overlay"
    >
      <div
        className="donation-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="donation-popup-title"
        aria-describedby="donation-popup-text"
        onClick={(event) => event.stopPropagation()}
        data-testid="donation-popup"
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="donation-popup-close"
          aria-label="Schließen"
          onClick={close}
          data-testid="donation-popup-close"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="donation-popup-icon" aria-hidden="true">
          <Heart size={28} />
        </div>
        <h2 id="donation-popup-title" className="donation-popup-title">
          Hilf mit, dass Tribe Vorarlberg online bleibt
        </h2>
        <p id="donation-popup-text" className="donation-popup-text">
          tribe Vorarlberg wird ehrenamtlich betrieben und lebt allein von Spenden. Mit deinem
          Beitrag — ob klein oder groß — hältst du den Kalender kostenlos und werbefrei für alle.
          Danke, dass du dabei bist!
        </p>
        <div className="donation-popup-actions">
          <Link
            to="/ueber-uns#spenden"
            className="btn btn-primary donation-popup-donate"
            onClick={() => {
              trackEvent(EVENTS.DONATE_CLICK, { placement: 'popup' });
              if (!preview) markDonateClicked();
              close();
            }}
            data-testid="donation-popup-donate"
          >
            Jetzt unterstützen
          </Link>
          <button
            type="button"
            className="donation-popup-later"
            onClick={close}
            data-testid="donation-popup-later"
          >
            Vielleicht später
          </button>
        </div>
      </div>
    </div>
  );
}
