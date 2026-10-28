import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { formatFluid, parseFluid, validateLayoutValue } from '../../utils/layoutTokens';
import { resetDraftValue, setDraftValue } from '../../lib/layoutStore';

const numberOf = (token, value) =>
  token.unit ? Number(String(value).replace(token.unit, '')) : Number(value);

// Slider + number field for one layout token. Valid input goes straight into
// the draft (live preview); invalid typed input only shows a hint and leaves
// the page as it was.
export default function TokenControl({ token, value, compact = false }) {
  if (token.type === 'fluid') return <FluidControl token={token} value={value} compact={compact} />;
  return <SimpleControl token={token} value={value} compact={compact} />;
}

function useDraftText(initial) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState(null);
  useEffect(() => {
    setText(initial);
    setError(null);
  }, [initial]);
  return { text, setText, error, setError };
}

function SimpleControl({ token, value, compact }) {
  const n = numberOf(token, value);
  const { text, setText, error, setError } = useDraftText(String(n));
  const withUnit = (v) => `${v}${token.unit}`;

  const commit = (raw) => {
    try {
      setDraftValue(token.name, withUnit(raw));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className={`dm-control${compact ? ' dm-control--compact' : ''}`}>
      <input
        type="range"
        className="dm-range"
        min={token.min}
        max={token.max}
        step={token.step}
        value={Number.isFinite(n) ? n : token.min}
        aria-label={token.label}
        onChange={(e) => commit(e.target.value)}
      />
      <span className="dm-number">
        <input
          type="text"
          inputMode="decimal"
          className="dm-number-input"
          value={text}
          aria-label={`${token.label} (Wert)`}
          aria-invalid={error ? 'true' : undefined}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value.replace(',', '.'));
          }}
        />
        {token.unit && <span className="dm-unit">{token.unit}</span>}
      </span>
      {error && (
        <p className="dm-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function FluidControl({ token, value, compact }) {
  const parts = parseFluid(value) || parseFluid(token.default);
  const set = (patch) => {
    const next = { ...parts, ...patch };
    // Keep the pair consistent while dragging one slider past the other.
    if (next.min > next.max) {
      if ('min' in patch) next.max = next.min;
      else next.min = next.max;
    }
    try {
      setDraftValue(token.name, validateLayoutValue(token, formatFluid(next)));
    } catch {
      // Slider values are always within the catalogue bounds.
    }
  };

  return (
    <div className={`dm-control dm-control--fluid${compact ? ' dm-control--compact' : ''}`}>
      {[
        ['min', 'Handy (Minimum)'],
        ['max', 'Großer Bildschirm (Maximum)'],
      ].map(([key, label]) => (
        <label key={key} className="dm-fluid-row">
          <span className="dm-fluid-label">{label}</span>
          <input
            type="range"
            className="dm-range"
            min={token.min}
            max={token.max}
            step={0.05}
            value={parts[key]}
            aria-label={`${token.label}: ${label}`}
            onChange={(e) => set({ [key]: Number(e.target.value) })}
          />
          <span className="dm-fluid-value">{Math.round(parts[key] * 16)} px</span>
        </label>
      ))}
    </div>
  );
}

export function ResetButtons({ token, published, current }) {
  const isDefault = current === token.default;
  const isPublished = current === published;
  return (
    <div className="dm-reset">
      <button
        type="button"
        className="dm-link"
        disabled={isDefault}
        onClick={() => resetDraftValue(token.name)}
        title={`Standardwert: ${token.default}`}
      >
        <RotateCcw size={12} aria-hidden="true" /> Standard
      </button>
      {!isPublished && (
        <button
          type="button"
          className="dm-link"
          onClick={() => setDraftValue(token.name, published)}
          title={`Veröffentlicht: ${published}`}
        >
          Zurück zum Veröffentlichten
        </button>
      )}
    </div>
  );
}
