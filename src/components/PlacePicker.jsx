import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import { buildRegionEntries, loadGeoShapes, loadPlaceIndex } from '../lib/placeData';
import { locatePosition } from '../utils/geoRegion';
import {
  DEFAULT_RADIUS_KM,
  RADIUS_OPTIONS,
  normalizeSelection,
  regionIdForEntry,
} from '../utils/placeSelection';
import LocateRegionButton from './LocateRegionButton';
import PlaceSearch from './PlaceSearch';
import './PlacePicker.css';

/**
 * "Wo bist du?": the two steps of the location based region choice. 1. a place (typed, or
 * the shared device location snapped to the nearest place of the bundled list), 2. a radius.
 * Nothing is saved until "Übernehmen"; then `onApply(selection)` gets
 * `{ label, lat, lon, radiusKm, regionId, source }`. The region (and with it the calendar
 * title) comes from the place; the events shown are all those within the radius.
 * Used by the first-visit page, `/regionen` and the pop-up of the header button.
 */
export default function PlacePicker({ onApply, applyLabel = 'Übernehmen' }) {
  const { allRegions, placeSelection } = useRegion();
  const [index, setIndex] = useState(null);
  const [draft, setDraft] = useState(() => (placeSelection ? { ...placeSelection } : null));
  const [radiusKm, setRadiusKm] = useState(placeSelection?.radiusKm ?? DEFAULT_RADIUS_KM);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPlaceIndex()
      .then((loaded) => alive && setIndex(loaded))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const regionEntries = useMemo(
    () => (index ? buildRegionEntries(index, allRegions) : []),
    [index, allRegions]
  );

  const chooseEntry = (entry) => {
    const regionId = regionIdForEntry(entry, allRegions);
    setDraft({ label: entry.name, lat: entry.lat, lon: entry.lon, regionId, source: 'search' });
  };

  // The shared position is only used here: it is snapped to a place of the list; AT / CH / LI
  // by the outlines, Germany by the nearest German place (utils/geoRegion.js locatePosition).
  const onLocate = async ({ lat, lon }) => {
    const loaded = index ?? (await loadPlaceIndex());
    let shapes = null;
    try {
      shapes = (await loadGeoShapes()).admin;
    } catch {
      // without outlines: the nearest place and its region
    }
    const located = locatePosition(lat, lon, loaded, allRegions, shapes);
    if (!located) return false;
    const { place, regionId } = located;
    setDraft({
      label: place.name,
      lat: place.lat,
      lon: place.lon,
      regionId,
      source: 'device',
    });
    return true;
  };

  const apply = () => {
    const selection = normalizeSelection({ ...draft, radiusKm });
    if (selection) onApply(selection);
  };

  const regionName = draft?.regionId ? allRegions.find((r) => r.id === draft.regionId)?.name : null;

  return (
    <div className="place-picker" data-testid="place-picker">
      <PlaceSearch index={index} regionEntries={regionEntries} onChoose={chooseEntry} />
      {failed && (
        <p className="place-picker-error" role="alert">
          Die Ortsliste konnte nicht geladen werden. Bitte versuche es später noch einmal.
        </p>
      )}
      <LocateRegionButton onLocate={onLocate} className="locate-region--start" />

      {draft && (
        <p className="place-picker-chosen" data-testid="place-picker-chosen">
          <MapPin size={16} aria-hidden="true" />
          <span>
            <strong>{draft.label}</strong>
            {regionName && <span className="place-picker-region"> · {regionName}</span>}
          </span>
        </p>
      )}

      <fieldset className="place-picker-radius" disabled={!draft}>
        <legend>Umkreis</legend>
        <div className="place-picker-radius-options" role="radiogroup">
          {RADIUS_OPTIONS.map((km) => (
            <label
              key={km}
              className={`place-picker-radius-option${km === radiusKm ? ' place-picker-radius-option--on' : ''}`}
            >
              <input
                type="radio"
                name="place-radius"
                value={km}
                checked={km === radiusKm}
                onChange={() => setRadiusKm(km)}
              />
              {km} km
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        className="place-picker-apply"
        disabled={!draft}
        onClick={apply}
        data-testid="place-picker-apply"
      >
        {applyLabel}
      </button>
    </div>
  );
}
