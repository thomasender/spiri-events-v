import { GEMEINDEN, OUTSIDE_BEZIRK, findGemeinde } from '../utils/gemeinden';

// Ort picker shared by both event forms. For Vorarlberg the Ort is a Gemeinde
// and the Bezirk is derived from it; places outside Vorarlberg are stored as
// "Umgebung". Other regions have no Gemeinde list: `free` shows a plain text
// field and the form keeps its own Bezirk / Landkreis select.
export default function CityField({
  city: cityProp,
  bezirk,
  disabled,
  error,
  onChange,
  free,
  onOtherRegion,
}) {
  // Drafts saved before the Ort field existed have no city.
  const city = cityProp || '';
  const match = free ? null : findGemeinde(city);
  const typed = city.trim().length > 0;
  const outside = !match && typed && bezirk === OUTSIDE_BEZIRK;

  const handleText = (e) => {
    const value = e.target.value;
    if (free) {
      onChange({ city: value, bezirk });
      return;
    }
    const found = findGemeinde(value);
    onChange({
      city: value,
      bezirk: found ? found.bezirk : bezirk === OUTSIDE_BEZIRK ? OUTSIDE_BEZIRK : '',
    });
  };

  const handleBlur = () => {
    if (match && match.name !== city) onChange({ city: match.name, bezirk: match.bezirk });
  };

  const handleOutside = (e) => {
    onChange({ city, bezirk: e.target.checked ? OUTSIDE_BEZIRK : '' });
  };

  return (
    <div className="form-group">
      <label htmlFor="city">Ort *</label>
      <input
        id="city"
        name="city"
        type="text"
        list={free ? undefined : 'gemeinden-list'}
        autoComplete="off"
        value={city}
        onChange={handleText}
        onBlur={handleBlur}
        placeholder={free ? 'z.B. Lindau' : 'Gemeinde, z.B. Altach'}
        disabled={disabled}
        className={error ? 'input-error' : ''}
      />
      {!free && (
        <datalist id="gemeinden-list">
          {GEMEINDEN.map((g) => (
            <option key={g.name} value={g.name} />
          ))}
        </datalist>
      )}
      {match && !disabled && (
        <span className="field-hint" data-testid="city-bezirk-hint">
          Bezirk {match.bezirk}
        </span>
      )}
      {!free && typed && !match && !disabled && (
        <label className="checkbox-label checkbox-label--inline">
          <input
            type="checkbox"
            checked={outside}
            onChange={handleOutside}
            data-testid="city-outside-checkbox"
          />
          <span>Dieser Ort liegt außerhalb von Vorarlberg (Umgebung)</span>
        </label>
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
