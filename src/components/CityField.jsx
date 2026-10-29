import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createFilter } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { GEMEINDEN, findGemeinde } from '../utils/gemeinden';
import { loadPlaceIndex } from '../lib/placeData';
import { placeDetail } from '../utils/placeSearch';
import {
  assignmentForEntry,
  assignmentForGemeinde,
  placeAssignment,
  placeRegionHint,
  suggestEventPlaces,
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
// the Bezirk / Landkreis AND the region (Trello dx8dCQJc): `onChange({ city, bezirk, regionId })`
// with `regionId` = region of the place (null: unknown / ambiguous / typed free text; the event
// then stays in the current region, with an empty Bezirk for unknown places).
//   - Vorarlberg (default): the Gemeinde list plus places of the place list (all regions);
//     anything else is taken over as typed. There is no "Umgebung" any more; old events that
//     carry the legacy "Grenznahe" keep it until the Ort is changed.
//   - `free` (other regions, two or more active regions): a plain text field, with `region`
//     a combobox suggesting places (that region's first); the form keeps its own Bezirk /
//     Landkreis select.
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
  const match = free ? null : findGemeinde(city);
  const regionHint = disabled ? null : placeRegionHint(placeRegionId, homeRegionId, regions);
  // Bezirk / Landkreis of a place outside the Gemeinde list (free mode: only when it came from
  // the place; the form's own select shows it otherwise).
  const showDistrict = !disabled && !match && city && bezirk && (!free || Boolean(placeRegionId));

  return (
    <div className="form-group">
      <label htmlFor="city">Ort *</label>
      {free && region ? (
        <PlaceInput
          city={city}
          bezirk={bezirk}
          region={region}
          regions={regions}
          placeRegionId={placeRegionId}
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
          onChange={(e) => onChange({ city: e.target.value, bezirk, regionId: null })}
          placeholder={placeholder || 'z.B. Lindau'}
          disabled={disabled}
          className={error ? 'input-error' : ''}
        />
      ) : (
        <GemeindeSelect
          city={city}
          regions={regions}
          homeRegionId={homeRegionId}
          disabled={disabled}
          error={error}
          onChange={onChange}
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
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

// Vorarlberg: Gemeinde list first, then places of the place list (all regions) while typing;
// any other text is taken over as typed.
function GemeindeSelect({ city, regions, homeRegionId, disabled, error, onChange }) {
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
      onChange({ city: '', bezirk: '', regionId: null });
      return;
    }
    if (option.entry) {
      const found = assignmentForEntry(option.entry, regions);
      onChange({
        city: option.entry.name,
        bezirk: found?.bezirk ?? '',
        regionId: found?.regionId ?? null,
      });
      return;
    }
    const gemeinde = findGemeinde(option.value);
    if (gemeinde) {
      onChange({
        city: gemeinde.name,
        bezirk: gemeinde.bezirk,
        regionId: assignmentForGemeinde(gemeinde, regions).regionId,
      });
      return;
    }
    // Typed text: a unique place of that name decides; otherwise no Bezirk, current region.
    const typed = option.value.trim();
    const found = placeAssignment(index, regions, typed);
    onChange({ city: typed, bezirk: found?.bezirk ?? '', regionId: found?.regionId ?? null });
  };

  return (
    <CreatableSelect
      inputId="city"
      options={[...OPTIONS, ...placeOptions]}
      value={city ? { value: city, label: city } : null}
      onChange={handlePick}
      onInputChange={(value, { action }) => {
        if (action === 'input-change') setInput(value);
        else if (action === 'set-value' || action === 'input-blur' || action === 'menu-close') {
          setInput('');
        }
      }}
      // Places are searched already; only the Gemeinden go through react-select's filter.
      filterOption={(option, text) => (option.data.entry ? true : gemeindeFilter(option, text))}
      isDisabled={disabled}
      isClearable
      isValidNewOption={(text) => text.trim().length >= 2 && !findGemeinde(text)}
      formatCreateLabel={(text) => `"${text.trim()}" übernehmen`}
      noOptionsMessage={() => 'Keine Gemeinde gefunden'}
      placeholder="Gemeinde auswählen, z.B. Altach"
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

// Free Ort field with suggestions (WAI-ARIA combobox, like PlaceSearch). The place list is
// loaded on the first typed letters only. Unknown places stay as typed.
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
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = city.trim();
  const index = usePlaceIndex(typed);

  const results = useMemo(
    () => (open && typed.length >= 2 ? suggestEventPlaces(index, region, typed) : []),
    [index, region, typed, open]
  );

  // A Bezirk that came from an earlier place belongs to that place only.
  const keptBezirk = placeRegionId ? '' : bezirk;

  const pick = (entry) => {
    const found = assignmentForEntry(entry, regions);
    setOpen(false);
    setActive(-1);
    onChange({
      city: entry.name,
      bezirk: found?.bezirk ?? keptBezirk,
      regionId: found?.regionId ?? null,
    });
  };

  // Typed in full without picking: a unique place of that name sets Bezirk and region, unless
  // the person chose the Bezirk / Landkreis in the select herself.
  const handleBlur = () => {
    setOpen(false);
    if (!index || typed.length < 2 || (bezirk && !placeRegionId)) return;
    const found = placeAssignment(index, regions, typed);
    if (found) onChange({ city, bezirk: found.bezirk, regionId: found.regionId });
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
          setOpen(true);
          setActive(-1);
          onChange({ city: e.target.value, bezirk: keptBezirk, regionId: null });
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
