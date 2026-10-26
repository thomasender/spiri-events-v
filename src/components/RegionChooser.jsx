import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRegion } from '../hooks/useRegion';
import { trackFilter } from '../lib/analyticsEvents';
import { COMBINED_VIEWS, isCombinedViewSlug } from '../utils/regions';
import {
  readLastRegion,
  readRegionChooserSeen,
  regionSlugFromPath,
  writeRegionChooserSeen,
} from '../utils/regionRouting';
import './RegionChooser.css';

import ModeratorApplyCard from './ModeratorApplyCard';
import PlacePicker from './PlacePicker';

// Only the two entry pages without a region in the address: never on a region
// address, event page or profile, so crawlers and link previews are unaffected.
const CHOOSER_PATHS = ['/', '/verzeichnis'];
// Opened on purpose (switcher, burger menu): always shown, and it can be closed.
export const REGIONS_PAGE_PATH = '/regionen';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled])';

/**
 * "Wo suchst du?" when we do not know yet where a visitor wants to search: a full page (not
 * a small pop-up) with the place + radius step (PlacePicker). No map: visitors type a place
 * or share their location and pick a radius; the region is worked out from the place.
 * Opened on purpose (`/regionen`) it has "Schließen" at the top and works with Escape.
 * Dark launch: needs at least two active regions. First visit: no close button, no Escape
 * dismissal. Not shown once a place or region is remembered (localStorage), and opening a
 * region address counts as a choice. The page stays rendered behind it (only made inert
 * while the chooser is open). A region that is not open yet leads to its coming-soon page.
 */
export default function RegionChooser() {
  const { regions, combinedViews, loading, setRegion, placeSelection, setPlaceSelection } =
    useRegion();
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
    readRegionChooserSeen() ||
    Boolean(placeSelection) ||
    Boolean(stored && regions.some((r) => r.slug === stored));
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
        // The search field first closes its own suggestions / clears itself.
        const t = e.target;
        if (t?.getAttribute?.('role') === 'combobox' && t.value) {
          return;
        }
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

  const subpath = pathname === '/verzeichnis' ? '/verzeichnis' : '/';

  const chooseView = (slug) => {
    writeRegionChooserSeen();
    trackFilter('region', slug);
    setRegion(slug, subpath);
  };

  const apply = (selection) => {
    setPlaceSelection(selection);
    writeRegionChooserSeen();
    if (selection.regionId) {
      trackFilter('region', selection.regionId);
      // setRegion remembers a concrete region itself (tribe:lastRegion).
      setRegion(selection.regionId, subpath);
    } else {
      navigate(subpath);
    }
  };

  // All four views are offered; the ones without enough open regions lead to "bald".
  const availableViews = new Set(combinedViews.map((v) => v.slug));

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
            Gib einen Ort oder eine Region ein oder teile deinen Standort und wähle einen Umkreis.
            Wir zeigen dir die passenden Events. Du kannst das jederzeit im Menü ändern.
          </p>
        </header>
        <div className="region-chooser-layout region-chooser-layout--map-only">
          <PlacePicker onApply={apply} applyLabel="Events anzeigen" />
        </div>
        <div className="region-chooser-lists">
          <p className="region-chooser-views-label">Oder alles auf einmal ansehen:</p>
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
                  onClick={() => chooseView(v.slug)}
                >
                  {v.name}
                  {!available && <span className="region-chooser-soon"> (bald)</span>}
                </button>
              );
            })}
          </div>
        </div>
        {!onRegionsPage && <ModeratorApplyCard className="region-chooser-apply" />}
      </section>
    </div>,
    document.body
  );
}
