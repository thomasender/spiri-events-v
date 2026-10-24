import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Map as MapIcon, X } from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import { trackFilter } from '../lib/analyticsEvents';
import { regionSwitchSubpath } from '../utils/regionRouting';
import LocateRegionButton from './LocateRegionButton';
import RegionSearch from './RegionSearch';
import './RegionPickerModal.css';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

/**
 * Pop-up to change the region (ticket 596): the "use my location" button, a
 * search field with autocomplete (regions and districts; regions that are not
 * open yet are marked "bald" and lead to their coming-soon page) and a link to
 * the map page. No region chips any more. Closes with the X, Escape or a click
 * next to it. Used by the header switcher and the burger menu.
 */
export default function RegionPickerModal({ open, onClose }) {
  const { regions, allRegions, regionId, combinedView, setRegion } = useRegion();
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
        // The search field first closes its own suggestions / clears itself.
        const t = e.target;
        if (t?.getAttribute?.('role') === 'combobox' && t.value) return;
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
  const currentSlug = combinedView ? combinedView.slug : regionId;
  const sorted = [...allRegions].sort((a, b) => a.order - b.order);

  const choose = (slug) => {
    onClose();
    if (slug === currentSlug) return;
    trackFilter('region', slug);
    setRegion(slug, regionSwitchSubpath(pathname));
  };

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
          <RegionSearch regions={sorted} activeSlugs={activeSlugs} onChoose={choose} />
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
        </div>
      </section>
    </div>,
    document.body
  );
}
