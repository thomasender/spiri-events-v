import { useEffect, useState, useRef, useId } from 'react';
import './ColorPicker.css';

// Web best practice color picker:
//   - Native `<input type="color">` for the color wheel (zero-dependency,
//     keyboard accessible, mobile-friendly).
//   - Paired text input for hex codes — admins can paste a specific value
//     or copy the chosen color out without opening the picker.
//   - Live preview swatch shows the current value at all times.
//   - Inline validation rejects malformed input without blocking typing;
//     the parent can react to validity via `onValidityChange`.
//
// Designed for admin category CRUD; not a general-purpose form field.
export default function ColorPicker({ value, onChange, id, label = 'Farbe', onValidityChange }) {
  const fallbackId = useId();
  const inputId = id || fallbackId;
  const hexId = `${inputId}-hex`;
  const [hexDraft, setHexDraft] = useState(value || '');
  const lastEmittedRef = useRef(value);

  // Keep the text input in sync with the canonical `value` prop whenever
  // the parent resets it (e.g. when opening the dialog for a different
  // category). The text draft is the local "in-flight" edit.
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      setHexDraft(value || '');
      lastEmittedRef.current = value;
    }
  }, [value]);

  const emit = (next) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(next)) return;
    lastEmittedRef.current = next;
    onChange(next);
  };

  const handleHexChange = (e) => {
    const raw = e.target.value;
    setHexDraft(raw);
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) emit(raw);
  };

  const handleHexBlur = () => {
    // Revert invalid drafts to the last valid value so the textbox never
    // shows a half-typed color.
    if (!/^#[0-9a-fA-F]{6}$/.test(hexDraft)) {
      setHexDraft(value || '');
    }
  };

  const handleNativeChange = (e) => {
    emit(e.target.value);
  };

  const hexIsValid = /^#[0-9a-fA-F]{6}$/.test(hexDraft);

  useEffect(() => {
    if (typeof onValidityChange === 'function') {
      onValidityChange(hexIsValid);
    }
  }, [hexIsValid, onValidityChange]);

  return (
    <div className="color-picker" data-testid="color-picker">
      <div className="color-picker-preview-row">
        <label className="color-picker-native-wrap" htmlFor={inputId}>
          <span className="sr-only">{label} auswählen</span>
          <input
            type="color"
            id={inputId}
            value={value || '#000000'}
            onChange={handleNativeChange}
            className="color-picker-native"
            data-testid="color-picker-native"
            aria-label={label}
          />
          <span
            className="color-picker-preview"
            style={{ backgroundColor: value || '#000000' }}
            aria-hidden="true"
            data-testid="color-picker-preview"
          />
        </label>
        <div className="color-picker-hex-wrap">
          <label htmlFor={hexId} className="color-picker-hex-label">
            Hex-Code
          </label>
          <input
            type="text"
            id={hexId}
            value={hexDraft}
            onChange={handleHexChange}
            onBlur={handleHexBlur}
            placeholder="#RRGGBB"
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!hexIsValid}
            aria-describedby={`${hexId}-hint`}
            className={`color-picker-hex${hexIsValid ? '' : ' color-picker-hex--invalid'}`}
            data-testid="color-picker-hex"
          />
          <p id={`${hexId}-hint`} className="color-picker-hint" data-testid="color-picker-hint">
            6-stelliger Hex-Code, z.B. #c48e6a
          </p>
        </div>
      </div>
    </div>
  );
}
