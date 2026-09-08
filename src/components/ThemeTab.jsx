import { useCallback, useState } from 'react';
import { AlertTriangle, Info, Palette, RotateCcw } from 'lucide-react';
import { useThemeSettings } from '../hooks/useThemeSettings';
import ColorPicker from './ColorPicker';
import ThemeTokenInfoDialog from './ThemeTokenInfoDialog';
import ConfirmDialog from './ConfirmDialog';
import './ThemeTab.css';

// Admin tab for managing every admin-editable CSS color variable. Mirrors
// the CategoriesTab layout (grouped rows, per-row edit + reset actions)
// but uses the `useThemeSettings` hook, which already mirrors the values
// to `:root` so the admin sees the change instantly as they edit.
export default function ThemeTab() {
  const {
    settings,
    groupedVariables,
    loading,
    error,
    isAdmin,
    isModified,
    modifiedCount,
    updateVariable,
    resetToDefault,
    resetAllToDefaults,
  } = useThemeSettings();

  const [infoToken, setInfoToken] = useState(null);
  const [pendingError, setPendingError] = useState(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  const handleChange = useCallback(
    async (name, value) => {
      setPendingError(null);
      try {
        await updateVariable(name, value);
      } catch (err) {
        setPendingError(err.message || 'Änderung fehlgeschlagen.');
      }
    },
    [updateVariable]
  );

  const handleReset = useCallback(
    async (name) => {
      setPendingError(null);
      try {
        await resetToDefault(name);
      } catch (err) {
        setPendingError(err.message || 'Zurücksetzen fehlgeschlagen.');
      }
    },
    [resetToDefault]
  );

  const handleResetAll = useCallback(async () => {
    setPendingError(null);
    try {
      await resetAllToDefaults();
      setConfirmResetAll(false);
    } catch (err) {
      setPendingError(err.message || 'Zurücksetzen fehlgeschlagen.');
    }
  }, [resetAllToDefaults]);

  if (loading) {
    return <div className="loading-spinner" data-testid="theme-tab-loading" />;
  }

  if (error) {
    return (
      <div className="theme-tab-error" role="alert" data-testid="theme-tab-error">
        Theme konnte nicht geladen werden: {error}
      </div>
    );
  }

  return (
    <div className="theme-tab" data-testid="theme-tab">
      <div className="theme-tab-toolbar">
        <p className="theme-tab-description">
          Verwalte hier alle Farben des Design-Systems. Jede Variable ist live verknüpft —
          Änderungen wirken sich sofort auf die gesamte App aus, ohne dass ein Build nötig ist.
          Klicke auf das Info-Symbol, um zu sehen, wo die jeweilige Variable überall verwendet wird.
        </p>
        <div className="theme-tab-toolbar-actions">
          {modifiedCount > 0 && (
            <span
              className="theme-tab-modified-badge"
              data-testid="theme-tab-modified-count"
              aria-label={`${modifiedCount} Variable${modifiedCount === 1 ? '' : 'n'} vom Standard abgeändert`}
            >
              {modifiedCount} {modifiedCount === 1 ? 'Variable' : 'Variablen'} abgeändert
            </span>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirmResetAll(true)}
            disabled={!isAdmin || modifiedCount === 0}
            data-testid="theme-tab-reset-all"
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>Alle zurücksetzen</span>
          </button>
        </div>
      </div>

      {pendingError && (
        <div className="theme-tab-error" role="alert" data-testid="theme-tab-form-error">
          {pendingError}
        </div>
      )}

      {!isAdmin && (
        <div className="theme-tab-readonly" role="status" data-testid="theme-tab-readonly">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Du kannst die Farben ansehen, aber nur Admins können Änderungen speichern.</span>
        </div>
      )}

      <div className="theme-tab-groups" data-testid="theme-tab-groups">
        {groupedVariables.map(({ group, variables }) => (
          <section
            key={group}
            className="theme-tab-group"
            data-testid="theme-tab-group"
            data-group={group}
          >
            <h2 className="theme-tab-group-title">{group}</h2>
            <ul className="theme-tab-list">
              {variables.map((variable) => {
                const currentValue = settings[variable.name] || variable.defaultValue;
                const dirty = isModified(variable.name);
                return (
                  <li
                    key={variable.name}
                    className={`theme-row${dirty ? ' theme-row--modified' : ''}`}
                    data-testid="theme-row"
                    data-variable-name={variable.name}
                    data-modified={dirty || undefined}
                  >
                    <span
                      className="theme-row-swatch"
                      aria-hidden="true"
                      style={{ backgroundColor: currentValue }}
                      data-testid="theme-row-swatch"
                    />
                    <div className="theme-row-info">
                      <span className="theme-row-label">
                        {variable.label}
                        {variable.unused && (
                          <span
                            className="theme-row-unused-badge"
                            title="Aktuell nicht in Verwendung"
                            data-testid="theme-row-unused-badge"
                          >
                            ungenutzt
                          </span>
                        )}
                      </span>
                      <span className="theme-row-name" data-testid="theme-row-name">
                        <code>{variable.name}</code>
                      </span>
                    </div>
                    <div className="theme-row-picker">
                      {isAdmin ? (
                        <ColorPicker
                          value={currentValue}
                          onChange={(next) => handleChange(variable.name, next)}
                          label={`${variable.label} bearbeiten`}
                        />
                      ) : (
                        <code
                          className="theme-row-readonly-value"
                          data-testid="theme-row-readonly-value"
                        >
                          {currentValue}
                        </code>
                      )}
                    </div>
                    <div className="theme-row-actions">
                      <button
                        type="button"
                        className="theme-row-action"
                        onClick={() =>
                          setInfoToken({
                            ...variable,
                            currentValue,
                          })
                        }
                        aria-label={`Info zu ${variable.label}`}
                        title="Info"
                        data-testid="theme-row-info"
                      >
                        <Info size={16} aria-hidden="true" />
                        <span>Info</span>
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="theme-row-action"
                          onClick={() => handleReset(variable.name)}
                          disabled={!dirty}
                          aria-label={`${variable.label} auf Standard zurücksetzen`}
                          title="Auf Standard zurücksetzen"
                          data-testid="theme-row-reset"
                        >
                          <RotateCcw size={16} aria-hidden="true" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="theme-tab-preview" data-testid="theme-tab-preview" aria-hidden="true">
        <div className="theme-tab-preview-card">
          <span className="theme-tab-preview-eyebrow">Live-Vorschau</span>
          <h3>Diese Karte verwendet die aktuellen Theme-Variablen</h3>
          <p>
            Änderungen, die du oben machst, wirken sich sofort auf diese Vorschau und die gesamte
            App aus.
          </p>
          <div className="theme-tab-preview-row">
            <button type="button" className="btn btn-primary" disabled>
              Primärbutton
            </button>
            <button type="button" className="btn btn-secondary" disabled>
              Sekundärbutton
            </button>
            <button type="button" className="btn btn-danger" disabled>
              Fehlerbutton
            </button>
          </div>
          <div className="theme-tab-preview-badges">
            <span className="theme-tab-preview-badge theme-tab-preview-badge--free">Kostenlos</span>
            <span className="theme-tab-preview-badge theme-tab-preview-badge--fee">25 €</span>
            <span className="theme-tab-preview-badge theme-tab-preview-badge--donation">
              Freie Spende
            </span>
            <span className="theme-tab-preview-badge theme-tab-preview-badge--pending">
              Ausstehend
            </span>
          </div>
        </div>
      </div>

      <ThemeTokenInfoDialog token={infoToken} onClose={() => setInfoToken(null)} />

      <ConfirmDialog
        isOpen={confirmResetAll}
        title="Alle Theme-Variablen zurücksetzen?"
        confirmLabel="Zurücksetzen"
        cancelLabel="Abbrechen"
        danger
        onConfirm={handleResetAll}
        onCancel={() => setConfirmResetAll(false)}
      >
        <p>
          <Palette
            size={16}
            aria-hidden="true"
            style={{ verticalAlign: 'middle', marginRight: 6 }}
          />
          Dadurch werden alle {modifiedCount}{' '}
          {modifiedCount === 1 ? 'geänderte Variable' : 'geänderten Variablen'} auf den Standardwert
          zurückgesetzt.
        </p>
        <p>Diese Aktion lässt sich nicht rückgängig machen.</p>
      </ConfirmDialog>
    </div>
  );
}
