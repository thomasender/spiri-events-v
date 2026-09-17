import { useRef } from 'react';
import './DateTimeInput.css';

/**
 * Custom date/time trigger that replaces the native <input type="date"> and
 * <input type="time"> in the event wizard.
 *
 * Why: on iOS WebKit (Safari and Chrome on iPhone), the native date/time picker
 * chrome carries an intrinsic minimum width that no CSS width: 100% reliably
 * suppresses, so the field visually extends past the form container. Rendering
 * a button trigger keeps the visible UI fully under our control while still
 * delegating the picker itself to the OS — tapping the button calls
 * inputRef.showPicker() (or focuses the hidden input as a fallback), and the
 * hidden native <input type="date|time"> updates formData exactly like the old
 * input did.
 *
 * Props match the inputs we replaced: id, name, value, onChange, hasError,
 * required, disabled, min, max.
 */
export default function DateTimeInput({
  kind,
  id,
  name,
  value,
  onChange,
  hasError = false,
  required = false,
  disabled = false,
  min,
  max,
}) {
  const inputRef = useRef(null);

  const handleTriggerClick = () => {
    const el = inputRef.current;
    if (!el || disabled) return;
    // Modern Chromium / WebKit: showPicker() opens the native picker
    // programmatically. Wrapped in try/catch because some browsers refuse to
    // open the picker if not in a direct user-gesture handler.
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // fall through to focus()
      }
    }
    // Fallback for browsers without showPicker — on iOS, focusing a
    // <input type="date"> / <input type="time"> still opens the picker.
    el.focus();
  };

  const display = formatValue(value, kind);

  return (
    <div className={`dt-input${hasError ? ' has-error' : ''}${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        className={`dt-input-trigger${display ? '' : ' is-empty'}`}
        onClick={handleTriggerClick}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={display || placeholder(kind)}
      >
        <span className="dt-input-display">{display || placeholder(kind)}</span>
      </button>
      <input
        ref={inputRef}
        type={kind}
        id={id}
        name={name}
        value={value || ''}
        onChange={onChange}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        className="dt-input-native"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function formatValue(value, kind) {
  if (!value) return '';
  if (kind === 'time') {
    return value;
  }
  // value is "YYYY-MM-DD" — format in de-AT so the trigger matches the rest of
  // the German UI (e.g. "17.09.2026"). Manual parse avoids the new Date(...)
  // UTC-shift trap where "2026-09-17" becomes the previous day in some locales.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function placeholder(kind) {
  return kind === 'time' ? '--:--' : 'tt.mm.jjjj';
}
