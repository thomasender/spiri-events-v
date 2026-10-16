import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

// Value of the extra option in the Bezirk / Landkreis select.
export const BEZIRK_NOT_FOUND = '__bezirk-not-found__';

/**
 * "Finde meinen Bezirk nicht": tells the person which region the event is in
 * and offers to change it. The region field itself is not shown in the event
 * forms (it was redundant); this is the only place to change it. Only used when
 * two or more regions are active (see useRegionChoices).
 */
export default function EventRegionDialog({
  isOpen,
  regionName,
  value,
  options,
  onChange,
  onClose,
}) {
  return (
    <ConfirmDialog isOpen={isOpen} title="Region ändern?" onCancel={onClose} hideActions>
      {isOpen && (
        <RegionDialogBody
          regionName={regionName}
          value={value}
          options={options}
          onChange={onChange}
          onClose={onClose}
        />
      )}
    </ConfirmDialog>
  );
}

function RegionDialogBody({ regionName, value, options, onChange, onClose }) {
  const [choice, setChoice] = useState(value);
  const apply = () => {
    if (choice !== value) onChange({ target: { name: 'regionId', value: choice } });
    onClose();
  };
  return (
    <div data-testid="event-region-dialog">
      <p>
        Du bist gerade in der Region <strong>{regionName}</strong>. Möchtest du deine Region ändern?
      </p>
      <div className="form-group">
        <label htmlFor="event-region-dialog-select">Region</label>
        <select
          id="event-region-dialog-select"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.active ? '' : ' (noch nicht freigeschaltet)'}
            </option>
          ))}
        </select>
      </div>
      <div className="confirm-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Nein, hier bleiben
        </button>
        <button type="button" className="btn btn-primary" onClick={apply}>
          Region ändern
        </button>
      </div>
    </div>
  );
}
