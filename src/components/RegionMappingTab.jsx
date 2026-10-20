import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useRegions } from '../hooks/useRegions';
import { regionMappingErrorMessage, useRegionMapping } from '../hooks/useRegionMapping';
import {
  COUNTRIES,
  COUNTRY_LABELS,
  DE_MACRO_REGIONS,
  getSubdivisionLabelPlural,
} from '../utils/regions';
import {
  DISTRICT_CATALOG,
  currentAssignment,
  mappingErrorMessage,
  planMappingChange,
} from '../utils/regionMapping';
import { foldSearchText } from '../utils/regionSearch';
import { getStaffAccess } from '../utils/staffRoles';
import ConfirmDialog from './ConfirmDialog';
import './ModerationTab.css';
import './RegionMappingTab.css';

// Target choices for the move: Germany grouped (cultural regions by Grossregion, the
// Bundeslaender in their own group), the other countries as one flat list.
function regionGroups(country, regions, countOf) {
  const inCountry = regions.filter((r) => r.country === country);
  const option = (r) => ({ id: r.id, label: `${r.name} (${countOf(r)})` });
  if (country !== 'DE') {
    return [{ label: 'Regionen', options: inCountry.map(option) }];
  }
  const groups = DE_MACRO_REGIONS.map((macro) => ({
    label: `Kulturregionen – ${macro}`,
    options: inCountry.filter((r) => !r.home && r.macro === macro).map(option),
  }));
  groups.push({
    label: 'Bundesländer (Ausgangsstruktur)',
    options: inCountry.filter((r) => r.home).map(option),
  });
  return groups.filter((g) => g.options.length > 0);
}

