import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { prepareAdminShapes, prepareDistrictShapes, regionForPosition } from '../utils/geoRegion';
import './LocateRegionButton.css';

// Landkreis shapes (Germany) and Bundesland / Kanton outlines (Austria, Switzerland),
// only loaded once somebody asks for their location.
let shapesPromise = null;
function loadShapes() {
  shapesPromise ??= Promise.all([
    import('../data/landkreisMap.json'),
    import('../data/adminAtChMap.json'),
  ]).then(([districts, admin]) => ({
    districts: prepareDistrictShapes((districts.default ?? districts).districts),
    admin: prepareAdminShapes(admin.default ?? admin),
  }));
  shapesPromise.catch(() => {
    shapesPromise = null;
  });
  return shapesPromise;
}

const MESSAGES = {
  locating: 'Dein Standort wird bestimmt …',
  denied:
    'Du hast den Zugriff auf deinen Standort nicht erlaubt. Kein Problem: Bitte wähle deine Region selbst.',
  unavailable:
    'Dein Standort konnte gerade nicht bestimmt werden. Bitte wähle deine Region selbst.',
  timeout: 'Das Bestimmen deines Standorts hat zu lange gedauert. Bitte wähle deine Region selbst.',
  unsupported:
    'Dein Browser kann deinen Standort nicht bestimmen. Bitte wähle deine Region selbst.',
  noMatch: 'Wir konnten deinen Standort keiner Region zuordnen. Bitte wähle deine Region selbst.',
};

/**
 * "Meinen Standort verwenden" in the region chooser and the region pop-up (ticket 567).
 * Opt-in only: the browser is asked for the position only after the visitor read the
 * short explanation and confirmed. The position is turned into a region right here in
 * the browser (Germany: Landkreis shapes + current assignment; Austria / Switzerland:
 * Bundesland / Kanton outlines; see utils/geoRegion.js) and then
 * thrown away: it is never stored, sent or tracked. The result goes through `onChoose`,
 * exactly like a manual choice (a region that is not open yet leads to its coming-soon
 * page). Every failure only shows a hint; the manual choice stays usable.
 */
export default function LocateRegionButton({ regions, onChoose, className = '' }) {
  // idle | confirm | locating | <message key>
  const [state, setState] = useState('idle');
  const confirmRef = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (state === 'confirm') confirmRef.current?.focus();
  }, [state]);

  const finish = (next) => {
    if (mounted.current) setState(next);
  };

  const locate = () => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      setState('unsupported');
      return;
    }
    setState('locating');
    const shapes = loadShapes();
    geo.getCurrentPosition(
      (position) => {
        // Only these two numbers are used, and only inside this callback.
        const { latitude, longitude } = position.coords;
        shapes
          .then((s) => {
            const hit = regionForPosition(latitude, longitude, s.districts, regions, s.admin);
            if (!hit) {
              finish('noMatch');
              return;
            }
            finish('idle');
            onChoose(hit.region.slug);
          })
          .catch(() => finish('unavailable'));
      },
      (error) => {
        if (error?.code === 1) finish('denied');
        else if (error?.code === 3) finish('timeout');
        else finish('unavailable');
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }
    );
  };

  const message = MESSAGES[state];
  return (
    <div className={`locate-region ${className}`.trim()} data-testid="locate-region">
      {state === 'confirm' ? (
        <div className="locate-region-consent" role="group" aria-labelledby="locate-region-info">
          <p id="locate-region-info" className="locate-region-info">
            Dein Browser fragt dich gleich, ob er deinen Standort mitteilen darf. Wir verwenden ihn
            nur ein einziges Mal, um deine Region zu finden. Er wird nicht gespeichert und nicht an
            uns oder andere gesendet. Du kannst deine Region jederzeit auch selbst wählen.
          </p>
          <div className="locate-region-actions">
            <button
              ref={confirmRef}
              type="button"
              className="locate-region-button locate-region-button--primary"
              onClick={locate}
            >
              Standort abfragen
            </button>
            <button type="button" className="locate-region-button" onClick={() => setState('idle')}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="locate-region-button"
          onClick={() => setState('confirm')}
          disabled={state === 'locating'}
        >
          <LocateFixed size={18} aria-hidden="true" /> Meinen Standort verwenden
        </button>
      )}
      <p className="locate-region-status" role="status" aria-live="polite">
        {message ?? ''}
      </p>
    </div>
  );
}
