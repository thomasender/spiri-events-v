import { useCallback, useMemo, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useRegions } from '../hooks/useRegions';
import { regionMappingErrorMessage, useRegionMapping } from '../hooks/useRegionMapping';
import {
  CATALOG_BY_KEY,
  DISTRICT_CATALOG,
  currentAssignment,
  mappingErrorMessage,
  planMappingChange,
} from '../utils/regionMapping';
import { suggestedMoves } from '../data/regionSuggestion';
import { getStaffAccess } from '../utils/staffRoles';
import ConfirmDialog from './ConfirmDialog';
import CultureRegionPicker from './CultureRegionPicker';
import './ModerationTab.css';
import './RegionMappingTab.css';

/**
 * Super-Admin tab "Zuordnung": which Landkreis / Bezirk belongs to which region.
 * The districts themselves are fixed (the backend structure); only the assignment
 * is editable. Changes are collected first ("Entwurf") and written together via
 * the callable adminSaveRegionMapping, which checks everything again on the server.
 * Districts that already have events are locked (events keep their region).
 */
export default function RegionMappingTab() {
  const { role, staffRegionIds } = useAuth();
  const isSuperAdmin = getStaffAccess(role, staffRegionIds).isSuperAdmin;
  const { regions } = useRegions();
  const { locks, loading, error, reload, save, rename } = useRegionMapping(isSuperAdmin);

  const [draft, setDraft] = useState(() => new Map()); // district key -> region id
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [focusId, setFocusId] = useState('');
  const [focusName, setFocusName] = useState('');
  const [addValue, setAddValue] = useState('');

  const baseAssignment = useMemo(() => currentAssignment(regions), [regions]);
  const moves = useMemo(
    () => [...draft].map(([districtKey, toRegionId]) => ({ districtKey, toRegionId })),
    [draft]
  );
  const plan = useMemo(() => planMappingChange(regions, moves), [regions, moves]);
  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  // Districts per region with the draft applied (feeds the map picker and its panel).
  const districtsByRegion = useMemo(() => {
    const byRegion = new Map();
    for (const d of DISTRICT_CATALOG) {
      const id = draft.get(d.key) ?? baseAssignment.get(d.key);
      if (!id) continue;
      if (!byRegion.has(id)) byRegion.set(id, []);
      byRegion.get(id).push(d);
    }
    return byRegion;
  }, [draft, baseAssignment]);
  const districtsOf = useCallback((id) => districtsByRegion.get(id) ?? [], [districtsByRegion]);
  const cultureRegions = useMemo(
    () => regions.filter((r) => r.country === 'DE' && !r.home),
    [regions]
  );

  if (!isSuperAdmin) return null;

  const effectiveRegionId = (key) => draft.get(key) ?? baseAssignment.get(key);
  // Districts that still sit in their Bundesland, i.e. in no cultural region yet (compared
  // with the current data: only the Bundesland fallback). The Bundesland is not shown as a
  // group, only its name as a small label.
  const unassigned = DISTRICT_CATALOG.filter(
    (d) => d.country === 'DE' && regionById.get(effectiveRegionId(d.key))?.home
  );

  const focusRegion = focusId ? regionById.get(focusId) : null;
  const focusDistricts = focusRegion ? districtsOf(focusRegion.id) : [];
  const canRenameFocus =
    !busy && focusRegion && focusName.trim() && focusName.trim() !== focusRegion.name;
  // Districts that can be added to the picked region: Germany, not already in it. A name
  // typed or chosen from the list that matches exactly stages the move.
  const addOptions = focusRegion
    ? DISTRICT_CATALOG.filter((d) => d.country === 'DE' && !focusDistricts.includes(d))
    : [];
  const addCandidate = addOptions.find((d) => d.name === addValue.trim()) ?? null;

  const stageKeys = (keys, regionId) => {
    if (!regionId || keys.length === 0) return;
    setNotice(null);
    setDraft((prev) => {
      const next = new Map(prev);
      for (const key of keys) {
        if (baseAssignment.get(key) === regionId) next.delete(key);
        else next.set(key, regionId);
      }
      return next;
    });
  };
  // "Aus der Region nehmen": the district goes back to its Bundesland, i.e. to "no cultural
  // region yet" (a district always belongs to exactly one region).
  const unstageKeys = (keys) => {
    setNotice(null);
    setDraft((prev) => {
      const next = new Map(prev);
      for (const key of keys) {
        const homeId = CATALOG_BY_KEY.get(key)?.stateSlug;
        if (!homeId) continue;
        if (baseAssignment.get(key) === homeId) next.delete(key);
        else next.set(key, homeId);
      }
      return next;
    });
  };

  // The prepared assignment (src/data/regionSuggestion.js) is only staged, like a manual
  // move: the admin reviews it, changes what does not fit and saves. Locked districts stay.
  const loadSuggestion = () => {
    const moves = suggestedMoves().filter((m) => !locks[m.districtKey]);
    setNotice(null);
    setDraft((prev) => {
      const next = new Map(prev);
      for (const { districtKey, toRegionId } of moves) {
        if (baseAssignment.get(districtKey) === toRegionId) next.delete(districtKey);
        else next.set(districtKey, toRegionId);
      }
      return next;
    });
  };

  const doRename = async (id, name) => {
    setBusy(true);
    setNotice(null);
    try {
      await rename(id, name);
      setNotice({ kind: 'success', text: 'Der Name ist geändert.' });
    } catch (err) {
      console.error('Renaming region failed:', err);
      setNotice({ kind: 'error', text: 'Das Umbenennen hat leider nicht geklappt.' });
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setDraft(new Map());
    setNotice(null);
  };

  const doSave = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await save(moves);
      setDraft(new Map());
      setConfirmOpen(false);
      setNotice({ kind: 'success', text: 'Die Zuordnung ist gespeichert.' });
    } catch (err) {
      setConfirmOpen(false);
      setNotice({ kind: 'error', text: regionMappingErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const errorTexts = plan.errors.map((e) => mappingErrorMessage(e, regions));
  const canSave = draft.size > 0 && plan.errors.length === 0 && !busy;

  return (
    <div className="moderation-tab mapping-tab" data-testid="mapping-tab">
      {notice && (
        <p
          className={notice.kind === 'error' ? 'moderation-error' : 'moderation-notice'}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}
      {!loading && error && (
        <div className="moderation-error" role="alert">
          {regionMappingErrorMessage(error)}{' '}
          <button type="button" className="btn btn-secondary" onClick={reload}>
            Erneut versuchen
          </button>
        </div>
      )}

      <section className="culture-layout" data-testid="culture-section">
        <CultureRegionPicker
          regions={cultureRegions}
          districtsOf={districtsOf}
          selectedId={focusId}
          onSelect={(id) => {
            setFocusId(id);
            setFocusName(regionById.get(id)?.name ?? '');
            setAddValue('');
          }}
        />
        {focusRegion ? (
          <div className="culture-panel" data-testid="culture-panel">
            <h3>{focusRegion.name}</h3>
            <form
              className="mapping-move"
              onSubmit={(e) => {
                e.preventDefault();
                if (canRenameFocus) doRename(focusRegion.id, focusName);
              }}
            >
              <label className="mapping-field">
                <span>Name der Kulturregion</span>
                <input
                  type="text"
                  value={focusName}
                  maxLength={100}
                  onChange={(e) => setFocusName(e.target.value)}
                  data-testid="culture-rename-name"
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canRenameFocus}
                data-testid="culture-rename-save"
              >
                Umbenennen
              </button>
            </form>
            <strong>
              {focusDistricts.length} {focusDistricts.length === 1 ? 'Landkreis' : 'Landkreise'} und
              Städte
            </strong>
            {focusDistricts.length === 0 ? (
              <p className="moderation-hint">Dieser Region ist nichts zugeordnet.</p>
            ) : (
              <ul className="culture-districts" data-testid="culture-districts">
                {focusDistricts.map((d) => (
                  <li key={d.key}>
                    <span>
                      {d.name} <span className="mapping-state-label">{d.stateName}</span>
                      {draft.has(d.key) && ' (neu)'}
                    </span>
                    <button
                      type="button"
                      disabled={busy || Boolean(locks[d.key])}
                      title={locks[d.key] ? 'Hier gibt es schon Events' : undefined}
                      onClick={() => unstageKeys([d.key])}
                      aria-label={`${d.name} aus der Region nehmen`}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mapping-move"
              onSubmit={(e) => {
                e.preventDefault();
                if (addCandidate) {
                  stageKeys([addCandidate.key], focusRegion.id);
                  setAddValue('');
                }
              }}
            >
              <label className="mapping-field">
                <span>Landkreis oder Stadt hinzufügen</span>
                <input
                  type="text"
                  list="culture-add-options"
                  autoComplete="off"
                  placeholder="Name eingeben …"
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                  data-testid="culture-add-input"
                />
                <datalist id="culture-add-options">
                  {addOptions.map((d) => (
                    <option key={d.key} value={d.name}>
                      {d.stateName}
                    </option>
                  ))}
                </datalist>
              </label>
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={!addCandidate || busy}
                data-testid="culture-add-save"
              >
                Hinzufügen
              </button>
            </form>
          </div>
        ) : (
          <p className="moderation-hint">
            Wähle eine Kulturregion auf der Karte oder über die Suche.
          </p>
        )}
      </section>

      <div className="mapping-suggestion">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={loadSuggestion}
          disabled={busy}
          data-testid="mapping-suggestion"
        >
          Vorschlag laden
        </button>
      </div>

      {draft.size > 0 && (
        <div className="mapping-draft" data-testid="mapping-draft">
          <strong>
            {draft.size} {draft.size === 1 ? 'Änderung' : 'Änderungen'} noch nicht gespeichert
          </strong>
          <ul>
            {plan.changes.map((c) => (
              <li key={c.regionId}>
                {c.name}: {c.added.length > 0 && `+${c.added.length}`}
                {c.added.length > 0 && c.removed.length > 0 && ' / '}
                {c.removed.length > 0 && `−${c.removed.length}`}
              </li>
            ))}
          </ul>
          {errorTexts.map((t) => (
            <p key={t} className="moderation-error" role="alert">
              {t}
            </p>
          ))}
          <div className="mapping-draft-actions">
            <button type="button" className="btn btn-secondary" onClick={discard} disabled={busy}>
              Verwerfen
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setConfirmOpen(true)}
              disabled={!canSave}
              data-testid="mapping-save"
            >
              Zuordnung speichern
            </button>
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <details className="mapping-unassigned" data-testid="mapping-unassigned" open>
          <summary>
            <strong>Noch ohne Region</strong>{' '}
            <span className="mapping-count">({unassigned.length})</span>
          </summary>
          <p className="moderation-hint">
            {focusRegion
              ? `Tippe auf einen Eintrag, um ihn zu „${focusRegion.name}“ hinzuzufügen.`
              : 'Wähle zuerst eine Kulturregion, dann tippe hier auf einen Eintrag.'}
          </p>
          <ul className="mapping-chips">
            {unassigned.map((d) => (
              <li key={d.key} data-testid="mapping-unassigned-item">
                <button
                  type="button"
                  className="mapping-chip"
                  disabled={!focusRegion || busy || Boolean(locks[d.key])}
                  title={locks[d.key] ? 'Hier gibt es schon Events' : undefined}
                  onClick={() => stageKeys([d.key], focusRegion.id)}
                >
                  {d.name} <span className="mapping-state-label">{d.stateName}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Zuordnung speichern?"
        message="Die Änderung gilt sofort. Besucher sehen die Landkreise dann in der neuen Region."
        confirmLabel="Speichern"
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
        loading={busy}
      >
        <ul className="mapping-summary">
          {plan.changes.map((c) => (
            <li key={c.regionId}>
              <strong>{c.name}</strong>
              {c.added.length > 0 && <div>+ {c.added.join(', ')}</div>}
              {c.removed.length > 0 && <div>− {c.removed.join(', ')}</div>}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}
