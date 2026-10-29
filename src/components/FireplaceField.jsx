import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { loadPlaceIndex } from '../lib/placeData';
import { normalizeFireplace } from '../utils/profile';
import PlaceSearch from './PlaceSearch';
import './FireplaceField.css';

/**
 * "Dein Feuerplatz": the one place where a person is most at home. Optional, picked with the
 * same place search as "Wo bist du?" (places only, no regions) and independent of the
 * directory regions. `fireplace` is `{ label, lat, lon }` or null, `visible` the switch that
 * decides whether others see the place NAME (default off). The place list is only loaded
 * once the search is shown.
 */
export default function FireplaceField({
  fireplace,
  onChange,
  visible,
  onVisibleChange,
  idPrefix,
}) {
  const [changing, setChanging] = useState(false);
  const [index, setIndex] = useState(null);
  const [failed, setFailed] = useState(false);
  const searching = !fireplace || changing;

  useEffect(() => {
    if (!searching || index) return undefined;
    let alive = true;
    loadPlaceIndex()
      .then((loaded) => alive && setIndex(loaded))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [searching, index]);

  const choose = (entry) => {
    const next = normalizeFireplace({ label: entry.name, lat: entry.lat, lon: entry.lon });
    if (!next) return;
    onChange(next);
    setChanging(false);
  };

  return (
    <div className="fireplace-field" data-testid="fireplace-field">
      <h3 className="fireplace-field-title">
        <Flame size={18} aria-hidden="true" />
        <span>Dein Feuerplatz</span>
      </h3>
      <p className="fireplace-field-hint">
        Der Ort, an dem du am meisten zuhause bist. Das ist freiwillig.
      </p>

      {fireplace && (
        <p className="fireplace-field-chosen" data-testid="fireplace-chosen">
          <strong>{fireplace.label}</strong>
          <span className="fireplace-field-actions">
            <button
              type="button"
              className="fireplace-field-link"
              onClick={() => setChanging((value) => !value)}
              data-testid="fireplace-change"
            >
              {changing ? 'Abbrechen' : 'Ändern'}
            </button>
            <button
              type="button"
              className="fireplace-field-link"
              onClick={() => {
                onChange(null);
                setChanging(false);
              }}
              data-testid="fireplace-remove"
            >
              Entfernen
            </button>
          </span>
        </p>
      )}

      {searching && (
        <>
          <PlaceSearch
            index={index}
            regionEntries={[]}
            onChoose={choose}
            label="Ort suchen"
            placeholder="z. B. Dornbirn"
          />
          {failed && (
            <p className="fireplace-field-error" role="alert">
              Die Ortsliste konnte nicht geladen werden. Bitte versuche es später noch einmal.
            </p>
          )}
        </>
      )}

      {fireplace && (
        <>
          <label className="profile-social-media-checkbox">
            <input
              id={`${idPrefix}-fireplace-visible`}
              type="checkbox"
              checked={visible}
              onChange={(e) => onVisibleChange(e.target.checked)}
              data-testid="fireplace-visible"
            />
            <span>Feuerplatz für andere sichtbar</span>
          </label>
          <p className="fireplace-field-hint">
            Wenn du das einschaltest, sehen alle auf deinem Profil und im Verzeichnis den Namen des
            Ortes, zum Beispiel „🔥 {fireplace.label}“. Genauer als der Ortsname wird nichts
            gezeigt. Ist die Option aus (Standard), sieht nur du deinen Feuerplatz.
          </p>
        </>
      )}
    </div>
  );
}
