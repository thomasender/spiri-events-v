import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createFilter } from 'react-select';
import Select from 'react-select';
import { GEMEINDEN, findGemeinde } from '../utils/gemeinden';
import { loadPlaceIndex } from '../lib/placeData';
import { placeDetail } from '../utils/placeSearch';
import {
  assignmentForEntry,
  assignmentForGemeinde,
  PLACE_PICK_ERROR,
  placeRegionHint,
  suggestEventPlaces,
  topPlaceChoice,
} from '../utils/placeDistrict';
import { bezirkLabel, getSubdivisionLabel, isLegacyBezirk } from '../utils/regions';
import './PlaceSearch.css';

const OPTIONS = GEMEINDEN.map((g) => ({ value: g.name, label: g.name, bezirk: g.bezirk }));
const gemeindeFilter = createFilter();

// The place list (lazy, offline) is loaded once the person has typed two letters.
function usePlaceIndex(typed) {
  const [index, setIndex] = useState(null);
  const wanted = useRef(false);
  useEffect(() => {
    if (typed.trim().length < 2 || index || wanted.current) return;
    wanted.current = true;
    let cancelled = false;
    loadPlaceIndex()
      .then((loaded) => {
        if (!cancelled) setIndex(loaded);
      })
      .catch(() => {
        wanted.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [typed, index]);
  return index;
}

// Ort picker shared by both event forms, styled like the Kategorie select. The place decides
// the Bezirk / Landkreis AND the region (Trello dx8dCQJc), and the Ort must be CHOSEN from the
// known places (Trello QG0GR5lv): typing only filters the suggestions; leaving the field or
// pressing Enter with typed text takes the TOP suggestion, and without any match the field
// shows "Bitte wähle einen Ort aus der Liste." (the form does not save). `onChange({ city,
// bezirk, regionId, picked })`: `picked` is true for a chosen place, false while typing;
// `regionId` = region of the place (null: place without a district).
//   - Vorarlberg (default): the Gemeinde list plus places of the place list (all regions).
//     There is no "Umgebung" any more; old events that carry the legacy "Grenznahe" keep it
//     until the Ort is changed.
//   - `free` (other regions, two or more active regions): a combobox suggesting places (that
//     region's first); the form keeps its own Bezirk / Landkreis select.
// A stored Ort that is in no list (old free text) is shown as it is and stays until the person
// edits the field (the forms grandfather it, see `validatePlaceChoice`).
// `regions` = merged register (current assignment), `placeRegionId` = region the event will
// be saved in, `homeRegionId` = region the person is in (for the hint).
export default function CityField({
  city: cityProp,
  bezirk,
  disabled,
  error,
  onChange,
  free,
  onOtherRegion,
  placeholder,
  region,
  regions = [],
  placeRegionId = '',
  homeRegionId = '',
}) {
  // Drafts saved before the Ort field existed have no city.
  const city = cityProp || '';
  // Typed text without any matching place (set on leaving the field).
  const [missing, setMissing] = useState(false);
  const emit = (value) => {
    setMissing(false);
    onChange(value);
  };
  const shownError = error || (missing ? PLACE_PICK_ERROR : null);
  const match = free ? null : findGemeinde(city);
  const regionHint = disabled ? null : placeRegionHint(placeRegionId, homeRegionId, regions);
  // Bezirk / Landkreis of a place outside the Gemeinde list (free mode: only when it came from
  // the place; the form's own select shows it otherwise).
  const showDistrict = !disabled && !match && city && bezirk && (!free || Boolean(placeRegionId));

  return (
    <div className="form-group">
      <label htmlFor="city">Ort *</label>
      {free ? (
        <PlaceInput
          city={city}
          bezirk={bezirk}
          region={region ?? null}
          regions={regions}
          placeRegionId={placeRegionId}
          disabled={disabled}
          error={shownError}
          placeholder={placeholder}
          onChange={emit}
          onMissing={() => setMissing(true)}
        />
      ) : (
        <GemeindeSelect
          city={city}
          regions={regions}
          homeRegionId={homeRegionId}
          disabled={disabled}
          error={shownError}
          onChange={emit}
          onMissing={() => setMissing(true)}
        />
      )}
      {match && !disabled && (
        <span className="field-hint" data-testid="city-bezirk-hint">
          Bezirk {match.bezirk}
        </span>
      )}
      {showDistrict && (
        <span className="field-hint" data-testid="city-district-hint">
          {isLegacyBezirk(bezirk)
            ? bezirkLabel(bezirk)
            : `${getSubdivisionLabel(placeRegionId || homeRegionId, regions)} ${bezirk}`}
        </span>
      )}
      {regionHint && (
        <span className="field-hint" data-testid="city-region-hint">
          {regionHint}
        </span>
      )}
      {onOtherRegion && !disabled && (
        <button type="button" className="link-button" onClick={onOtherRegion}>
          Der Ort liegt in einer anderen Region
        </button>
      )}
      {shownError && <span className="error-text">{shownError}</span>}
    </div>
  );
}

// Vorarlberg: Gemeinde list first, then places of the place list (all regions) while typing.
// Typed text is only a filter: leaving the field takes the top option (Enter picks the focused,
// i.e. the top, option as usual); nothing matching reports "Bitte wähle einen Ort aus der Liste.".
function GemeindeSelect({ city, regions, homeRegionId, disabled, error, onChange, onMissing }) {
  const [input, setInput] = useState('');
  const index = usePlaceIndex(input);
  const homeRegion = regions.find((r) => r.id === homeRegionId) ?? null;

  const placeOptions = useMemo(() => {
    if (!index || input.trim().length < 2) return [];
    return suggestEventPlaces(index, homeRegion, input, {
      // The Gemeinden are listed already.
      skip: (entry) => entry.stateSlug === 'vorarlberg' && Boolean(findGemeinde(entry.name)),
    }).map((entry) => ({
      value: `place:${entry.name}|${entry.lat}|${entry.lon}`,
      label: entry.name,
      entry,
      detail: placeDetail(entry),
    }));
  }, [index, homeRegion, input]);

  const handlePick = (option) => {
    if (!option) {
      onChange({ city: '', bezirk: '', regionId: null, picked: false });
      return;
    }
    if (option.entry) {
      const found = assignmentForEntry(option.entry, regions);
      onChange({
        city: option.entry.name,
        bezirk: found?.bezirk ?? '',
        regionId: found?.regionId ?? null,
        picked: true,
      });
      return;
    }
    const gemeinde = findGemeinde(option.value);
    if (gemeinde) {
      onChange({
        city: gemeinde.name,
        bezirk: gemeinde.bezirk,
        regionId: assignmentForGemeinde(gemeinde, regions).regionId,
        picked: true,
      });
    }
  };

  // Left the field with typed text: the top option of the list shown so far becomes the Ort.
  const takeTopOnBlur = () => {
    const text = input.trim();
    if (text.length === 0) return;
    const gemeinden = OPTIONS.filter((o) =>
      gemeindeFilter({ label: o.label, value: o.value, data: o }, text)
    );
    const top = [...gemeinden, ...placeOptions][0];
    if (top) handlePick(top);
    else onMissing();
  };

  return (
    <Select
      inputId="city"
      options={[...OPTIONS, ...placeOptions]}
      value={city ? { value: city, label: city } : null}
      onChange={handlePick}
      onInputChange={(value, { action }) => {
        if (action === 'input-change') setInput(value);
        else if (action === 'input-blur') {
          takeTopOnBlur();
          setInput('');
        } else if (action === 'set-value' || action === 'menu-close') {
          setInput('');
        }
      }}
      // Places are searched already; only the Gemeinden go through react-select's filter.
      filterOption={(option, text) => (option.data.entry ? true : gemeindeFilter(option, text))}
      isDisabled={disabled}
      isClearable
      noOptionsMessage={() => 'Keinen Ort gefunden'}
      placeholder="Ort auswählen, z.B. Altach"
      className={`city-select${error ? ' city-select--error' : ''}`}
      classNamePrefix="kategorie"
      formatOptionLabel={(option) => (
        <span>
          {option.label}
          {option.bezirk && <span className="city-option-bezirk"> · Bez. {option.bezirk}</span>}
          {option.detail && <span className="city-option-bezirk"> · {option.detail}</span>}
        </span>
      )}
    />
  );
}

// Ort combobox with suggestions (WAI-ARIA combobox, like PlaceSearch). The place list is loaded
// on the first typed letters only. Typed text must become a picked place: leaving the field or
// Enter takes the top suggestion.
function PlaceInput({
  city,
  bezirk,
  region,
  regions,
  placeRegionId,
  disabled,
  error,
  placeholder,
  onChange,
  onMissing,
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = city.trim();
  const index = usePlaceIndex(typed);
  // The Ort the person last picked here, and whether she has edited the field at all (a stored
  // old Ort that was not touched is left alone on blur).
  const pickedName = useRef(null);
  const edited = useRef(false);

  const suggestions = useMemo(
    () => (typed.length >= 2 ? suggestEventPlaces(index, region, typed) : []),
    [index, region, typed]
  );
  const results = open ? suggestions : [];

  // A Bezirk that came from an earlier place belongs to that place only.
  const keptBezirk = placeRegionId ? '' : bezirk;

  const pick = (entry) => {
    const found = assignmentForEntry(entry, regions);
    setOpen(false);
    setActive(-1);
    pickedName.current = entry.name;
    onChange({
      city: entry.name,
      bezirk: found?.bezirk ?? keptBezirk,
      regionId: found?.regionId ?? null,
      picked: true,
    });
  };

  const needsPick = () => edited.current && typed.length > 0 && typed !== pickedName.current;

  // Left the field with typed text: the top suggestion becomes the Ort (the place list is
  // loaded first when it is not yet there); none: "Bitte wähle einen Ort aus der Liste.".
  const handleBlur = async () => {
    setOpen(false);
    if (!needsPick()) return;
    let loaded = index;
    if (!loaded) {
      try {
        loaded = await loadPlaceIndex();
      } catch {
        loaded = null;
      }
    }
    const top = loaded ? suggestEventPlaces(loaded, region, typed, { limit: 1 })[0] : null;
    if (top) pick(top);
    else onMissing();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (!needsPick() && results.length === 0) return;
      const choice = results.length > 0 ? results[active >= 0 ? active : 0] : suggestions[0];
      if (!choice) return;
      e.preventDefault();
      pick(choice);
    } else if (e.key === 'Escape' && results.length > 0) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="city-combobox">
      <input
        id="city"
        name="city"
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        value={city}
        onChange={(e) => {
          edited.current = true;
          setOpen(true);
          setActive(-1);
          onChange({ city: e.target.value, bezirk: keptBezirk, regionId: null, picked: false });
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder || 'z.B. Lindau'}
        disabled={disabled}
        className={error ? 'input-error' : ''}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Passende Orte"
        className="place-search-list"
        hidden={results.length === 0}
      >
        {results.map((entry, i) => (
          <li
            key={`${entry.name}-${entry.lat}-${entry.lon}`}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === active}
            className={`place-search-option${i === active ? ' place-search-option--active' : ''}`}
            // mousedown keeps the focus in the input until the choice is made.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(entry)}
            data-testid="city-place-option"
          >
            <span className="place-search-option-label">{entry.name}</span>
            <span className="place-search-option-detail">{placeDetail(entry)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
