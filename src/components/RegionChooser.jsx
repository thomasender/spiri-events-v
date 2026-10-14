import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useRegion } from '../hooks/useRegion';
import { trackFilter } from '../lib/analyticsEvents';
import { isCombinedViewSlug } from '../utils/regions';
import {
  readLastRegion,
  readRegionChooserSeen,
  regionSlugFromPath,
  writeRegionChooserSeen,
} from '../utils/regionRouting';
import './RegionChooser.css';

// Only the two entry pages without a region in the address: never on a region
// address, event page or profile, so crawlers and link previews are unaffected.
const CHOOSER_PATHS = ['/', '/verzeichnis'];

const FOCUSABLE = 'button:not([disabled])';

/**
 * "Wo suchst du?" when we do not know yet where a visitor wants to search.
 * Dark launch: needs at least two active regions. Modal and required: no close
 * button, no Escape or backdrop dismissal. Not shown once a region is
 * remembered (localStorage), and opening a region address counts as a choice.
 * The page stays rendered behind it (only made inert while the dialog is open).
 */
export default function RegionChooser() {
  const { regions, combinedViews, loading, setRegion } = useRegion();
  const { pathname } = useLocation();
  const dialogRef = useRef(null);

  // Opening a combined view ("Ganz Österreich", ...) by address is a choice as
  // well (active regions are remembered by RegionProvider).
  const urlSlug = regionSlugFromPath(pathname);
  useEffect(() => {
    if (isCombinedViewSlug(urlSlug) && !loading && regions.length >= 2) writeRegionChooserSeen();
  }, [urlSlug, loading, regions.length]);

  const stored = readLastRegion();
  const remembered =
    readRegionChooserSeen() || Boolean(stored && regions.some((r) => r.slug === stored));
  const show = !loading && regions.length >= 2 && !remembered && CHOOSER_PATHS.includes(pathname);

  useEffect(() => {
    if (!show) return undefined;
    dialogRef.current?.focus();
    const app = document.getElementById('root');
    app?.setAttribute('inert', '');
    app?.setAttribute('aria-hidden', 'true');

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? []);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = dialogRef.current?.contains(active) && active !== dialogRef.current;
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      app?.removeAttribute('inert');
      app?.removeAttribute('aria-hidden');
    };
  }, [show]);

  if (!show) return null;

  const choose = (slug) => {
    if (isCombinedViewSlug(slug)) writeRegionChooserSeen();
    trackFilter('region', slug);
    // setRegion remembers a concrete region itself (tribe:lastRegion).
    setRegion(slug, pathname === '/verzeichnis' ? '/verzeichnis' : '/');
  };

  return createPortal(
    <div className="region-chooser-backdrop">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-chooser-title"
        className="region-chooser"
        data-testid="region-chooser"
      >
        <h2 id="region-chooser-title" className="region-chooser-title">
          Wo suchst du?
        </h2>
        <p className="region-chooser-hint">
          Wähle deine Region, damit wir dir passende Events zeigen. Du kannst sie jederzeit oben
          wechseln.
        </p>
        <div className="region-chooser-options">
          {[...regions]
            .sort((a, b) => a.order - b.order)
            .map((r) => (
              <button
                key={r.slug}
                type="button"
                className="region-chooser-option"
                onClick={() => choose(r.slug)}
              >
                {r.name}
              </button>
            ))}
          {combinedViews.map((v) => (
            <button
              key={v.slug}
              type="button"
              className="region-chooser-option region-chooser-option--all"
              onClick={() => choose(v.slug)}
            >
              {v.name}
            </button>
          ))}
        </div>
      </section>
    </div>,
    document.body
  );
}
