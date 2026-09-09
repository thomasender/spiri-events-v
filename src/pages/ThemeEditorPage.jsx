import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Loader2,
  Palette,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useThemeSettings } from '../hooks/useThemeSettings';
import ColorPicker from '../components/ColorPicker';
import ThemeEditorSandbox from '../components/ThemeEditorSandbox';
import ThemeTokenInfoDialog from '../components/ThemeTokenInfoDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import SaveThemeDialog from '../components/SaveThemeDialog';
import SeoMeta from '../components/SeoMeta';
import './ThemeEditorPage.css';

// Theme Editor v2 — a full-page workspace that pairs a sandboxed color
// editor (left sidebar) with a live calendar preview (right). Replaces
// the old single-column `<ThemeTab />` workflow while keeping the same
// hook-driven backend so existing data, security rules, and tests are
// untouched.
//
// Layout:
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │  Top bar:  ← Verwaltung · Theme Editor · Aktiv: <name>      │
//   ├──────────────────────────────────────────────────────────────┤
//   │  Editor bar:  Quelle: X · N Variablen abgeändert            │
//   │               [Aktivieren][Speichern][Als neu speichern]…  │
//   ├────────────────┬─────────────────────────────────────────────┤
//   │  Sidebar (360) │  Sandbox (Calendar live preview)            │
//   │  ▾ Surfaces    │  ┌────────────────────────────────────────┐ │
//   │    row · row   │  │  Live-Vorschau · Demo-Events           │ │
//   │  ▾ Brand       │  │  ┌──────────────────────────────────┐  │ │
//   │    row · row   │  │  │  Calendar grid                   │  │ │
//   │  ▸ Text        │  │  │                                  │  │ │
//   │  ▸ UI          │  │  │                                  │  │ │
//   │  ▸ Signals     │  │  └──────────────────────────────────┘  │ │
//   │                │  └────────────────────────────────────────┘ │
//   │  Saved themes  │                                             │
//   │  ▸ row · row   │                                             │
//   └────────────────┴─────────────────────────────────────────────┘
//
// The sidebar is intentionally narrow so the sandbox gets the lion's
// share of horizontal space — the calendar grid is the primary preview
// surface and shouldn't be cramped.
export default function ThemeEditorPage() {
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
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [libraryOpen, setLibraryOpen] = useState(true);

  // Auto-clearing success toast.
  useEffect(() => {
    if (!actionSuccess) return undefined;
    const t = setTimeout(() => setActionSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [actionSuccess]);

  // Broadcast every editor change so any open preview window keeps in
  // sync (mirrors the existing ThemeTab behaviour — see
  // `useThemeSettings.js` for the BroadcastChannel contract).
  useEffect(() => {
    broadcastEditorValues(editorValues);
  }, [editorValues, broadcastEditorValues]);

  // ── Editor handlers ────────────────────────────────────────────────

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

  const handleResetAll = useCallback(() => {
    setPendingError(null);
    try {
      resetAllToDefaults();
      setConfirmResetAll(false);
    } catch (err) {
      setPendingError(err.message || 'Zurücksetzen fehlgeschlagen.');
    }
  }, [resetAllToDefaults]);

  const handleActivate = useCallback(async () => {
    setPendingError(null);
    setActionSuccess(null);
    setActionPending(true);
    try {
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

  const toggleGroup = useCallback((group) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const modifiedVariables = useMemo(
    () =>
      groupedVariables
        .flatMap((g) => g.variables)
        .filter((v) => isModified(v.name))
        .map((v) => v.name),
    [groupedVariables, isModified]
  );

  // ── Render gates ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="theme-editor-page" data-testid="theme-editor-page-loading">
        <div className="theme-editor-loading">
          <Loader2 size={28} className="theme-editor-loading-spinner" aria-hidden="true" />
          <p>Theme wird geladen…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="theme-editor-page" data-testid="theme-editor-page-error">
        <div className="theme-editor-error" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <div>
            <h2>Theme konnte nicht geladen werden</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-editor-page" data-testid="theme-editor-page">
      <SeoMeta title="Theme Editor" path="/admin/theme-editor" noindex />

      {/* Top bar — workspace identity + back link + active theme */}
      <header className="theme-editor-topbar" data-testid="theme-editor-topbar">
        <div className="theme-editor-topbar-left">
          <Link to="/admin" className="theme-editor-back-link" data-testid="theme-editor-back-link">
            ← Zurück zur Verwaltung
          </Link>
          <h1 className="theme-editor-title">
            <Palette size={20} aria-hidden="true" />
            <span>Theme Editor</span>
          </h1>
        </div>
        <div className="theme-editor-active">
          <Palette size={16} aria-hidden="true" />
          <span className="theme-editor-active-label">Aktiv auf der Website:</span>
          <span
            className={`theme-editor-active-name${activeThemeId ? '' : ' theme-editor-active-name--placeholder'}`}
            data-testid="theme-editor-active-theme-name"
          >
            {activeThemeLabel}
          </span>
        </div>
      </header>

      {/* Editor action bar */}
      <div className="theme-editor-editor-bar" data-testid="theme-editor-editor-bar">
        <div className="theme-editor-editor-source">
          <span className="theme-editor-editor-source-label">Editor-Quelle:</span>
          {isLoadedSavedTheme ? (
            <span
              className="theme-editor-editor-source-value"
              data-testid="theme-editor-editor-source"
            >
              <Pencil size={14} aria-hidden="true" />
              <span>{editorBase.name}</span>
              {loadedThemeIsActive && <span className="theme-editor-editor-source-tag">aktiv</span>}
            </span>
          ) : (
            <span
              className="theme-editor-editor-source-value theme-editor-editor-source-value--active"
              data-testid="theme-editor-editor-source"
            >
              <Palette size={14} aria-hidden="true" />
              <span>Aktives Theme</span>
            </span>
          )}
          {isDirty && (
            <span
              className="theme-editor-modified-badge"
              data-testid="theme-editor-modified-count"
              aria-label={`${modifiedCount} Variable${modifiedCount === 1 ? '' : 'n'} vom Ausgangswert abgeändert`}
            >
              {modifiedCount} {modifiedCount === 1 ? 'Variable' : 'Variablen'} abgeändert
            </span>
          )}
        </div>
        <div className="theme-editor-editor-actions">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            data-testid="theme-editor-preview-link"
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
            data-testid="theme-editor-activate"
          >
            <Check size={16} aria-hidden="true" />
            <span>Aktivieren</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSaveLoaded}
            disabled={!canSaveLoaded}
            data-testid="theme-editor-save"
          >
            <Save size={16} aria-hidden="true" />
            <span>Speichern</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSaveDialogOpen(true)}
            disabled={!canSaveAsNew}
            data-testid="theme-editor-save-as-new"
          >
            <Pencil size={16} aria-hidden="true" />
            <span>Als neues Theme speichern</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDiscard}
            disabled={!canDiscard}
            data-testid="theme-editor-discard"
          >
            <Undo2 size={16} aria-hidden="true" />
            <span>Verwerfen</span>
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setConfirmResetAll(true)}
            disabled={!isAdmin || actionPending}
            data-testid="theme-editor-reset-all"
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>Auf Standard zurücksetzen</span>
          </button>
        </div>
      </div>

      {(pendingError || actionSuccess) && (
        <div className="theme-editor-banner-row" data-testid="theme-editor-banner-row">
          {pendingError && (
            <div className="theme-editor-banner theme-editor-banner--error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{pendingError}</span>
            </div>
          )}
          {actionSuccess && (
            <div className="theme-editor-banner theme-editor-banner--success" role="status">
              <Check size={16} aria-hidden="true" />
              <span>{actionSuccess}</span>
            </div>
          )}
        </div>
      )}

      {/* Main two-column workspace: sidebar editor + sandbox preview */}
      <div className="theme-editor-workspace" data-testid="theme-editor-workspace">
        <aside className="theme-editor-sidebar" data-testid="theme-editor-sidebar">
          <div className="theme-editor-sidebar-intro">
            <p>
              Bearbeite die Farben des Design-Systems. Jede Änderung wirkt sich sofort auf die
              Live-Vorschau rechts aus. Erst ein Klick auf <strong>Aktivieren</strong> macht sie für
              alle Besucher sichtbar.
            </p>
          </div>

          {groupedVariables.map((group) => {
            const isCollapsed = collapsedGroups.has(group.group);
            return (
              <section
                key={group.group}
                className="theme-editor-group"
                data-testid="theme-editor-group"
              >
                <button
                  type="button"
                  className="theme-editor-group-header"
                  onClick={() => toggleGroup(group.group)}
                  aria-expanded={!isCollapsed}
                  data-testid="theme-editor-group-toggle"
                >
                  {isCollapsed ? (
                    <ChevronRight size={16} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={16} aria-hidden="true" />
                  )}
                  <span>{group.group}</span>
                  <span className="theme-editor-group-count" data-testid="theme-editor-group-count">
                    {group.variables.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="theme-editor-group-body" data-testid="theme-editor-group-body">
                    {group.variables.map((variable) => (
                      <div
                        key={variable.name}
                        className="theme-editor-row"
                        data-testid="theme-editor-row"
                        data-variable-name={variable.name}
                        data-modified={isModified(variable.name) ? 'true' : 'false'}
                      >
                        <div className="theme-editor-row-label">
                          <span
                            className="theme-editor-row-swatch"
                            style={{ backgroundColor: editorValues[variable.name] }}
                            aria-hidden="true"
                          />
                          <div className="theme-editor-row-text">
                            <span className="theme-editor-row-title">{variable.label}</span>
                            <code className="theme-editor-row-name">{variable.name}</code>
                          </div>
                        </div>
                        <div className="theme-editor-row-controls">
                          <ColorPicker
                            value={editorValues[variable.name]}
                            onChange={(value) => handleChange(variable.name, value)}
                            id={`theme-editor-row-${variable.name}`}
                            label={variable.label}
                          />
                          <button
                            type="button"
                            className="theme-editor-row-btn"
                            onClick={() => setInfoToken(variable)}
                            title="Verwendung anzeigen"
                            data-testid="theme-editor-row-info"
                            aria-label={`Verwendung von ${variable.label} anzeigen`}
                          >
                            <Info size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="theme-editor-row-btn"
                            onClick={() => handleReset(variable.name)}
                            disabled={!isModified(variable.name)}
                            title="Auf Standard zurücksetzen"
                            data-testid="theme-editor-row-reset"
                            aria-label={`${variable.label} auf Standard zurücksetzen`}
                          >
                            <RotateCcw size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {/* Saved themes library — collapsible panel at sidebar bottom */}
          <section className="theme-editor-library" data-testid="theme-editor-library">
            <button
              type="button"
              className="theme-editor-group-header"
              onClick={() => setLibraryOpen((prev) => !prev)}
              aria-expanded={libraryOpen}
              data-testid="theme-editor-library-toggle"
            >
              {libraryOpen ? (
                <ChevronDown size={16} aria-hidden="true" />
              ) : (
                <ChevronRight size={16} aria-hidden="true" />
              )}
              <span>Gespeicherte Themes</span>
              <span className="theme-editor-group-count">{themes.length}</span>
            </button>
            {libraryOpen && (
              <div className="theme-editor-library-body">
                {themes.length === 0 ? (
                  <p className="theme-editor-library-empty">
                    Noch keine Themes gespeichert. Bearbeite die Farben und klicke auf{' '}
                    <strong>Als neues Theme speichern</strong>, um deine Konfiguration dauerhaft
                    abzulegen.
                  </p>
                ) : (
                  <ul className="theme-editor-library-list">
                    {themes.map((theme) => {
                      const isActive = theme.id === activeThemeId;
                      const isRenaming = renamingId === theme.id;
                      return (
                        <li
                          key={theme.id}
                          className="theme-editor-library-row"
                          data-testid="theme-editor-library-row"
                          data-theme-id={theme.id}
                          data-active={isActive ? 'true' : 'false'}
                        >
                          <div className="theme-editor-library-swatches" aria-hidden="true">
                            {[
                              '--bg-primary',
                              '--accent-primary',
                              '--accent-secondary',
                              '--accent-soft',
                            ].map((token) => (
                              <span key={token} style={{ backgroundColor: theme.values[token] }} />
                            ))}
                          </div>
                          <div className="theme-editor-library-meta">
                            {isRenaming ? (
                              <form
                                className="theme-editor-library-rename"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleCommitRename(theme.id);
                                }}
                              >
                                <input
                                  type="text"
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  maxLength={50}
                                  aria-label="Theme-Name"
                                  data-testid="theme-editor-library-rename-input"
                                />
                                <button
                                  type="submit"
                                  className="btn btn-primary btn-sm"
                                  data-testid="theme-editor-library-rename-save"
                                  disabled={actionPending}
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={handleCancelRename}
                                  data-testid="theme-editor-library-rename-cancel"
                                >
                                  Abbrechen
                                </button>
                              </form>
                            ) : (
                              <>
                                <div className="theme-editor-library-name-row">
                                  <span className="theme-editor-library-name">{theme.name}</span>
                                  {isActive && (
                                    <span
                                      className="theme-editor-library-tag"
                                      data-testid="theme-editor-library-active-tag"
                                    >
                                      aktiv
                                    </span>
                                  )}
                                </div>
                                {theme.description && (
                                  <span className="theme-editor-library-description">
                                    {theme.description}
                                  </span>
                                )}
                              </>
                            )}
                            {renamingError && isRenaming && (
                              <span className="theme-editor-library-rename-error" role="alert">
                                {renamingError}
                              </span>
                            )}
                          </div>
                          {!isRenaming && (
                            <div className="theme-editor-library-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleLoadTheme(theme.id)}
                                data-testid="theme-editor-library-load"
                                title="In den Editor laden"
                              >
                                Laden
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleActivateSavedTheme(theme.id)}
                                disabled={isActive || actionPending}
                                data-testid="theme-editor-library-activate"
                                title="Auf der Website aktivieren"
                              >
                                Aktivieren
                              </button>
                              <button
                                type="button"
                                className="theme-editor-row-btn"
                                onClick={() => handleStartRename(theme)}
                                disabled={actionPending}
                                data-testid="theme-editor-library-rename"
                                title="Umbenennen"
                                aria-label={`${theme.name} umbenennen`}
                              >
                                <Pencil size={16} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="theme-editor-row-btn theme-editor-row-btn--danger"
                                onClick={() => setThemePendingDelete(theme)}
                                disabled={actionPending}
                                data-testid="theme-editor-library-delete"
                                title="Löschen"
                                aria-label={`${theme.name} löschen`}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        </aside>

        <section className="theme-editor-preview" data-testid="theme-editor-preview">
          <div className="theme-editor-preview-header">
            <h2 className="theme-editor-preview-title">Live-Vorschau</h2>
            <p className="theme-editor-preview-subtitle">
              {modifiedVariables.length === 0 ? (
                <>Alle Werte entsprechen dem Ausgangstheme.</>
              ) : (
                <>
                  {modifiedVariables.length} Variable
                  {modifiedVariables.length === 1 ? '' : 'n'} weichen vom Ausgangswert ab.
                </>
              )}
            </p>
          </div>
          <ThemeEditorSandbox values={editorValues} />
        </section>
      </div>

      {infoToken && (
        <ThemeTokenInfoDialog
          token={infoToken}
          currentValue={editorValues[infoToken.name]}
          onClose={() => setInfoToken(null)}
        />
      )}

      {saveDialogOpen && (
        <SaveThemeDialog
          open={saveDialogOpen}
          onClose={() => setSaveDialogOpen(false)}
          onSave={handleSaveAsNew}
          loading={actionPending}
        />
      )}

      {confirmResetAll && (
        <ConfirmDialog
          isOpen={confirmResetAll}
          title="Alle Variablen zurücksetzen?"
          message="Setzt jede Farbe auf den Standardwert zurück. Bereits gespeicherte Themes bleiben unverändert."
          confirmLabel="Zurücksetzen"
          cancelLabel="Abbrechen"
          danger
          onConfirm={() => {
            handleResetAll();
          }}
          onCancel={() => setConfirmResetAll(false)}
        />
      )}

      {themePendingDelete && (
        <ConfirmDialog
          isOpen={!!themePendingDelete}
          title={`Theme „${themePendingDelete.name}" löschen?`}
          message="Dieses Theme wird dauerhaft aus der Bibliothek entfernt. Wenn es gerade aktiv ist, wird die Verknüpfung aufgehoben."
          confirmLabel="Löschen"
          cancelLabel="Abbrechen"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setThemePendingDelete(null)}
        />
      )}
    </div>
  );
}
