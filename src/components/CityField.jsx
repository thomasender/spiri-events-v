import CreatableSelect from 'react-select/creatable';
import { GEMEINDEN, OUTSIDE_BEZIRK, findGemeinde } from '../utils/gemeinden';

const OPTIONS = GEMEINDEN.map((g) => ({ value: g.name, label: g.name, bezirk: g.bezirk }));

// Ort (Gemeinde) picker shared by both event forms, styled like the Kategorie
// select. The Bezirk is derived from the picked Gemeinde; a place outside
// Vorarlberg is created from the typed text and stored as "Umgebung".
export default function CityField({ city: cityProp, disabled, error, onChange }) {
  // Drafts saved before the Ort field existed have no city.
  const city = cityProp || '';
  const match = findGemeinde(city);

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
      {match && !disabled && (
        <span className="field-hint" data-testid="city-bezirk-hint">
          Bezirk {match.bezirk}
        </span>
      )}
      {city && !match && !disabled && (
        <span className="field-hint">Außerhalb von Vorarlberg (Umgebung)</span>
      )}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