// Only Germany is regrouped for now (cultural regions). Austria stays Bundesland -> Bezirk
// and Switzerland stays Kanton -> Bezirk. (The server would accept them; only this tab
// hides them.) With more than one country the switcher appears again.
const MAPPING_COUNTRIES = COUNTRIES.filter((c) => c === 'DE');

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
  const { locks, loading, error, reload, save } = useRegionMapping(isSuperAdmin);

  const [country, setCountry] = useState('DE');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [target, setTarget] = useState('');
  const [draft, setDraft] = useState(() => new Map()); // district key -> region id
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [openStates, setOpenStates] = useState(() => new Set());

  const baseAssignment = useMemo(() => currentAssignment(regions), [regions]);
  const moves = useMemo(
    () => [...draft].map(([districtKey, toRegionId]) => ({ districtKey, toRegionId })),
    [draft]
  );
  const plan = useMemo(() => planMappingChange(regions, moves), [regions, moves]);
  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  // Districts per region after the draft is applied.
  const countByRegion = useMemo(() => {
    const counts = new Map(regions.map((r) => [r.id, (r.bezirke ?? []).length]));
    for (const c of plan.changes) counts.set(c.regionId, c.after.length);
    return counts;
  }, [regions, plan]);
  const countOf = (r) => {
    const n =
      (countByRegion.get(r.id) ?? 0) - (r.bezirke ?? []).filter((b) => b === 'Grenznahe').length;
    return n;
  };

  if (!isSuperAdmin) return null;

  const effectiveRegionId = (key) => draft.get(key) ?? baseAssignment.get(key);
  const districts = DISTRICT_CATALOG.filter((d) => d.country === country);
  const states = [...new Map(districts.map((d) => [d.stateSlug, d.stateName]))];
  const query = foldSearchText(search);
  const visible = districts.filter(
    (d) =>
      (!stateFilter || d.stateSlug === stateFilter) &&
      (!regionFilter || effectiveRegionId(d.key) === regionFilter) &&
      (!query || foldSearchText(d.name).includes(query))
  );
  const byState = states
    .map(([slug, name]) => ({ slug, name, items: visible.filter((d) => d.stateSlug === slug) }))
    .filter((g) => g.items.length > 0);
  const selectable = (d) => !locks[d.key];
  const subdivisionPlural = getSubdivisionLabelPlural(
    regions.find((r) => r.country === country)?.id,
    regions
  );
  const groups = regionGroups(country, regions, countOf);

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // One toggle: selects everything shown, or clears it when all of it is selected.
  const visibleKeys = visible.filter(selectable).map((d) => d.key);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const toggleVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of visibleKeys) {
        if (allVisibleSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  // Bundesland sections are folded; they open on their own while a filter is active.
  const filtering = Boolean(query || stateFilter || regionFilter);
  const toggleOpenState = (slug, open) =>
    setOpenStates((prev) => {
      const next = new Set(prev);
      if (open) next.add(slug);
      else next.delete(slug);
      return next;
    });

  const changeCountry = (next) => {
    setCountry(next);
    setStateFilter('');
    setRegionFilter('');
    setSearch('');
    setSelected(new Set());
    setTarget('');
  };

  const stage = () => {
    if (!target || selected.size === 0) return;
    setNotice(null);
    setDraft((prev) => {
      const next = new Map(prev);
      for (const key of selected) {
        if (baseAssignment.get(key) === target) next.delete(key);
        else next.set(key, target);
      }
      return next;
    });
    setSelected(new Set());
  };

  const discard = () => {
    setDraft(new Map());
    setSelected(new Set());
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
      <p className="moderation-intro">
        Hier legst du fest, welche Landkreise und Bezirke zu welcher Region gehören. Wähle Einträge
        aus, wähle die Region und merke die Änderung vor. Erst mit „Zuordnung speichern“ gilt sie
        für alle.
      </p>

      <div className="mapping-info" data-testid="mapping-info">
        <section className="mapping-info-card">
          <h3>Das kannst du</h3>
          <ul>
            <li>
              Landkreise und Bezirke einer anderen Region im selben Land zuordnen, auch über
              Bundesland-Grenzen hinweg (z. B. Tauberfranken).
            </li>
            <li>
              Viele auf einmal verschieben: mit Suche, Filter und „Alle angezeigten auswählen“.
            </li>
            <li>Änderungen erst vormerken, prüfen und dann speichern, oder alles verwerfen.</li>
            <li>Eine Zuordnung später wieder ändern, solange es dort keine Events gibt.</li>
            <li>Eine Region leer machen: Besucher sehen sie dann nicht mehr.</li>
          </ul>
        </section>
        <section className="mapping-info-card">
          <h3>Das geht nicht</h3>
          <ul>
            <li>Landkreise anlegen, umbenennen oder löschen. Sie sind fest vorgegeben.</li>
            <li>
              Einen Landkreis in zwei Regionen oder in gar keine Region stecken. Er gehört immer
              genau zu einer.
            </li>
            <li>Landkreise einer Region in einem anderen Land zuordnen.</li>
            <li>
              Österreich und die Schweiz umgruppieren: Dort bleibt es bei Bundesland bzw. Kanton und
              Bezirk. Hier gibt es nur Deutschland.
            </li>
            <li>
              Landkreise mit bestehenden Events verschieben (Schloss-Symbol). Ordne zu, bevor in
              einer Region Events angelegt werden.
            </li>
            <li>
              Einer aktiven Region alle Landkreise wegnehmen, oder eine Region ohne Landkreise
              freischalten.
            </li>
            <li>
              Neue Regionen anlegen oder umbenennen. Das macht das Technik-Team. Die Regionen aus
              deiner Liste sind schon angelegt.
            </li>
            <li>Die Karte zeigt die neuen Regionen noch nicht als eigene Fläche.</li>
          </ul>
        </section>
      </div>

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

      {MAPPING_COUNTRIES.length > 1 && (
        <div className="mapping-countries" role="group" aria-label="Land">
          {MAPPING_COUNTRIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`mapping-country${c === country ? ' mapping-country--active' : ''}`}
              aria-pressed={c === country}
              onClick={() => changeCountry(c)}
              data-testid={`mapping-country-${c}`}
            >
              {COUNTRY_LABELS[c]}
            </button>
          ))}
        </div>
      )}

      <div className="mapping-filters">
        <label className="mapping-field">
          <span>Suchen</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${subdivisionPlural} suchen`}
            data-testid="mapping-search"
          />
        </label>
        <label className="mapping-field">
          <span>
            {country === 'DE' ? 'Bundesland' : country === 'CH' ? 'Kanton' : 'Bundesland'}
          </span>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            data-testid="mapping-state-filter"
          >
            <option value="">Alle</option>
            {states.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="mapping-field">
          <span>Zugeordnet zu</span>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            data-testid="mapping-region-filter"
          >
            <option value="">Alle Regionen</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <div className="mapping-move" role="group" aria-label="Auswahl verschieben">
        <span className="mapping-selected" data-testid="mapping-selected" aria-live="polite">
          {selected.size} ausgewählt
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={toggleVisible}
          disabled={visibleKeys.length === 0}
          aria-pressed={allVisibleSelected}
          data-testid="mapping-toggle-all"
        >
          {allVisibleSelected ? 'Auswahl aufheben' : 'Alle angezeigten auswählen'}
        </button>
        <label className="mapping-field mapping-target">
          <span>Verschieben nach</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            data-testid="mapping-target"
          >
            <option value="">Region wählen …</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          onClick={stage}
          disabled={!target || selected.size === 0}
          data-testid="mapping-stage"
        >
          Vormerken
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

      {byState.length === 0 && <p className="moderation-hint">Keine passenden Einträge.</p>}
      {byState.map((group) => {
        const selectedHere = group.items.filter((d) => selected.has(d.key)).length;
        const movedHere = group.items.filter((d) => draft.has(d.key)).length;
        return (
          <details
            key={group.slug}
            className="mapping-state"
            data-testid={`mapping-state-${group.slug}`}
            open={filtering || openStates.has(group.slug) || undefined}
            onToggle={(e) => {
              if (!filtering) toggleOpenState(group.slug, e.currentTarget.open);
            }}
          >
            <summary className="mapping-state-summary">
              <span className="mapping-state-name">{group.name}</span>
              <span className="mapping-count">({group.items.length})</span>
              {selectedHere > 0 && (
                <span className="mapping-state-note">{selectedHere} ausgewählt</span>
              )}
              {movedHere > 0 && <span className="mapping-state-note">{movedHere} neu</span>}
            </summary>
            <ul className="mapping-list">
              {group.items.map((d) => {
                const regionId = effectiveRegionId(d.key);
                const moved = draft.has(d.key);
                const locked = Boolean(locks[d.key]);
                return (
                  <li key={d.key} className={`mapping-item${moved ? ' mapping-item--moved' : ''}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(d.key)}
                        disabled={!selectable(d)}
                        onChange={() => toggle(d.key)}
                      />
                      <span className="mapping-name">{d.name}</span>
                    </label>
                    <span className="mapping-region" data-testid="mapping-region">
                      {regionById.get(regionId)?.name ?? '–'}
                      {moved && <span className="mapping-badge"> neu</span>}
                    </span>
                    {locked && (
                      <span className="mapping-lock" title="Hier gibt es schon Events">
                        <Lock size={14} aria-hidden="true" /> {locks[d.key]} Events
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}

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
