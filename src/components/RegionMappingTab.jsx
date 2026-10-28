import { useCallback, useMemo, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useRegions } from '../hooks/useRegions';
import {
  createRegionErrorMessage,
  regionMappingErrorMessage,
  useRegionMapping,
} from '../hooks/useRegionMapping';
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
 *
 * Germany (default): the 60 cultural regions, districts = Landkreise. Austria and Switzerland
 * (ticket 599): same flow with the Bundesländer / Kantone as the regions and the Bezirke as
 * districts (no cultural regions are defined there yet). A Bezirk taken out of a region
 * goes back to the Bundesland / Kanton it belongs to by origin.
 */
const COUNTRIES = [
  { id: 'DE', label: 'Deutschland' },
  { id: 'AT', label: 'Österreich' },
  { id: 'CH', label: 'Schweiz' },
];
const DISTRICT_WORDS = {
  DE: { one: 'Landkreis', many: 'Landkreise und Städte', add: 'Landkreis oder Stadt hinzufügen' },
  AT: { one: 'Bezirk', many: 'Bezirke', add: 'Bezirk hinzufügen' },
  CH: { one: 'Bezirk', many: 'Bezirke', add: 'Bezirk hinzufügen' },
};

export default function RegionMappingTab() {
  const { role, staffRegionIds } = useAuth();
  const isSuperAdmin = getStaffAccess(role, staffRegionIds).isSuperAdmin;
  const { regions } = useRegions();
  const { locks, loading, error, reload, save, rename, create } = useRegionMapping(isSuperAdmin);

  const [draft, setDraft] = useState(() => new Map()); // district key -> region id
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [focusId, setFocusId] = useState('');
  const [focusName, setFocusName] = useState('');
  const [addValue, setAddValue] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhrase, setNewPhrase] = useState('');
  const [country, setCountry] = useState('DE');
  const isGermany = country === 'DE';
  const words = DISTRICT_WORDS[country];

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
  // Region that holds a district with the draft applied (colours the Landkreis map).
  const holderOf = useCallback(
    (key) => draft.get(key) ?? baseAssignment.get(key),
    [draft, baseAssignment]
  );
  const changedKeys = useMemo(() => new Set(draft.keys()), [draft]);
  const cultureRegions = useMemo(
    () => regions.filter((r) => r.country === country && (country !== 'DE' || !r.home)),
    [regions, country]
  );

  if (!isSuperAdmin) return null;

  // Districts that still sit in their Bundesland, i.e. in no cultural region yet (compared
  // with the current data: only the Bundesland fallback). The Bundesland is not shown as a
  // group, only its name as a small label.
  const unassigned = isGermany
    ? DISTRICT_CATALOG.filter((d) => d.country === 'DE' && regionById.get(holderOf(d.key))?.home)
    : [];

  const focusRegion = focusId ? regionById.get(focusId) : null;
  const focusDistricts = focusRegion ? districtsOf(focusRegion.id) : [];
  const canRenameFocus =
    !busy && focusRegion && focusName.trim() && focusName.trim() !== focusRegion.name;
  // Districts that can be added to the picked region: Germany, not already in it. A name
  // typed or chosen from the list that matches exactly stages the move.
  const addOptions = focusRegion
    ? DISTRICT_CATALOG.filter((d) => d.country === country && !focusDistricts.includes(d))
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
  const selectCountry = (id) => {
    setCountry(id);
    setFocusId('');
    setFocusName('');
    setAddValue('');
    setNotice(null);
  };
  const selectRegion = (id) => {
    setFocusId(id);
    setFocusName(regionById.get(id)?.name ?? '');
    setAddValue('');
  };
  // A click on a Landkreis of the map: added to the picked region (as a draft), like the
  // "hinzufügen" field. Without a picked region it picks the region that holds it.
  const onDistrictClick = (key) => {
    const holder = holderOf(key);
    if (!focusRegion) {
      if (cultureRegions.some((r) => r.id === holder)) selectRegion(holder);
      return;
    }
    if (busy || holder === focusRegion.id) return;
    if (locks[key]) {
      setNotice({
        kind: 'error',
        text: `${CATALOG_BY_KEY.get(key)?.name ?? key} hat schon Events und bleibt in seiner Region.`,
      });
      return;
    }
    stageKeys([key], focusRegion.id);
  };
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

  const doCreate = async () => {
    const name = newName.trim();
    setBusy(true);
    setNotice(null);
    try {
      const created = await create({ name, country, inPhrase: newPhrase.trim() });
      setNewName('');
      setNewPhrase('');
      setFocusId(created.regionId);
      setFocusName(created.name);
      setAddValue('');
      setNotice({
        kind: 'success',
        text: `Die Region „${created.name}“ ist angelegt. Ordne ihr jetzt ${words.many} zu. Freigeschaltet wird sie danach im Tab „Regionen“.`,
      });
    } catch (err) {
      console.error('Creating region failed:', err);
      setNotice({ kind: 'error', text: createRegionErrorMessage(err) });
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

      <div
        className="mapping-countries"
        role="group"
        aria-label="Land"
        data-testid="mapping-countries"
      >
        {COUNTRIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`btn ${country === c.id ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={country === c.id}
            onClick={() => selectCountry(c.id)}
            data-testid={`mapping-country-${c.id}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <details className="mapping-new-region" data-testid="new-region">
        <summary>
          <strong>Neue Region anlegen</strong> ({COUNTRIES.find((c) => c.id === country).label})
        </summary>
        <form
          className="mapping-move"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim().length >= 2 && !busy) doCreate();
          }}
        >
          <label className="mapping-field">
            <span>Name der neuen Region</span>
            <input
              type="text"
              value={newName}
              maxLength={60}
              placeholder="z. B. Allgäu"
              onChange={(e) => setNewName(e.target.value)}
              data-testid="new-region-name"
            />
          </label>
          <label className="mapping-field">
            <span>So steht es in Texten (optional)</span>
            <input
              type="text"
              value={newPhrase}
              maxLength={80}
              placeholder={newName.trim() ? `in ${newName.trim()}` : 'z. B. im Allgäu'}
              onChange={(e) => setNewPhrase(e.target.value)}
              data-testid="new-region-phrase"
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={newName.trim().length < 2 || busy}
            data-testid="new-region-save"
          >
            Region anlegen
          </button>
        </form>
        <p className="moderation-hint">
          Die neue Region ist leer und noch nicht sichtbar. Sie wird dem oben gewählten Land
          zugeordnet. Danach ordnest du ihr {words.many} zu und schaltest sie im Tab „Regionen“
          frei.
        </p>
      </details>

      <section className="culture-layout" data-testid="culture-section">
        <CultureRegionPicker
          country={country}
          regions={cultureRegions}
          districtsOf={districtsOf}
          holderOf={holderOf}
          selectedId={focusId}
          changedKeys={changedKeys}
          onSelect={selectRegion}
          onDistrictClick={onDistrictClick}
        />
        {focusRegion ? (
          <div className="culture-panel" data-testid="culture-panel">
            <h3>{focusRegion.name}</h3>
            {(isGermany || focusRegion.custom) && (
              <form
                className="mapping-move"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canRenameFocus) doRename(focusRegion.id, focusName);
                }}
              >
                <label className="mapping-field">
                  <span>{isGermany ? 'Name der Kulturregion' : 'Name der Region'}</span>
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
            )}
            <strong>
              {focusDistricts.length}{' '}
              {isGermany
                ? `${focusDistricts.length === 1 ? 'Landkreis' : 'Landkreise'} und Städte`
                : focusDistricts.length === 1
                  ? 'Bezirk'
                  : 'Bezirke'}
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
                    {d.stateSlug !== focusRegion.id && (
                      <button
                        type="button"
                        disabled={busy || Boolean(locks[d.key])}
                        title={locks[d.key] ? 'Hier gibt es schon Events' : undefined}
                        onClick={() => unstageKeys([d.key])}
                        aria-label={`${d.name} aus der Region nehmen`}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    )}
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
                <span>{words.add}</span>
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
            {isGermany
              ? 'Wähle eine Kulturregion über die Suche oder mit einem Klick auf einen ihrer Landkreise.'
              : `Wähle ${country === 'AT' ? 'ein Bundesland' : 'einen Kanton'} über die Suche oder mit einem Klick auf einen seiner Bezirke.`}
          </p>
        )}
      </section>

      {isGermany && (
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
      )}

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
