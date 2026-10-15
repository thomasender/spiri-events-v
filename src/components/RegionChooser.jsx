import { Suspense, lazy, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRegion } from '../hooks/useRegion';
import { trackFilter } from '../lib/analyticsEvents';
import { COMBINED_VIEWS, COUNTRY_LABELS, COUNTRIES, isCombinedViewSlug } from '../utils/regions';
import {
  readLastRegion,
  readRegionChooserSeen,
  regionSlugFromPath,
  writeRegionChooserSeen,
} from '../utils/regionRouting';
import './RegionChooser.css';

// The map data is only needed by first-time visitors.
const RegionMap = lazy(() => import('./RegionMap'));

// Only the two entry pages without a region in the address: never on a region
// address, event page or profile, so crawlers and link previews are unaffected.
const CHOOSER_PATHS = ['/', '/verzeichnis'];
// Opened on purpose (switcher, burger menu): always shown, and it can be closed.
export const REGIONS_PAGE_PATH = '/regionen';

const FOCUSABLE = 'button:not([disabled])';

/**
 * "Wo suchst du?" when we do not know yet where a visitor wants to search: a
 * full page (not a small pop-up) with a silent map of Germany, Austria and
 * Switzerland plus the same choice as a list (the accessible equivalent).
 * Dark launch: needs at least two active regions. Required: no close button, no
 * Escape dismissal. Not shown once a region is remembered (localStorage), and
 * opening a region address counts as a choice. The page stays rendered behind it
 * (only made inert while the chooser is open). A region that is not open yet
 * leads to its coming-soon page.
 */
export default function RegionChooser() {
  const { regions, allRegions, combinedViews, loading, setRegion } = useRegion();
  const { pathname, key } = useLocation();
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const onRegionsPage = pathname === REGIONS_PAGE_PATH;

  // Opening a combined view ("Ganz Österreich", ...) by address is a choice as
  // well (active regions are remembered by RegionProvider).
  const urlSlug = regionSlugFromPath(pathname);
  useEffect(() => {
    if (isCombinedViewSlug(urlSlug) && !loading && regions.length >= 2) writeRegionChooserSeen();
  }, [urlSlug, loading, regions.length]);

  const stored = readLastRegion();
  const remembered =
    readRegionChooserSeen() || Boolean(stored && regions.some((r) => r.slug === stored));
  const show =
    !loading &&
    regions.length >= 2 &&
    (onRegionsPage || (!remembered && CHOOSER_PATHS.includes(pathname)));
  // Only the on-purpose page can be left without choosing.
  const close = () => navigate(key !== 'default' ? -1 : '/');

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
        if (onRegionsPage) close();
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
    // `close` only depends on navigate and the location key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, onRegionsPage, key]);

  if (!show) return null;

  const choose = (slug) => {
    if (isCombinedViewSlug(slug)) writeRegionChooserSeen();
    trackFilter('region', slug);
    // setRegion remembers a concrete region itself (tribe:lastRegion).
    setRegion(slug, pathname === '/verzeichnis' ? '/verzeichnis' : '/');
  };

  const activeSlugs = new Set(regions.map((r) => r.slug));
  // All four views are offered; the ones without enough open regions lead to "bald".
  const availableViews = new Set(combinedViews.map((v) => v.slug));
  const sorted = [...allRegions].sort((a, b) => a.order - b.order);

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
        <header className="region-chooser-header">
          {onRegionsPage && (
            <button
              type="button"
              className="region-chooser-close"
              onClick={close}
              data-testid="region-chooser-close"
            >
              <X size={18} aria-hidden="true" /> Schließen
            </button>
          )}
          <h2 id="region-chooser-title" className="region-chooser-title">
            Wo suchst du?
          </h2>
          <p className="region-chooser-hint">
            Wähle deine Region, damit wir dir passende Events zeigen. Du kannst sie jederzeit im
            Menü wechseln.
          </p>
        </header>
        <div className="region-chooser-layout">
          <Suspense fallback={null}>
            <RegionMap regions={sorted} activeSlugs={activeSlugs} onChoose={choose} />
          </Suspense>
          <div className="region-chooser-lists">
            <div className="region-chooser-options region-chooser-options--views">
              {COMBINED_VIEWS.map((v) => {
                const available = availableViews.has(v.slug);
                return (
                  <button
                    key={v.slug}
                    type="button"
                    className={`region-chooser-option region-chooser-option--all${
                      available ? '' : ' region-chooser-option--soon'
                    }`}
                    onClick={() => choose(v.slug)}
                  >
                    {v.name}
                    {!available && <span className="region-chooser-soon"> (bald)</span>}
                  </button>
                );
              })}
            </div>
            {COUNTRIES.map((country) => {
              const inCountry = sorted.filter((r) => r.country === country);
              if (inCountry.length === 0) return null;
              return (
                <div key={country} className="region-chooser-country">
                  <h3 className="region-chooser-country-name">{COUNTRY_LABELS[country]}</h3>
                  <div className="region-chooser-options">
                    {inCountry.map((r) => (
                      <button
                        key={r.slug}
                        type="button"
                        className={`region-chooser-option${
                          activeSlugs.has(r.slug) ? '' : ' region-chooser-option--soon'
                        }`}
                        onClick={() => choose(r.slug)}
                      >
                        {r.name}
                        {!activeSlugs.has(r.slug) && (
                          <span className="region-chooser-soon"> (bald)</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
