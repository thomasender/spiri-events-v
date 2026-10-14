// "Region" select of the event forms. Only rendered when two or more regions
// are active (see useRegionChoices); with one region the forms stay as before.
export default function EventRegionField({ value, options, onChange, isOnline }) {
  return (
    <div className="form-group" data-testid="event-region-field">
      <label htmlFor="regionId">Region *</label>
      <select
        id="regionId"
        name="regionId"
        value={value}
        onChange={onChange}
        aria-describedby={isOnline ? 'regionId-online-hint' : undefined}
      >
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.active ? '' : ' (noch nicht freigeschaltet)'}
          </option>
        ))}
      </select>
      {isOnline && (
        <span
          className="input-info"
          id="regionId-online-hint"
          data-testid="event-region-online-hint"
        >
          Online-Events sehen alle Besucher:innen. Bitte wähle die Region, aus der du kommst.
        </span>
      )}
    </div>
  );
}
