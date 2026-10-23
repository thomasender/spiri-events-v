import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Map as MapIcon, X } from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import { trackFilter } from '../lib/analyticsEvents';
import { COMBINED_VIEWS, COUNTRIES, COUNTRY_LABELS } from '../utils/regions';
import { regionSwitchSubpath } from '../utils/regionRouting';
import LocateRegionButton from './LocateRegionButton';
import './RegionPickerModal.css';

const FOCUSABLE = 'button:not([disabled])';

/**
 * Pop-up to change the region: chips grouped by country (all regions; the ones
 * that are not open yet are marked "bald" and lead to their coming-soon page),
 * the four combined views on top and a link to the map page. Closes with the X,
 * Escape or a click next to it. Used by the header switcher and the burger menu.
 */
export default function RegionPickerModal({ open, onClose }) {
  const { regions, allRegions, regionId, combinedView, combinedViews, setRegion } = useRegion();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
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
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const activeSlugs = new Set(regions.map((r) => r.slug));
  const availableViews = new Set(combinedViews.map((v) => v.slug));
  const currentSlug = combinedView ? combinedView.slug : regionId;
  const sorted = [...allRegions].sort((a, b) => a.order - b.order);

  const choose = (slug) => {
    onClose();
    if (slug === currentSlug) return;
    trackFilter('region', slug);
    setRegion(slug, regionSwitchSubpath(pathname));
  };

  const chip = (slug, name, soon) => (
    <button
      key={slug}
      type="button"
      className={`region-chip${slug === currentSlug ? ' region-chip--current' : ''}${
        soon ? ' region-chip--soon' : ''
      }`}
      aria-pressed={slug === currentSlug}
      onClick={() => choose(slug)}
    >
      {name}
      {soon && <span className="region-chip-soon"> (bald)</span>}
    </button>
  );

  return createPortal(
    <div
      className="region-picker-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-picker-title"
        className="region-picker"
        data-testid="region-picker"
      >
        <header className="region-picker-header">
          <h2 id="region-picker-title" className="region-picker-title">
            Region wählen
          </h2>
          <button
            type="button"
            className="region-picker-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="region-picker-body">
          <LocateRegionButton
            regions={allRegions}
            onChoose={choose}
            className="locate-region--start"
          />
          <div className="region-picker-group">
            <h3 className="region-picker-group-name">Ansichten</h3>
            <div className="region-picker-chips">
              {COMBINED_VIEWS.map((v) => chip(v.slug, v.name, !availableViews.has(v.slug)))}
            </div>
          </div>
          {COUNTRIES.map((country) => {
            const inCountry = sorted.filter((r) => r.country === country);
            if (inCountry.length === 0) return null;
            return (
              <div key={country} className="region-picker-group">
                <h3 className="region-picker-group-name">{COUNTRY_LABELS[country]}</h3>
                <div className="region-picker-chips">
                  {inCountry.map((r) => chip(r.slug, r.name, !activeSlugs.has(r.slug)))}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="region-picker-footer">
          <button
            type="button"
            className="region-picker-map"
            onClick={() => {
              onClose();
              navigate('/regionen');
            }}
          >
            <MapIcon size={18} aria-hidden="true" /> Auf der Karte wählen
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
