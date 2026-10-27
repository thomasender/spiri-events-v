import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, MapPin } from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import { selectionLabel } from '../utils/placeSelection';
import { regionSlugFromPath } from '../utils/regionRouting';
import RegionPickerModal from './RegionPickerModal';
import './RegionSwitcher.css';

// Text shown on the button: the remembered place and radius ("Bregenz · 25 km") while the
// calendar uses them, else the current combined view or region.
function useCurrentRegionName() {
  const {
    regions,
    allRegions,
    regionId,
    combinedView,
    placeSelection,
    radiusFilter,
    comingSoon,
    neutralHeader,
    loading,
  } = useRegion();
  const { pathname } = useLocation();
  // A coming-soon page falls back to the default region as context, so the remembered place
  // only counts when it belongs to the region named by the address (as in the footer).
  const comingSoonPlace =
    !loading &&
    comingSoon &&
    placeSelection &&
    placeSelection.regionId === regionSlugFromPath(pathname);
  const region = allRegions.find((r) => r.slug === regionId) ?? regions[0];
  return {
    name: combinedView
      ? combinedView.name
      : comingSoonPlace
        ? selectionLabel(placeSelection)
        : radiusFilter
          ? selectionLabel(placeSelection)
          : neutralHeader && !comingSoon
            ? // Neutral pages (coming soon, Impressum, ...) have no region of their own:
              // the default region must not show up as the visitor's choice.
              'Ort wählen'
            : (region?.name ?? ''),
    // Dark launch: nothing to switch between while fewer than two regions are active.
    visible: regions.length >= 2,
  };
}

/**
 * Phone: the region choice lives in the burger menu as one button that opens the
 * same pop-up as the header (the header button is hidden below 800px). Same
 * dark launch rule as the header button.
 */
export function RegionMenuList({ onNavigate }) {
  const { name, visible } = useCurrentRegionName();
  const [open, setOpen] = useState(false);
  if (!visible) return null;
  return (
    <div className="region-menu-list" data-testid="region-menu-list">
      <button
        type="button"
        className="region-menu-list-button"
        aria-haspopup="dialog"
        onClick={() => {
          onNavigate?.();
          setOpen(true);
        }}
      >
        <MapPin size={18} aria-hidden="true" />
        <span className="region-menu-list-label">Ort: {name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <RegionPickerModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/**
 * Button that opens the region pop-up from the profile page (users and
 * moderators) and from the footer (Super-Admins). Same dark launch rule as the
 * header button.
 */
export function RegionPickButton({ className = '', testId = 'region-pick-button' }) {
  const { name, visible } = useCurrentRegionName();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  if (!visible) return null;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`region-pick-button ${className}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Ort und Umkreis wählen, aktuell ${name}`}
        data-testid={testId}
        onClick={() => setOpen(true)}
      >
        <MapPin size={16} aria-hidden="true" />
        <span>{name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <RegionPickerModal open={open} onClose={close} />
    </>
  );
}

/**
 * Header button that opens the place + radius pop-up. Dark launch:
 * renders nothing while fewer than two regions are active, so Vorarlberg-only
 * visitors see no change.
 */
export default function RegionSwitcher() {
  const { name, visible } = useCurrentRegionName();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  if (!visible) return null;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="region-switcher" data-testid="region-switcher">
      <button
        ref={triggerRef}
        type="button"
        className="region-switcher-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Ort und Umkreis wählen, aktuell ${name}`}
        onClick={() => setOpen(true)}
      >
        <MapPin size={16} aria-hidden="true" />
        <span className="region-switcher-label">{name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <RegionPickerModal open={open} onClose={close} />
    </div>
  );
}
