import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, RefreshCw, Search, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useModerationLog } from '../hooks/useModerationLog';
import { useRegionLabels } from '../hooks/useRegionLabels';
import { useRegionModerators } from '../hooks/useRegionModerators';
import { getStaffAccess } from '../utils/staffRoles';
import { FIELD_LABELS } from '../utils/eventFieldLabels';
import {
  ACTION_OPTIONS,
  DEFAULT_FILTERS,
  PERIOD_OPTIONS,
  WHO_ALL,
  WHO_TEAM,
  actionLabel,
  actionTone,
  actorDisplayName,
  buildLogQuerySpec,
  countByAction,
  entryAtMillis,
  formatLogTime,
  matchesLogSearch,
  nextSort,
  personOptions,
  roleLabel,
  sortLogEntries,
} from '../utils/moderationLog';
import './ModerationLogTab.css';

function formatEventDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

function SortHeader({ id, label, sort, onSort }) {
  const active = sort.key === id;
  return (
    <th aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="modlog-sort"
        onClick={() => onSort(id)}
        data-testid={`modlog-sort-${id}`}
      >
        {label}
        {active &&
          (sort.direction === 'asc' ? (
            <ArrowUp size={14} aria-hidden="true" />
          ) : (
            <ArrowDown size={14} aria-hidden="true" />
          ))}
      </button>
    </th>
  );
}

function EntryDetails({ entry }) {
  const fields = (entry.changedFields || []).map((f) => FIELD_LABELS[f] || f);
  return (
    <>
      {entry.reason && (
        <span className="modlog-detail" data-testid="modlog-reason">
          Begründung: {entry.reason}
        </span>
      )}
      {fields.length > 0 && (
        <span className="modlog-detail">
          Geändert: {fields.slice(0, 6).join(', ')}
          {fields.length > 6 ? ` und ${fields.length - 6} weitere` : ''}
        </span>
      )}
    </>
  );
}

/**
 * Super-Admin tab "Protokoll": who approved, rejected, edited, trashed,
 * restored or deleted which event when, across all regions. Data:
 * moderation_log (written by the event triggers). Region, person, action and
 * period filter on the server (page by page); text search and column sort
 * work on the loaded entries. Moderators keep the normal Review tab.
 */
