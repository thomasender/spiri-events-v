import { useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useImportOrganizers, useImportRuns } from '../hooks/useImportData';
import { getStaffAccess } from '../utils/staffRoles';
import { IMPORT_REGION_IDS } from '../utils/eventImport';
import { STATIC_REGIONS } from '../utils/regions';
import ImportCandidates from './ImportCandidates';
import ImportOrganizers from './ImportOrganizers';
import './ModerationTab.css';
import './ImportTab.css';

const VIEWS = [
  { id: 'candidates', label: 'Kandidaten' },
  { id: 'organizers', label: 'Veranstalter' },
  { id: 'runs', label: 'Läufe' },
];

function regionLabel(id) {
  return STATIC_REGIONS.find((r) => r.id === id)?.name ?? id;
}

function formatTime(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('de-AT') : '–';
}

function RunsView({ runs, loading, error }) {
  return (
    <div data-testid="import-runs">
      {error && (
        <p className="moderation-error" role="alert">
          Läufe konnten nicht geladen werden.
        </p>
      )}
      {!loading && !error && runs.length === 0 && (
        <p className="moderation-empty">Noch keine Läufe.</p>
      )}
      <ul className="moderation-list">
        {runs.map((run) => {
          const errors = Array.isArray(run.errors) ? run.errors : [];
          return (
            <li key={run.id} className="moderation-card import-card" data-testid="import-run">
              <div className="import-card-main">
                <div className="import-card-title">
                  <span className="moderation-card-name">
                    {regionLabel(run.region)} · {run.source ?? '–'}
                  </span>
                  <span className="import-badge">{formatTime(run.startedAt)}</span>
                  {errors.length > 0 && (
                    <span className="import-badge import-badge--bad">{errors.length} Fehler</span>
                  )}
                </div>
                <p className="import-counts">
                  {run.counts && typeof run.counts === 'object'
                    ? Object.entries(run.counts)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ')
                    : '–'}
                </p>
                {errors.length > 0 && (
                  <ul className="import-errors">
                    {errors.slice(0, 5).map((e, i) => (
                      <li key={i}>
                        {typeof e === 'string' ? e : (e?.message ?? JSON.stringify(e))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Super-Admin tab: curated event import (docs/event-import.md, "Admin tab").
export default function ImportTab() {
  const { role, staffRegionIds } = useAuth();
  const isSuperAdmin = getStaffAccess(role, staffRegionIds).isSuperAdmin;
  const [view, setView] = useState('candidates');
  const [regionId, setRegionId] = useState(IMPORT_REGION_IDS[0]);
  const runs = useImportRuns(isSuperAdmin);
  const organizers = useImportOrganizers(regionId, isSuperAdmin);

  // The pilot regions plus every region that has a run.
  const regionIds = useMemo(() => {
    const extra = runs.items
      .map((r) => r.region)
      .filter((id) => id && !IMPORT_REGION_IDS.includes(id));
    return [...IMPORT_REGION_IDS, ...new Set(extra)];
  }, [runs.items]);
  const organizersById = useMemo(
    () => Object.fromEntries(organizers.items.map((o) => [o.id, o])),
    [organizers.items]
  );

  if (!isSuperAdmin) return null;

  return (
    <div className="moderation-tab import-tab" data-testid="import-tab">
      <p className="moderation-intro">
        Hier prüfst du Events, die auf den Websites von Veranstalter:innen gefunden wurden, und
        steuerst die einmalige Anfrage um Erlaubnis. Nichts davon ist öffentlich, bevor die
        Veranstalter:in zugestimmt hat.
      </p>

      <div className="import-toolbar">
        <label className="import-region">
          Region
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            data-testid="import-region"
          >
            {regionIds.map((id) => (
              <option key={id} value={id}>
                {regionLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <div className="import-views" role="tablist" aria-label="Ansicht">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={`import-filter-btn${view === v.id ? ' import-filter-btn--active' : ''}`}
              data-testid={`import-view-${v.id}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'candidates' && (
        <ImportCandidates regionId={regionId} organizersById={organizersById} />
      )}
      {view === 'organizers' && (
        <ImportOrganizers
          regionId={regionId}
          organizers={organizers.items}
          loading={organizers.loading}
          error={organizers.error}
        />
      )}
      {view === 'runs' && <RunsView runs={runs.items} loading={runs.loading} error={runs.error} />}
    </div>
  );
}
