import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Eye,
  Inbox,
  Info,
  Loader2,
  Palette,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useThemeSettings } from '../hooks/useThemeSettings';
import ColorPicker from './ColorPicker';
import ThemeTokenInfoDialog from './ThemeTokenInfoDialog';
import ConfirmDialog from './ConfirmDialog';
import SaveThemeDialog from './SaveThemeDialog';
import './ThemeTab.css';

// Admin tab for full theme management.
//
// Three distinct workflows share this single tab because admins need to
// see them side-by-side while working:
//
//   1. The COLOR EDITOR (top) — a sandboxed in-memory draft. Color-picker
//      writes land here; nothing leaves the browser until "Aktivieren",
//      "Speichern" or "Als neues Theme speichern" is clicked. The bundled
//      defaults, the live theme, or a loaded saved theme can each be the
//      starting point.
//
//   2. The PREVIEW CARD — uses the editor's values (not the live theme) so
//      the admin sees their changes immediately. Includes a "Kalender
//      öffnen" link that pops the public calendar in a new tab; useful for
//      inspecting the live result alongside an active publish.
//
//   3. The SAVED-THEMES LIBRARY (bottom) — every persisted theme with
//      per-row actions: load into the editor, activate on the website,
//      inline-rename, delete. The currently active theme carries an
//      "Aktiv" badge.
//
// Action bar layout for the editor:
//
//   ┌────────────────────────────────────────────────────────────────┐
//   │ [Editor-Quelle: X]    [Aktivieren] [Speichern]                │
//   │                       [Als neu speichern]  [Verwerfen]        │
//   └────────────────────────────────────────────────────────────────┘
//
// `editorBase.kind` decides which secondary buttons show; `modifiedCount`
// gates the destructive/save buttons so the admin can't fire them with no
// pending changes.
export default function ThemeTab() {
  const {
    settings: editorValues,
    groupedVariables,
    editorBase,
    editorBaseValues,
    activeThemeId,
    activeThemeName,
    themes,
    loading,
    error,
    isAdmin,
    isModified,
    modifiedCount,
    updateVariable,
    resetToDefault,
    resetAllToDefaults,
    loadIntoEditor,
    resetEditorToBase,
    saveAsNewTheme,
    saveLoadedTheme,
    renameTheme,
    deleteTheme,
    activateEditor,
    activateSavedTheme,
    broadcastEditorValues,
  } = useThemeSettings();

  const [infoToken, setInfoToken] = useState(null);
  const [pendingError, setPendingError] = useState(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingError, setRenamingError] = useState(null);
  const [themePendingDelete, setThemePendingDelete] = useState(null);

  // Flash a transient "saved" / "activated" badge so the admin gets
  // confirmation beyond the absence of an error. Auto-clears after 3s.
  useEffect(() => {
    if (!actionSuccess) return undefined;
    const t = setTimeout(() => setActionSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [actionSuccess]);

  // Push every editor change to any open preview tab via BroadcastChannel.
  // We send on every render (even when nothing's changed) so a freshly
  // opened preview window that subscribes after this one still gets the
  // current editor state on its next paint, and so the preview never
  // drifts stale after a "Verwerfen". The receiver prefers these values
  // over the published active theme, so the designer sees in-progress
  // changes live — but live visitors never receive a broadcast because
  // BroadcastChannel is per-browser.
  useEffect(() => {
    broadcastEditorValues(editorValues);
  }, [editorValues, broadcastEditorValues]);

  // ── Color-picker handlers (purely local — the editor is sandboxed) ──

  const handleChange = useCallback(
    (name, value) => {
      setPendingError(null);
      setActionSuccess(null);
      try {
        updateVariable(name, value);
      } catch (err) {
        setPendingError(err.message || 'Änderung fehlgeschlagen.');
      }
    },
    [updateVariable]
  );

  const handleReset = useCallback(
    (name) => {
      setPendingError(null);
      setActionSuccess(null);
      try {
        resetToDefault(name);
      } catch (err) {
        setPendingError(err.message || 'Zurücksetzen fehlgeschlagen.');
      }
    },
    [resetToDefault]
  );

  const handleResetAll = useCallback(async () => {
    setPendingError(null);
    try {
      resetAllToDefaults();
      setConfirmResetAll(false);
    } catch (err) {
      setPendingError(err.message || 'Zurücksetzen fehlgeschlagen.');
    }
  }, [resetAllToDefaults]);

  // ── Action bar handlers (all async — touch Firestore) ─────────────

  const handleActivate = useCallback(async () => {
    setPendingError(null);
    setActionSuccess(null);
    setActionPending(true);
    try {
      // If a saved theme is loaded, link the publish to it so the
      // "Aktiv" badge sticks. Otherwise publish as ad-hoc values.
      const linkedThemeId = editorBase.kind === 'saved' ? editorBase.themeId : null;
      await activateEditor(linkedThemeId);
      setActionSuccess('Theme aktiviert.');
    } catch (err) {
      setPendingError(err.message || 'Aktivieren fehlgeschlagen.');
    } finally {
      setActionPending(false);
    }
  }, [activateEditor, editorBase]);

  const handleSaveLoaded = useCallback(async () => {
    setPendingError(null);
    setActionSuccess(null);
    setActionPending(true);
    try {
      await saveLoadedTheme();
      setActionSuccess('Theme gespeichert.');
    } catch (err) {
      setPendingError(err.message || 'Speichern fehlgeschlagen.');
    } finally {
      setActionPending(false);
    }
  }, [saveLoadedTheme]);

  const handleSaveAsNew = useCallback(
    async ({ name, description }) => {
      setActionPending(true);
      try {
        await saveAsNewTheme({ name, description });
        setSaveDialogOpen(false);
        setActionSuccess('Als neues Theme gespeichert.');
      } finally {
        setActionPending(false);
      }
    },
    [saveAsNewTheme]
  );

  const handleDiscard = useCallback(() => {
    setPendingError(null);
    setActionSuccess(null);
    resetEditorToBase();
  }, [resetEditorToBase]);

  // ── Library row handlers ──────────────────────────────────────────

  const handleLoadTheme = useCallback(
    (themeId) => {
      setPendingError(null);
      setActionSuccess(null);
      try {
        loadIntoEditor('saved', themeId);
      } catch (err) {
        setPendingError(err.message || 'Laden fehlgeschlagen.');
      }
    },
    [loadIntoEditor]
  );

  const handleActivateSavedTheme = useCallback(
    async (themeId) => {
      setPendingError(null);
      setActionSuccess(null);
      setActionPending(true);
      try {
        await activateSavedTheme(themeId);
        setActionSuccess('Theme aktiviert.');
      } catch (err) {
        setPendingError(err.message || 'Aktivieren fehlgeschlagen.');
      } finally {
        setActionPending(false);
      }
    },
    [activateSavedTheme]
  );

  const handleStartRename = useCallback((theme) => {
    setRenamingId(theme.id);
    setRenameDraft(theme.name);
    setRenamingError(null);
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameDraft('');
    setRenamingError(null);
  }, []);

  const handleCommitRename = useCallback(
    async (themeId) => {
      setRenamingError(null);
      setActionPending(true);
      try {
        await renameTheme(themeId, renameDraft);
        setRenamingId(null);
        setRenameDraft('');
        setActionSuccess('Theme umbenannt.');
      } catch (err) {
        setRenamingError(err.message || 'Umbenennen fehlgeschlagen.');
      } finally {
        setActionPending(false);
      }
    },
    [renameTheme, renameDraft]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!themePendingDelete) return;
    setPendingError(null);
    setActionSuccess(null);
    setActionPending(true);
    try {
      await deleteTheme(themePendingDelete.id);
      setThemePendingDelete(null);
      setActionSuccess('Theme gelöscht.');
    } catch (err) {
      setPendingError(err.message || 'Löschen fehlgeschlagen.');
      setThemePendingDelete(null);
    } finally {
      setActionPending(false);
    }
  }, [themePendingDelete, deleteTheme]);

  // ── Derived flags for the action bar ──────────────────────────────

  const isDirty = modifiedCount > 0;
  const isLoadedSavedTheme = editorBase.kind === 'saved';
  const loadedThemeIsActive = isLoadedSavedTheme && editorBase.themeId === activeThemeId;
  const canActivate =
    isAdmin && !actionPending && (isDirty || (isLoadedSavedTheme && !loadedThemeIsActive));
  const canSaveLoaded = isAdmin && isLoadedSavedTheme && isDirty && !actionPending;
  const canDiscard = isAdmin && isDirty && !actionPending;
  const canSaveAsNew = isAdmin && !actionPending;

  const activeThemeLabel = activeThemeName || 'Unbenannt (Standard)';

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
        <div className="theme-tab-toolbar-text">
          <p className="theme-tab-description">
            Verwalte hier alle Farben des Design-Systems. Änderungen im Editor sind zunächst nur
            eine Vorschau — erst ein Klick auf <strong>Aktivieren</strong> macht sie für alle
            Besucher sichtbar. Über <strong>Speichern</strong> legst du die aktuelle Konfiguration
            dauerhaft als Theme in der Bibliothek ab.
          </p>
          <div className="theme-tab-active-row">
            <span className="theme-tab-active-label">
              <Palette size={16} aria-hidden="true" />
              <span>Aktiv auf der Website:</span>
            </span>
            <span
              className={`theme-tab-active-name${activeThemeId ? '' : ' theme-tab-active-name--placeholder'}`}
              data-testid="theme-tab-active-theme-name"
            >
              {activeThemeLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="theme-tab-editor-bar" data-testid="theme-tab-editor-bar">
        <div className="theme-tab-editor-source">
          <span className="theme-tab-editor-source-label">Editor-Quelle:</span>
          {isLoadedSavedTheme ? (
            <span className="theme-tab-editor-source-value" data-testid="theme-tab-editor-source">
              <Pencil size={14} aria-hidden="true" />
              <span>{editorBase.name}</span>
              {loadedThemeIsActive && <span className="theme-tab-editor-source-tag">aktiv</span>}
            </span>
          ) : (
            <span
              className="theme-tab-editor-source-value theme-tab-editor-source-value--active"
              data-testid="theme-tab-editor-source"
            >
              <Palette size={14} aria-hidden="true" />
              <span>Aktives Theme</span>
            </span>
          )}
          {isDirty && (
            <span
              className="theme-tab-modified-badge"
              data-testid="theme-tab-modified-count"
              aria-label={`${modifiedCount} Variable${modifiedCount === 1 ? '' : 'n'} vom Ausgangswert abgeändert`}
            >
              {modifiedCount} {modifiedCount === 1 ? 'Variable' : 'Variablen'} abgeändert
            </span>
          )}
        </div>
        <div className="theme-tab-editor-actions">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            data-testid="theme-tab-preview-link"
            title='Öffnet die Kalenderseite in einem neuen Tab. Sie sieht die aktuellen Editor-Werte live — auch bevor du auf „Aktivieren" klickst.'
          >
            <ExternalLink size={16} aria-hidden="true" />
            <span>Kalender-Vorschau öffnen</span>
          </a>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleActivate}
            disabled={!canActivate}
            data-testid="theme-tab-activate"
          >
            {actionPending ? (
              <Loader2 size={16} className="spin" aria-hidden="true" />
            ) : (
              <Check size={16} aria-hidden="true" />
            )}
            <span>Aktivieren</span>
          </button>
          {isLoadedSavedTheme && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSaveLoaded}
              disabled={!canSaveLoaded}
              data-testid="theme-tab-save-loaded"
            >
              <Save size={16} aria-hidden="true" />
              <span>Speichern</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSaveDialogOpen(true)}
            disabled={!canSaveAsNew}
            data-testid="theme-tab-save-as-new"
          >
            <Save size={16} aria-hidden="true" />
            <span>Als neues Theme speichern</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDiscard}
            disabled={!canDiscard}
            data-testid="theme-tab-discard"
          >
            <Undo2 size={16} aria-hidden="true" />
            <span>Verwerfen</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirmResetAll(true)}
            disabled={!isAdmin || !isDirty}
            data-testid="theme-tab-reset-all"
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>Auf Standard zurücksetzen</span>
          </button>
        </div>
      </div>

      {pendingError && (
        <div className="theme-tab-error" role="alert" data-testid="theme-tab-form-error">
          {pendingError}
        </div>
      )}
      {actionSuccess && (
        <div className="theme-tab-success" role="status" data-testid="theme-tab-action-success">
          <Check size={16} aria-hidden="true" />
          <span>{actionSuccess}</span>
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
                const currentValue = editorValues[variable.name] || variable.defaultValue;
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
          <h3>Diese Karte verwendet die aktuellen Editor-Werte</h3>
          <p>
            Was du oben änderst, siehst du sofort hier. Erst ein Klick auf{' '}
            <strong>Aktivieren</strong> macht die Farben für alle Besucher sichtbar.
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

      <section className="theme-tab-library" data-testid="theme-tab-library">
        <header className="theme-tab-library-header">
          <h2 className="theme-tab-library-title">
            <Palette size={18} aria-hidden="true" />
            <span>Gespeicherte Themes</span>
            <span className="theme-tab-library-count" data-testid="theme-tab-library-count">
              {themes.length}
            </span>
          </h2>
        </header>
        {themes.length === 0 ? (
          <div className="theme-tab-library-empty" data-testid="theme-tab-library-empty">
            <Inbox size={32} aria-hidden="true" />
            <p>
              Noch keine gespeicherten Themes. Bearbeite oben die Farben und klicke anschließend auf{' '}
              <strong>Als neues Theme speichern</strong>, um das erste Theme anzulegen.
            </p>
          </div>
        ) : (
          <ul className="theme-tab-library-list" data-testid="theme-tab-library-list">
            {themes.map((theme) => {
              const isActive = theme.id === activeThemeId;
              const isEditingThisName = renamingId === theme.id;
              return (
                <li
                  key={theme.id}
                  className={`theme-library-row${isActive ? ' theme-library-row--active' : ''}`}
                  data-testid="theme-library-row"
                  data-theme-id={theme.id}
                  data-active={isActive || undefined}
                >
                  <div className="theme-library-row-swatch" aria-hidden="true">
                    <span
                      className="theme-library-row-swatch-dot"
                      style={{ backgroundColor: theme.values['--accent-primary'] }}
                    />
                    <span
                      className="theme-library-row-swatch-dot"
                      style={{ backgroundColor: theme.values['--accent-secondary'] }}
                    />
                    <span
                      className="theme-library-row-swatch-dot"
                      style={{ backgroundColor: theme.values['--heading-color'] }}
                    />
                    <span
                      className="theme-library-row-swatch-dot"
                      style={{ backgroundColor: theme.values['--bg-secondary'] }}
                    />
                  </div>
                  <div className="theme-library-row-info">
                    {isEditingThisName ? (
                      <form
                        className="theme-library-row-rename"
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleCommitRename(theme.id);
                        }}
                        data-testid="theme-library-rename-form"
                      >
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          maxLength={50}
                          autoFocus
                          disabled={actionPending}
                          aria-label="Theme-Name"
                          data-testid="theme-library-rename-input"
                        />
                        <button
                          type="submit"
                          className="theme-library-row-rename-confirm"
                          disabled={actionPending || !renameDraft.trim()}
                          aria-label="Umbenennen bestätigen"
                          data-testid="theme-library-rename-confirm"
                        >
                          <Check size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="theme-library-row-rename-cancel"
                          onClick={handleCancelRename}
                          disabled={actionPending}
                          aria-label="Abbrechen"
                          data-testid="theme-library-rename-cancel"
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <div className="theme-library-row-name-row">
                        <span
                          className="theme-library-row-name"
                          data-testid="theme-library-row-name"
                        >
                          {theme.name}
                        </span>
                        {isActive && (
                          <span
                            className="theme-library-row-active-badge"
                            data-testid="theme-library-row-active-badge"
                          >
                            aktiv
                          </span>
                        )}
                      </div>
                    )}
                    {theme.description && !isEditingThisName && (
                      <span
                        className="theme-library-row-description"
                        data-testid="theme-library-row-description"
                      >
                        {theme.description}
                      </span>
                    )}
                    {renamingError && isEditingThisName && (
                      <span
                        className="theme-library-row-rename-error"
                        role="alert"
                        data-testid="theme-library-rename-error"
                      >
                        {renamingError}
                      </span>
                    )}
                  </div>
                  <div className="theme-library-row-actions">
                    <button
                      type="button"
                      className="theme-library-row-action"
                      onClick={() => handleLoadTheme(theme.id)}
                      disabled={!isAdmin || actionPending}
                      aria-label={`Theme ${theme.name} in den Editor laden`}
                      data-testid="theme-library-row-load"
                    >
                      <Eye size={16} aria-hidden="true" />
                      <span>Laden</span>
                    </button>
                    <button
                      type="button"
                      className="theme-library-row-action"
                      onClick={() => handleActivateSavedTheme(theme.id)}
                      disabled={!isAdmin || actionPending || isActive}
                      aria-label={`Theme ${theme.name} aktivieren`}
                      data-testid="theme-library-row-activate"
                    >
                      <Check size={16} aria-hidden="true" />
                      <span>Aktivieren</span>
                    </button>
                    <button
                      type="button"
                      className="theme-library-row-action"
                      onClick={() => handleStartRename(theme)}
                      disabled={!isAdmin || actionPending || isEditingThisName}
                      aria-label={`Theme ${theme.name} umbenennen`}
                      data-testid="theme-library-row-rename"
                    >
                      <Pencil size={16} aria-hidden="true" />
                      <span>Umbenennen</span>
                    </button>
                    <button
                      type="button"
                      className="theme-library-row-action theme-library-row-action--danger"
                      onClick={() => setThemePendingDelete(theme)}
                      disabled={!isAdmin || actionPending || isEditingThisName}
                      aria-label={`Theme ${theme.name} löschen`}
                      data-testid="theme-library-row-delete"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span>Löschen</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ThemeTokenInfoDialog token={infoToken} onClose={() => setInfoToken(null)} />

      <ConfirmDialog
        isOpen={confirmResetAll}
        title="Alle Theme-Variablen auf Standard zurücksetzen?"
        confirmLabel="Zurücksetzen"
        cancelLabel="Abbrechen"
        danger
        onConfirm={handleResetAll}
        onCancel={() => setConfirmResetAll(false)}
      >
        <p>
          Dadurch werden alle {modifiedCount}{' '}
          {modifiedCount === 1 ? 'geänderte Variable' : 'geänderten Variablen'} im Editor auf den
          Standardwert zurückgesetzt. Noch nicht aktivierte Änderungen gehen dabei verloren.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={Boolean(themePendingDelete)}
        title="Theme löschen?"
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        danger
        loading={actionPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setThemePendingDelete(null)}
      >
        {themePendingDelete && (
          <p>
            Soll das Theme <strong>&bdquo;{themePendingDelete.name}&ldquo;</strong> wirklich
            gelöscht werden? Diese Aktion lässt sich nicht rückgängig machen.
            {themePendingDelete.id === activeThemeId && (
              <>
                <br />
                <br />
                <AlertTriangle
                  size={16}
                  aria-hidden="true"
                  style={{ verticalAlign: 'middle', marginRight: 6 }}
                />
                Achtung: Dieses Theme ist aktuell aktiv. Nach dem Löschen bleibt die zuletzt
                aktivierte Farb-Konfiguration auf der Website sichtbar, aber es ist keinem
                gespeicherten Theme mehr zugeordnet.
              </>
            )}
          </p>
        )}
      </ConfirmDialog>

      <SaveThemeDialog
        open={saveDialogOpen}
        loading={actionPending}
        defaultName={
          isLoadedSavedTheme
            ? `${editorBase.name} (Kopie)`
            : activeThemeName
              ? `${activeThemeName} (Kopie)`
              : ''
        }
        onSave={handleSaveAsNew}
        onClose={() => {
          if (!actionPending) setSaveDialogOpen(false);
        }}
      />
    </div>
  );
}
