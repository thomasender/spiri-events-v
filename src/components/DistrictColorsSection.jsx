import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RotateCcw, Save } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { saveDistrictColors, useDistrictColors } from '../hooks/useDistrictColors';
import {
  DISTRICT_COLOR_DEFAULTS,
  DISTRICT_COLORS_MAX_KEYS,
  districtColorKey,
} from '../utils/districtColors';
import { bezirkLabel } from '../utils/regions';
import ColorPicker from './ColorPicker';
import './DistrictColorsSection.css';

const MAIN_DISTRICTS = Object.keys(DISTRICT_COLOR_DEFAULTS);

const sameOverrides = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? null) !== (b[key] ?? null)) return false;
  return true;
};

// Theme editor section "Bezirksfarben": one colour per district (docs/design-tokens.md). The
// six main ones are always visible, every other district of the active regions sits in the
// collapsed "Weitere Bezirke" with its automatic colour as the starting value. Saved on its own
// button into app_settings/districtColors; colour names are never shown.
export default function DistrictColorsSection() {
  const { role } = useAuth();
  const isAdmin = role === 'Admin';
  const { overrides, loading, activeDistricts, autoColors } = useDistrictColors();

  const [draft, setDraft] = useState(overrides);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const dirty = !sameOverrides(draft, overrides);

  // Follow the saved colours until the admin starts editing.
  useEffect(() => {
    setDraft((prev) => (sameOverrides(prev, overrides) || dirty ? prev : overrides));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides]);

  const otherDistricts = useMemo(
    () =>
      [...new Set(activeDistricts.map(districtColorKey))]
        .filter((name) => !(name in DISTRICT_COLOR_DEFAULTS))
        .sort((a, b) => a.localeCompare(b, 'de')),
    [activeDistricts]
  );

  const baseColor = (name) => DISTRICT_COLOR_DEFAULTS[name] ?? autoColors[name];

  const setColor = (name, value) => {
    setSaved(false);
    setError(null);
    setDraft((prev) => {
      const next = { ...prev };
      if (value.toLowerCase() === baseColor(name).toLowerCase()) delete next[name];
      else next[name] = value;
      return next;
    });
  };

  const resetColor = (name) => {
    setSaved(false);
    setDraft((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleSave = async () => {
    if (Object.keys(draft).length > DISTRICT_COLORS_MAX_KEYS) {
      setError('Zu viele Einstellungen.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveDistrictColors(draft);
      setSaved(true);
    } catch (err) {
      setError(err?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (name) => {
    const value = draft[name] ?? baseColor(name);
    const overridden = name in draft;
    return (
      <li
        key={name}
        className="district-colors-field"
        data-testid="district-color-field"
        data-district={name}
      >
        <div className="district-colors-field-head">
          <span className="district-colors-sample" style={{ '--district-color': value }}>
            {bezirkLabel(name)}
          </span>
          {overridden && (
            <button
              type="button"
              className="district-colors-reset"
              onClick={() => resetColor(name)}
              disabled={!isAdmin || saving}
              aria-label={`${bezirkLabel(name)} zurücksetzen`}
              data-testid="district-color-reset"
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Zurücksetzen</span>
            </button>
          )}
        </div>
        {isAdmin ? (
          <ColorPicker
            value={value}
            onChange={(next) => setColor(name, next)}
            label={`Farbe ${bezirkLabel(name)}`}
          />
        ) : (
          <code data-testid="district-color-readonly-value">{value}</code>
        )}
      </li>
    );
  };

  return (
    <section className="theme-tab-group district-colors" data-testid="district-colors-section">
      <h2 className="theme-tab-group-title">Bezirksfarben</h2>
      <p className="district-colors-intro">
        Jeder Bezirk hat eine eigene Farbe. Sie erscheint überall auf der Website, wo der Bezirk
        gezeigt wird (Filter, Bezirks-Schild auf den Event-Karten). Neue Bezirke bekommen von selbst
        eine passende Farbe.
      </p>
      {loading ? (
        <p role="status">
          <Loader2 size={16} className="spin" aria-hidden="true" /> Lädt ...
        </p>
      ) : (
        <>
          <ul className="district-colors-list">{MAIN_DISTRICTS.map(renderField)}</ul>
          {otherDistricts.length > 0 && (
            <details className="district-colors-more" data-testid="district-colors-more">
              <summary>Weitere Bezirke ({otherDistricts.length})</summary>
              <ul className="district-colors-list">{otherDistricts.map(renderField)}</ul>
            </details>
          )}
          <div className="district-colors-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!isAdmin || !dirty || saving}
              data-testid="district-colors-save"
            >
              {saving ? (
                <Loader2 size={16} className="spin" aria-hidden="true" />
              ) : (
                <Save size={16} aria-hidden="true" />
              )}
              <span>Bezirksfarben speichern</span>
            </button>
            {saved && !dirty && (
              <span
                className="district-colors-saved"
                role="status"
                data-testid="district-colors-saved"
              >
                <Check size={16} aria-hidden="true" /> Gespeichert
              </span>
            )}
            {error && (
              <span className="district-colors-error" role="alert">
                {error}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
