import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, MapPin } from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import { trackFilter } from '../lib/analyticsEvents';
import { ALL_REGIONS_NAME, ALL_REGIONS_SLUG, regionSwitchSubpath } from '../utils/regionRouting';
import './RegionSwitcher.css';

/**
 * Header dropdown to change the region. Dark launch: renders nothing while
 * fewer than two regions are active, so Vorarlberg-only visitors see no change.
 */
export default function RegionSwitcher() {
  const { regions, regionId, isNational, setRegion } = useRegion();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);

  const entries = [
    ...[...regions].sort((a, b) => a.order - b.order).map((r) => ({ slug: r.slug, name: r.name })),
    { slug: ALL_REGIONS_SLUG, name: ALL_REGIONS_NAME },
  ];
  const currentSlug = isNational ? ALL_REGIONS_SLUG : regionId;
  const current = entries.find((e) => e.slug === currentSlug) ?? entries[0];
  const visible = regions.length >= 2;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(
      0,
      entries.findIndex((e) => e.slug === currentSlug)
    );
    itemRefs.current[idx]?.focus();
    // Only when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!visible) return null;

  const close = (refocus) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (slug) => {
    close(true);
    if (slug === currentSlug) return;
    trackFilter('region', slug);
    setRegion(slug, regionSwitchSubpath(pathname));
  };

  const onMenuKeyDown = (e) => {
    const items = itemRefs.current.filter(Boolean);
    const i = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    } else if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      items[next]?.focus();
    }
  };

  const onTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="region-switcher" ref={rootRef} data-testid="region-switcher">
      <button
        ref={triggerRef}
        type="button"
        className="region-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'region-switcher-menu' : undefined}
        aria-label={`Region wählen, aktuell ${current.name}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <MapPin size={16} aria-hidden="true" />
        <span className="region-switcher-label">{current.name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id="region-switcher-menu"
          className="region-switcher-menu"
          role="menu"
          aria-label="Region wählen"
          onKeyDown={onMenuKeyDown}
        >
          {entries.map((entry, i) => (
            <button
              key={entry.slug}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={entry.slug === currentSlug}
              className={`region-switcher-item${
                entry.slug === currentSlug ? ' region-switcher-item--active' : ''
              }${entry.slug === ALL_REGIONS_SLUG ? ' region-switcher-item--all' : ''}`}
              onClick={() => choose(entry.slug)}
            >
              {entry.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