export default function ModerationLogTab() {
  const { role, staffRegionIds } = useAuth();
  const isSuperAdmin = getStaffAccess(role, staffRegionIds).isSuperAdmin;
  const { multiRegion, nameOf, regions } = useRegionLabels();
  const { moderators } = useRegionModerators(isSuperAdmin);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'at', direction: 'desc' });
  const [refreshKey, setRefreshKey] = useState(0);

  // New Date() only when filters change or on "Aktualisieren", so the query
  // (and its key) stays stable between renders.
  const spec = useMemo(
    () => buildLogQuerySpec(filters, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, refreshKey]
  );
  const { entries, loading, loadingMore, error, hasMore, loadMore } = useModerationLog(spec, {
    enabled: isSuperAdmin,
    refreshKey,
  });

  const regionOptions = useMemo(
    () =>
      regions
        .filter((r) => r.active)
        .map((r) => ({ id: r.id, name: r.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de-AT')),
    [regions]
  );
  const persons = useMemo(() => personOptions(moderators, entries), [moderators, entries]);
  const helpers = useMemo(() => ({ regionName: nameOf }), [nameOf]);
  const visible = useMemo(
    () =>
      sortLogEntries(
        entries.filter((e) => matchesLogSearch(e, search, helpers)),
        sort,
        helpers
      ),
    [entries, search, sort, helpers]
  );
  const summary = useMemo(() => countByAction(visible), [visible]);

  if (!isSuperAdmin) return null;

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const filtersActive =
    search !== '' || Object.keys(DEFAULT_FILTERS).some((k) => filters[k] !== DEFAULT_FILTERS[k]);
  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearch('');
  };

  return (
    <div className="modlog-tab" data-testid="moderation-log-tab">
      <p className="modlog-intro">
        Wer hat wann welches Event genehmigt, abgelehnt, bearbeitet, in den Papierkorb gelegt,
        wiederhergestellt oder gelöscht{multiRegion ? ', über alle Regionen' : ''}. Nur für
        Super-Admins sichtbar; Moderator:innen arbeiten weiter im Tab „Review“.
      </p>

      <div className="modlog-toolbar">
        <label className="modlog-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            placeholder="Event, Person, Begründung suchen"
            aria-label="Protokoll durchsuchen"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="modlog-search"
          />
        </label>
        <select
          aria-label="Zeitraum"
          value={filters.period}
          onChange={(e) => setFilter('period', e.target.value)}
          data-testid="modlog-period"
        >
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {filters.period === 'custom' && (
          <>
            <label className="modlog-date">
              <span>von</span>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilter('from', e.target.value)}
                data-testid="modlog-from"
              />
            </label>
            <label className="modlog-date">
              <span>bis</span>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilter('to', e.target.value)}
                data-testid="modlog-to"
              />
            </label>
          </>
        )}
        <select
          aria-label="Nach Aktion filtern"
          value={filters.action}
          onChange={(e) => setFilter('action', e.target.value)}
          data-testid="modlog-action"
        >
          <option value="">Alle Aktionen</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        {multiRegion && (
          <select
            aria-label="Nach Region filtern"
            value={filters.regionId}
            onChange={(e) => setFilter('regionId', e.target.value)}
            data-testid="modlog-region"
          >
            <option value="">Alle Regionen</option>
            {regionOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Nach Person filtern"
          value={filters.actorUid}
          onChange={(e) => setFilter('actorUid', e.target.value)}
          data-testid="modlog-person"
        >
          <option value="">Alle Personen</option>
          {persons.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Wessen Aktionen"
          value={filters.who}
          onChange={(e) => setFilter('who', e.target.value)}
          disabled={Boolean(filters.actorUid)}
          data-testid="modlog-who"
        >
          <option value={WHO_TEAM}>Nur Team (Admins und Moderator:innen)</option>
          <option value={WHO_ALL}>Alle, auch Veranstalter:innen und System</option>
        </select>
        {filtersActive && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetFilters}
            data-testid="modlog-reset"
          >
            <X size={16} aria-hidden="true" />
            <span>Filter zurücksetzen</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setRefreshKey((n) => n + 1)}
          data-testid="modlog-refresh"
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span>Aktualisieren</span>
        </button>
      </div>

      {loading && <p className="modlog-muted">Protokoll wird geladen …</p>}
      {error && !loading && (
        <p className="modlog-error" role="alert" data-testid="modlog-error">
          Das Protokoll konnte nicht geladen werden. Bitte versuche es mit „Aktualisieren“ erneut.
        </p>
      )}

      {!loading && !error && (
        <>
          <p className="modlog-muted" data-testid="modlog-summary">
            {visible.length === entries.length
              ? `${entries.length} Einträge`
              : `${visible.length} von ${entries.length} geladenen Einträgen`}
            {hasMore ? ' (weitere vorhanden)' : ''}
            {summary.length > 0 && ': '}
            {summary.map((s) => `${s.count} ${s.label}`).join(' · ')}
          </p>

          {visible.length === 0 ? (
            <p className="modlog-empty" data-testid="modlog-empty">
              Keine Einträge für diese Auswahl.
            </p>
          ) : (
            <div className="modlog-table-wrap">
              <table className="modlog-table">
                <thead>
                  <tr>
                    <SortHeader
                      id="at"
                      label="Zeitpunkt"
                      sort={sort}
                      onSort={(k) => setSort(nextSort(sort, k))}
                    />
                    <SortHeader
                      id="action"
                      label="Aktion"
                      sort={sort}
                      onSort={(k) => setSort(nextSort(sort, k))}
                    />
                    <SortHeader
                      id="eventTitle"
                      label="Event"
                      sort={sort}
                      onSort={(k) => setSort(nextSort(sort, k))}
                    />
                    {multiRegion && (
                      <SortHeader
                        id="regionId"
                        label="Region"
                        sort={sort}
                        onSort={(k) => setSort(nextSort(sort, k))}
                      />
                    )}
                    <SortHeader
                      id="actor"
                      label="Wer"
                      sort={sort}
                      onSort={(k) => setSort(nextSort(sort, k))}
                    />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry) => {
                    const eventDate = formatEventDate(entry.eventDate);
                    return (
                      <tr key={entry.id} data-testid="modlog-row">
                        <td className="modlog-time">{formatLogTime(entryAtMillis(entry))}</td>
                        <td>
                          <span className={`modlog-chip modlog-chip--${actionTone(entry.action)}`}>
                            {actionLabel(entry.action)}
                          </span>
                        </td>
                        <td className="modlog-event">
                          {entry.action === 'deleted' ? (
                            <span className="modlog-event-title">
                              {entry.eventTitle || 'Ohne Titel'}
                            </span>
                          ) : (
                            <Link
                              className="modlog-event-title"
                              to={`/admin/edit/${entry.eventId}`}
                            >
                              {entry.eventTitle || 'Ohne Titel'}
                            </Link>
                          )}
                          {eventDate && <span className="modlog-detail">Termin: {eventDate}</span>}
                          <EntryDetails entry={entry} />
                        </td>
                        {multiRegion && (
                          <td>
                            <button
                              type="button"
                              className="modlog-link"
                              title="Nur diese Region zeigen"
                              onClick={() => setFilter('regionId', entry.regionId)}
                            >
                              {nameOf(entry.regionId)}
                            </button>
                          </td>
                        )}
                        <td>
                          {entry.actorUid ? (
                            <button
                              type="button"
                              className="modlog-link"
                              title="Nur diese Person zeigen"
                              onClick={() => setFilter('actorUid', entry.actorUid)}
                            >
                              {actorDisplayName(entry)}
                            </button>
                          ) : (
                            <span>{actorDisplayName(entry)}</span>
                          )}
                          {entry.actorRole !== 'System' && (
                            <span className="modlog-detail">{roleLabel(entry.actorRole)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && (
            <button
              type="button"
              className="btn btn-secondary modlog-more"
              onClick={loadMore}
              disabled={loadingMore}
              data-testid="modlog-more"
            >
              {loadingMore ? 'Wird geladen …' : 'Ältere Einträge laden'}
            </button>
          )}
          <p className="modlog-muted modlog-note">
            Aufgezeichnet wird jede Aktion ab Einführung dieses Protokolls. Ältere Aktionen sind nur
            enthalten, soweit sie sich aus dem Änderungsverlauf der Events nachvollziehen ließen.
          </p>
        </>
      )}
    </div>
  );
}
