import { useEffect, useId, useMemo, useRef, useState } from 'react';
import CreatableSelect from 'react-select/creatable';
import { GEMEINDEN, OUTSIDE_BEZIRK, findGemeinde } from '../utils/gemeinden';
import { loadPlaceIndex } from '../lib/placeData';
import { placeDetail } from '../utils/placeSearch';
import { districtForCity, districtForPick, suggestRegionPlaces } from '../utils/placeDistrict';
import './PlaceSearch.css';

const OPTIONS = GEMEINDEN.map((g) => ({ value: g.name, label: g.name, bezirk: g.bezirk }));

// Ort (Gemeinde) picker shared by both event forms, styled like the Kategorie
// select. The Bezirk is derived from the picked Gemeinde; a place outside
// Vorarlberg is created from the typed text and stored as "Umgebung". Other
// regions have no Gemeinde list: `free` shows a plain text field and the form
// keeps its own Bezirk / Landkreis select (`bezirk` is passed through then). With a `region`
// the free field suggests the places of that region (lazy-loaded offline list) and picking one
// also sets the Bezirk / Landkreis when it is unambiguous; free typing stays possible.
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
  subdivisionLabel,
}) {
  // Drafts saved before the Ort field existed have no city.
  const city = cityProp || '';
  const match = free ? null : findGemeinde(city);

  const handlePick = (option) => {
    if (!option) {
      onChange({ city: '', bezirk: '' });
      return;
    }
    const found = findGemeinde(option.value);
    onChange(
      found
        ? { city: found.name, bezirk: found.bezirk }
        : { city: option.value.trim(), bezirk: OUTSIDE_BEZIRK }
    );
  };

  return (
    <div className="form-group">
      <label htmlFor="city">Ort *</label>
      {free && region ? (
        <PlaceInput
          city={city}
          bezirk={bezirk}
          region={region}
          subdivisionLabel={subdivisionLabel}
          disabled={disabled}
          error={error}
          placeholder={placeholder}
          onChange={onChange}
        />
      ) : free ? (
        <input
          id="city"
          name="city"
          type="text"
          autoComplete="off"
          value={city}
          onChange={(e) => onChange({ city: e.target.value, bezirk })}
          placeholder={placeholder || 'z.B. Lindau'}
          disabled={disabled}
          className={error ? 'input-error' : ''}
        />
      ) : (
        <CreatableSelect
          inputId="city"
          options={OPTIONS}
          value={city ? { value: city, label: city } : null}
          onChange={handlePick}
          isDisabled={disabled}
          isClearable
          isValidNewOption={(input) => input.trim().length >= 2 && !findGemeinde(input)}
          formatCreateLabel={(input) => `"${input.trim()}" (außerhalb von Vorarlberg, Umgebung)`}
          noOptionsMessage={() => 'Keine Gemeinde gefunden'}
          placeholder="Gemeinde auswählen, z.B. Altach"
          className={`city-select${error ? ' city-select--error' : ''}`}
          classNamePrefix="kategorie"
          formatOptionLabel={(option) => (
            <span>
              {option.label}
              {option.bezirk && <span className="city-option-bezirk"> · Bez. {option.bezirk}</span>}
            </span>
          )}
        />
      )}
      {match && !disabled && (
        <span className="field-hint" data-testid="city-bezirk-hint">
          Bezirk {match.bezirk}
        </span>
      )}
      {!free && city && !match && !disabled && (
        <span className="field-hint">Außerhalb von Vorarlberg (Umgebung)</span>
      )}
      {onOtherRegion && !disabled && (
        <button type="button" className="link-button" onClick={onOtherRegion}>
          Der Ort liegt in einer anderen Region
        </button>
      )}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

// Free Ort field with suggestions (WAI-ARIA combobox, like PlaceSearch). The place list is
// loaded on the first typed letters only. Unknown places stay as typed.
function PlaceInput({
  city,
  bezirk,
  region,
  subdivisionLabel,
  disabled,
  error,
  placeholder,
  onChange,
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [index, setIndex] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [found, setFound] = useState(null); // { city, bezirk } set from the place list
  const wanted = useRef(false);
  const label = subdivisionLabel || 'Bezirk';

  const typed = city.trim();
  useEffect(() => {
    if (typed.length < 2 || index || wanted.current) return;
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

  const results = useMemo(
    () => (open && typed.length >= 2 ? suggestRegionPlaces(index, region, typed) : []),
    [index, region, typed, open]
  );

  const pick = (entry) => {
    const district = districtForPick(index, region, entry);
    setOpen(false);
    setActive(-1);
    setFound(district ? { city: entry.name, bezirk: district } : null);
    onChange({ city: entry.name, bezirk: district ?? bezirk });
  };

  // Typed in full without picking: fill an empty Bezirk when the name is unambiguous.
  const handleBlur = () => {
    setOpen(false);
    if (!index || bezirk || typed.length < 2) return;
    const district = districtForCity(index, region, typed);
    if (district) {
      setFound({ city, bezirk: district });
      onChange({ city, bezirk: district });
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (results.length === 0) return;
      e.preventDefault();
      pick(results[active >= 0 ? active : 0]);
    } else if (e.key === 'Escape' && results.length > 0) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const shown = found && found.city === city && found.bezirk === bezirk && !disabled;
  return (
    <>
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
            setOpen(true);
            setActive(-1);
            onChange({ city: e.target.value, bezirk });
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
      {shown && (
        <span className="field-hint" data-testid="city-district-hint">
          {label} {found.bezirk}
        </span>
      )}
    </>
  );
}
