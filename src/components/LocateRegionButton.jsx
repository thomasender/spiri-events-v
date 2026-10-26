import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import './LocateRegionButton.css';

const MESSAGES = {
  locating: 'Dein Standort wird bestimmt …',
  denied:
    'Du hast den Zugriff auf deinen Standort nicht erlaubt. Kein Problem: Bitte gib deinen Ort selbst ein.',
  unavailable:
    'Dein Standort konnte gerade nicht bestimmt werden. Bitte gib deinen Ort selbst ein.',
  timeout: 'Das Bestimmen deines Standorts hat zu lange gedauert. Bitte gib deinen Ort selbst ein.',
  unsupported:
    'Dein Browser kann deinen Standort nicht bestimmen. Bitte gib deinen Ort selbst ein.',
  noMatch: 'Wir konnten deinen Standort keinem Ort zuordnen. Bitte gib deinen Ort selbst ein.',
};

/**
 * "Meinen Standort verwenden" in "Wo bist du?" (ticket 567, reworked for place + radius).
 * Opt-in only: the browser is asked for the position only after the visitor read the
 * short explanation and confirmed. The position goes to `onLocate({ lat, lon })`, which
 * snaps it to the nearest place of the bundled list (nothing is sent anywhere) and resolves
 * `true` when it found one. Only that place is remembered, never the exact position. Every
 * failure only shows a hint; typing a place stays usable.
 */
export default function LocateRegionButton({ onLocate, className = '' }) {
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
    geo.getCurrentPosition(
      (position) => {
        // Only these two numbers are used, and only inside this callback.
        const { latitude, longitude } = position.coords;
        Promise.resolve(onLocate({ lat: latitude, lon: longitude }))
          .then((found) => finish(found ? 'idle' : 'noMatch'))
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
            nur ein einziges Mal, um den nächsten Ort zu finden. Dein genauer Standort wird nicht
            gespeichert und nicht an uns oder andere gesendet, nur der Ortsname. Du kannst deinen
            Ort jederzeit auch selbst eingeben.
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
