import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import { trackFilter } from '../lib/analyticsEvents';
import { regionSwitchSubpath } from '../utils/regionRouting';
import PlacePicker from './PlacePicker';
import './RegionPickerModal.css';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

/**
 * Pop-up to change "Wo bist du?": place (typed or shared location) and radius, see
 * PlacePicker. The region follows from the place; a region that is not open yet leads to
 * its coming-soon page. Closes with the X, Escape or a click next to it. Used by the header
 * switcher, the burger menu, the profile and the footer.
 */
export default function RegionPickerModal({ open, onClose }) {
  const { regionId, combinedView, setRegion, setPlaceSelection } = useRegion();
  const { pathname } = useLocation();
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

  const currentSlug = combinedView ? combinedView.slug : regionId;

  const apply = (selection) => {
    setPlaceSelection(selection);
    onClose();
    if (!selection.regionId) return;
    trackFilter('region', selection.regionId);
    if (selection.regionId !== currentSlug) {
      setRegion(selection.regionId, regionSwitchSubpath(pathname));
    }
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
            Wo bist du?
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
          <PlacePicker onApply={apply} />
        </div>
      </section>
    </div>,
    document.body
  );
}
