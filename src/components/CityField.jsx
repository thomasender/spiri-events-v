import { GEMEINDEN, OUTSIDE_BEZIRK, findGemeinde } from '../utils/gemeinden';

// Ort (Gemeinde) picker shared by both event forms. The Bezirk is derived from
// the chosen Gemeinde; places outside Vorarlberg are stored as "Umgebung".
export default function CityField({ city, bezirk, disabled, error, onChange }) {
  const match = findGemeinde(city);
  const typed = city.trim().length > 0;
  const outside = !match && typed && bezirk === OUTSIDE_BEZIRK;

  const handleText = (e) => {
    const value = e.target.value;
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
        list="gemeinden-list"
        autoComplete="off"
        value={city}
        onChange={handleText}
        onBlur={handleBlur}
        placeholder="Gemeinde, z.B. Altach"
        disabled={disabled}
        className={error ? 'input-error' : ''}
      />
      <datalist id="gemeinden-list">
        {GEMEINDEN.map((g) => (
          <option key={g.name} value={g.name} />
        ))}
      </datalist>
      {match && !disabled && (
        <span className="field-hint" data-testid="city-bezirk-hint">
          Bezirk {match.bezirk}
        </span>
      )}
      {typed && !match && !disabled && (
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
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
