import { useId, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useRegions } from '../hooks/useRegions';
import { useRegionModerators } from '../hooks/useRegionModerators';
import { useRegionActivation } from '../hooks/useRegionActivation';
import {
  COUNTRIES,
  COUNTRY_LABELS,
  DEFAULT_REGION_ID,
  getSubdivisionLabel,
  getSubdivisionLabelPlural,
  isPopulated,
} from '../utils/regions';
import { getStaffAccess } from '../utils/staffRoles';
import {
  regionActivationErrorMessage,
  unmetConditionTexts,
  unmetFromError,
} from '../utils/regionActivation';
import { searchCultureRegions } from '../utils/cultureRegionSearch';
import ConfirmDialog from './ConfirmDialog';
import './ModerationTab.css';
import './CultureRegionPicker.css';
import './RegionsTab.css';

function personLabel(person) {
  return person?.displayName || person?.email || 'Unbekannte Person';
}

// Germany: only Kulturregionen are activated; the Bundesländer (`home`) stay as the
// invisible technical fallback. There are many, so only the active ones are listed and
// the rest is found through this search (region name or one of its Landkreise).
function CultureRegionSearch({ regions, onPick }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const hits = useMemo(
    () =>
      searchCultureRegions(
        regions,
        (id) => (regions.find((r) => r.id === id)?.bezirke ?? []).map((name) => ({ name })),
        query
      ),
    [regions, query]
  );
  const choose = (hit) => {
    onPick(hit.region.id);
    setQuery('');
    setActive(0);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };
  return (
    <div className="culture-search" data-testid="regions-search">
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Kulturregion oder Landkreis suchen"
        placeholder="Kulturregion oder Landkreis suchen …"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {hits.length > 0 && (
        <ul id={listId} role="listbox" className="culture-search-list">
          {hits.map((hit, i) => (
            <li
              key={hit.region.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(hit);
              }}
            >
              <strong>{hit.region.name}</strong>
              {hit.via && <span> · {hit.via}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Super-Admin tab: which regions are visible to visitors. Switching goes
// through the callable adminSetRegionActive, which checks the role and the
// conditions (moderator, upcoming events) again on the server and keeps an
// audit log. Vorarlberg always stays active.
export default function RegionsTab() {
  const { role, staffRegionIds } = useAuth();
  const isSuperAdmin = getStaffAccess(role, staffRegionIds).isSuperAdmin;
  const { regions: registry } = useRegions();
  // Regions without Landkreise / Bezirke cannot go live; they appear once some are assigned.
  // The Bundesländer of Germany are not regions to activate (Kulturregionen are).
  const regions = useMemo(
    () => registry.filter((r) => isPopulated(r) && !(r.country === 'DE' && r.home)),
    [registry]
  );
  // Kulturregionen picked through the search, shown next to the active ones.
  const [picked, setPicked] = useState(() => new Set());
  const { moderators } = useRegionModerators(isSuperAdmin);
  const { statuses, minUpcomingEvents, loading, error, reload, setActive } =
    useRegionActivation(isSuperAdmin);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  // Accordion per country: countries with an active region start open.
  const [openCountries, setOpenCountries] = useState(
    () => new Set(COUNTRIES.filter((c) => regions.some((r) => r.country === c && r.active)))
  );
  const toggleCountry = (country) =>
    setOpenCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.regionId, s])), [statuses]);

  if (!isSuperAdmin) return null;

  const run = async (region, active, override) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await setActive(region.id, active, override);
      setConfirm(null);
      setNotice({
        kind: 'success',
        text:
          result?.changed === false
            ? `${region.name} war schon ${active ? 'freigeschaltet' : 'deaktiviert'}.`
            : active
              ? `${region.name} ist jetzt freigeschaltet und für alle sichtbar.`
              : `${region.name} ist deaktiviert. Besucher sehen dort jetzt „kommt bald“.`,
      });
    } catch (err) {
      const unmet = active && !override ? unmetFromError(err) : null;
      if (unmet) {
        // The server saw unmet conditions the list did not show yet: ask.
        setConfirm({ kind: 'unmet', region, status: unmet });
      } else {
        setConfirm(null);
        setNotice({ kind: 'error', text: regionActivationErrorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  };

  const activate = (region) => {
    const status = statusById.get(region.id);
    if (status?.unmet?.length) {
      setNotice(null);
      setConfirm({ kind: 'unmet', region, status: { ...status, minUpcomingEvents } });
      return;
    }
    run(region, true, false);
  };

  const unmetTexts =
    confirm?.kind === 'unmet'
      ? unmetConditionTexts(confirm.status, confirm.status.minUpcomingEvents ?? minUpcomingEvents)
      : [];

  return (
    <div className="moderation-tab regions-tab" data-testid="regions-tab">
      <p className="moderation-intro">
        Hier schaltest du Regionen für Besucher frei. Eine Region braucht mindestens eine:n
        Moderator:in und {minUpcomingEvents} kommende Events (ohne Online-Events). Vorarlberg bleibt
        immer aktiv.
      </p>

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
          {regionActivationErrorMessage(error)}{' '}
          <button type="button" className="btn btn-secondary" onClick={reload}>
            Erneut versuchen
          </button>
        </div>
      )}

      <div className="regions-groups">
        {COUNTRIES.map((country) => {
          const inCountry = regions.filter((r) => r.country === country);
          if (inCountry.length === 0) return null;
          const isOpen = openCountries.has(country);
          const activeCount = inCountry.filter((r) => r.active).length;
          const searchOnly = country === 'DE';
          const shown = searchOnly
            ? inCountry.filter((r) => r.active || picked.has(r.id))
            : inCountry;
          const panelId = `regions-group-${country}`;
          return (
            <section
              key={country}
              className="regions-group"
              data-testid={`regions-group-${country}`}
            >
              <h3 className="regions-group-heading">
                <button
                  type="button"
                  className="regions-group-toggle"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleCountry(country)}
                >
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`regions-group-chevron${isOpen ? ' regions-group-chevron--open' : ''}`}
                  />
                  <span className="regions-group-name">{COUNTRY_LABELS[country]}</span>
                  <span
                    className="regions-group-count"
                    data-testid={`regions-group-count-${country}`}
                  >
                    {inCountry.length} {searchOnly ? 'Kulturregionen' : 'Regionen'}, {activeCount}{' '}
                    aktiv
                  </span>
                </button>
              </h3>
              {isOpen && searchOnly && (
                <>
                  <CultureRegionSearch
                    regions={inCountry}
                    onPick={(id) => setPicked((prev) => new Set(prev).add(id))}
                  />
                  {shown.length === 0 && (
                    <p className="moderation-hint">
                      Noch keine Kulturregion aktiv. Suche oben nach einer Region.
                    </p>
                  )}
                </>
              )}
              {isOpen && (
                <ul
                  id={panelId}
                  className="moderation-list"
                  aria-label={`Regionen ${COUNTRY_LABELS[country]}`}
                >
                  {shown.map((region) => {
                    const status = statusById.get(region.id);
                    const regionModerators = moderators.filter((m) =>
                      m.regionIds?.includes(region.id)
                    );
                    const bezirkeCount = region.bezirke?.length ?? 0;
                    const bezirkeLabel =
                      bezirkeCount === 1
                        ? getSubdivisionLabel(region.id, regions)
                        : getSubdivisionLabelPlural(region.id, regions);
                    const isPermanent = region.id === DEFAULT_REGION_ID;
                    return (
                      <li
                        key={region.id}
                        className="moderation-card regions-card"
                        data-testid={`region-row-${region.id}`}
                      >
                        <div className="moderation-card-person">
                          <span className="moderation-card-name">{region.name}</span>
                          <span
                            className={`regions-status${region.active ? ' regions-status--active' : ''}`}
                            data-testid="region-status"
                          >
                            {region.active ? 'aktiv' : 'noch nicht aktiv'}
                          </span>
                        </div>
                        <dl className="regions-facts">
                          <div>
                            <dt>Moderator:innen</dt>
                            <dd data-testid="region-moderators">
                              {regionModerators.length}
                              {regionModerators.length > 0 &&
                                ` (${regionModerators.map(personLabel).join(', ')})`}
                            </dd>
                          </div>
                          <div>
                            <dt>Kommende Events</dt>
                            <dd data-testid="region-upcoming">
                              {status ? status.upcomingEventCount : loading ? '…' : '–'}
                            </dd>
                          </div>
                          <div>
                            <dt>{bezirkeLabel}</dt>
                            <dd>{bezirkeCount}</dd>
                          </div>
                          <div>
                            <dt>Kontakt</dt>
                            <dd data-testid="region-contact">{region.contactEmail || '–'}</dd>
                          </div>
                        </dl>
                        <div className="moderation-card-actions">
                          {region.active ? (
                            <button
                              type="button"
                              className="btn btn-subtle-danger btn-sm"
                              disabled={isPermanent || busy}
                              title={isPermanent ? 'Vorarlberg bleibt immer aktiv.' : undefined}
                              onClick={() => {
                                setNotice(null);
                                setConfirm({ kind: 'deactivate', region });
                              }}
                              aria-label={`${region.name} deaktivieren`}
                            >
                              Deaktivieren
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy}
                              onClick={() => activate(region)}
                              aria-label={`${region.name} freischalten`}
                            >
                              Freischalten
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={confirm?.kind === 'unmet'}
        title={`${confirm?.region?.name ?? 'Region'} trotzdem freischalten?`}
        confirmLabel="Trotzdem freischalten"
        cancelLabel="Abbrechen"
        onConfirm={() => run(confirm.region, true, true)}
        onCancel={() => setConfirm(null)}
        loading={busy}
      >
        <p>Für diese Region sind noch nicht alle Voraussetzungen erfüllt:</p>
        <ul data-testid="region-unmet-list">
          {unmetTexts.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p>Wenn du sie trotzdem freischaltest, ist sie sofort für alle Besucher sichtbar.</p>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={confirm?.kind === 'deactivate'}
        danger
        title={`${confirm?.region?.name ?? 'Region'} deaktivieren?`}
        confirmLabel="Deaktivieren"
        cancelLabel="Abbrechen"
        onConfirm={() => run(confirm.region, false, false)}
        onCancel={() => setConfirm(null)}
        loading={busy}
      >
        <p>Die Region ist danach für Besucher nicht mehr sichtbar, es erscheint „kommt bald“.</p>
      </ConfirmDialog>
    </div>
  );
}
