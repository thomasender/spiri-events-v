import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useChristmasPage } from '../hooks/useChristmasPage';
import { CHRISTMAS_PATH } from '../lib/christmasPage';
import { readConsent } from '../lib/analyticsConsent';
import { isExcludedPath } from '../lib/donationPopup';
import { isWinterSeason } from './WinterTheme';
import './ChristmasFlyerPopup.css';

const SEEN_KEY = 'xmas-flyer-popup-seen';
const SHOW_DELAY_MS = 2500;
const PREVIEW_PARAM = 'weihnachtspopup';

function hasSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* Speicher gesperrt: dann eben ohne Merken */
  }
}

// Zeigt jedem Besucher einmal den Flyer der Tribe-Weihnachtsfeier. Kommt erst nach
// der Cookie-Entscheidung, nur solange die Seite veröffentlicht ist und ein Flyer
// hochgeladen wurde. `?weihnachtspopup=1` zeigt ihn zur Vorschau immer wieder.
export default function ChristmasFlyerPopup() {
  const { pathname, search } = useLocation();
  const { published, content } = useChristmasPage();
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(false);
  const closeButtonRef = useRef(null);

  const preview = new URLSearchParams(search).get(PREVIEW_PARAM) === '1';
  const flyerUrl = content?.flyerUrl;
  const eligible =
    published &&
    Boolean(flyerUrl) &&
    pathname !== CHRISTMAS_PATH &&
    !isExcludedPath(pathname) &&
    isWinterSeason(new Date(), search);

  useEffect(() => {
    if (open || closed || !eligible) return undefined;
    if (preview) {
      setOpen(true);
      return undefined;
    }
    if (hasSeen()) return undefined;
    // Erst nach der Cookie-Entscheidung, damit sich nichts überlagert.
    if (readConsent() === null) return undefined;
    const timer = window.setTimeout(() => {
      markSeen();
      setOpen(true);
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, open, closed, preview, pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    closeButtonRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setClosed(true);
      }
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
    setClosed(true);
  };

  return (
    <div
      className="xmas-popup-overlay"
      role="presentation"
      onClick={close}
      data-testid="xmas-popup-overlay"
    >
      <div
        className="xmas-popup"
        role="dialog"
        aria-modal="true"
        aria-label={content.title}
        onClick={(event) => event.stopPropagation()}
        data-testid="xmas-popup"
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="xmas-popup-close"
          aria-label="Schließen"
          onClick={close}
          data-testid="xmas-popup-close"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <img className="xmas-popup-flyer" src={flyerUrl} alt={`Flyer: ${content.title}`} />
        <div className="xmas-popup-actions">
          <Link
            to={CHRISTMAS_PATH}
            className="btn btn-primary xmas-popup-cta"
            onClick={close}
            data-testid="xmas-popup-cta"
          >
            Jetzt anmelden
          </Link>
          <button type="button" className="xmas-popup-later" onClick={close}>
            Vielleicht später
          </button>
        </div>
      </div>
    </div>
  );
}
