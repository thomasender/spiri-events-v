import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import { trackFilter } from '../lib/analyticsEvents';
import {
  ALL_REGIONS_NAME,
  ALL_REGIONS_SLUG,
  readLastRegion,
  readRegionChooserSeen,
  writeRegionChooserSeen,
} from '../utils/regionRouting';
import './RegionChooser.css';

// Only the two entry pages without a region in the address: never on a region
// address, event page or profile, so crawlers and link previews are unaffected.
const CHOOSER_PATHS = ['/', '/verzeichnis'];

/**
 * "Wo suchst du?" on the first visit. Dark launch: needs at least two active
 * regions. Shown once (close, skip or a choice all count), not modal.
 */
export default function RegionChooser() {
  const { regions, loading, setRegion } = useRegion();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [eligible] = useState(() => !readRegionChooserSeen() && !readLastRegion());
  const dialogRef = useRef(null);

  const show =
    eligible && !dismissed && !loading && regions.length >= 2 && CHOOSER_PATHS.includes(pathname);

  useEffect(() => {
    if (show) dialogRef.current?.focus();
  }, [show]);

  if (!show) return null;

  const finish = () => {
    writeRegionChooserSeen();
    setDismissed(true);
  };

  const choose = (slug) => {
    finish();
    trackFilter('region', slug);
    setRegion(slug, pathname === '/verzeichnis' ? '/verzeichnis' : '/');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      finish();
    }
  };

  return (
    <section
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="region-chooser-title"
      className="region-chooser"
      data-testid="region-chooser"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className="region-chooser-close"
        aria-label="Auswahl schließen"
        onClick={finish}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <h2 id="region-chooser-title" className="region-chooser-title">
        Wo suchst du?
      </h2>
      <p className="region-chooser-hint">Wähle deine Region. Du kannst sie jederzeit ändern.</p>
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
        <button
          type="button"
          className="region-chooser-option region-chooser-option--all"
          onClick={() => choose(ALL_REGIONS_SLUG)}
        >
          {ALL_REGIONS_NAME}
        </button>
      </div>
      <button type="button" className="region-chooser-skip" onClick={finish}>
        Später entscheiden
      </button>
    </section>
  );
}
