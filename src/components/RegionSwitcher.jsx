import { useRef, useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import RegionPickerModal from './RegionPickerModal';
import './RegionSwitcher.css';

// Name shown on the button: the current combined view or region.
function useCurrentRegionName() {
  const { regions, allRegions, regionId, combinedView } = useRegion();
  const region = allRegions.find((r) => r.slug === regionId) ?? regions[0];
  return {
    name: combinedView ? combinedView.name : (region?.name ?? ''),
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
        <span className="region-menu-list-label">Region: {name}</span>
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
        aria-label={`Region wählen, aktuell ${name}`}
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
 * Header button that opens the region pop-up (chips by country). Dark launch:
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
        aria-label={`Region wählen, aktuell ${name}`}
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
