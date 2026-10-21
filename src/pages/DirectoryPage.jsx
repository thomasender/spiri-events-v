import { useEffect, useMemo, useState } from 'react';
import { EVENTS, trackEvent } from '../lib/analytics';
import { trackFilter } from '../lib/analyticsEvents';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Search, SlidersHorizontal, X } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import { useAuth } from '../hooks/useAuth';
import { useDirectory } from '../hooks/useDirectory';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { getCategoryColor } from '../utils/categoryColors';
import AvatarImage from '../components/AvatarImage';
import DirectMessageLink from '../components/messenger/DirectMessageLink';
import OnlineDot from '../components/OnlineDot';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useMessengerAccess } from '../hooks/useChatSettings';
import {
  DIRECTORY_REGIONS,
  buildDirectoryParams,
  countFacet,
  filterDirectoryEntries,
  formatBioPreview,
  parseDirectoryParams,
  shuffleDirectoryEntries,
  toggleValue,
} from '../utils/directory';
import '../components/DirectoryListingFields.css';
import './DirectoryPage.css';

function DirectoryCard({ entry, colorByName, isAdmin, canMessage, status, onToggleHidden, busy }) {
  const initial = (entry.displayName || '?').charAt(0).toUpperCase();
  return (
    <li
      className={`directory-card${entry.hidden ? ' directory-card--hidden' : ''}`}
      data-testid="directory-card"
    >
      <Link to={`/${entry.slug}`} className="directory-card-link">
        <div className="directory-card-avatar">
          {entry.photoURL ? (
            <AvatarImage
              src={entry.photoURL}
              alt=""
              className="directory-card-photo"
              focalPoint={entry.photoFocalPoint}
              zoom={entry.photoZoom}
            />
          ) : (
            <div
              className="directory-card-photo directory-card-photo--placeholder"
              aria-hidden="true"
            >
              {initial}
            </div>
          )}
          <OnlineDot status={status} />
        </div>
        <div className="directory-card-body">
          <h2 className="directory-card-name">{entry.displayName}</h2>
          {entry.regions.length > 0 && (
            <p className="directory-card-regions">{entry.regions.join(' · ')}</p>
          )}
          {entry.bio && <p className="directory-card-bio">{formatBioPreview(entry.bio)}</p>}
          <ul className="directory-card-categories" aria-label="Kategorien">
            {entry.categories.map((name) => (
              <li key={name} className="directory-card-category">
                <span
                  className="directory-card-category-dot"
                  style={{ backgroundColor: colorByName.get(name) || getCategoryColor(name) }}
                  aria-hidden="true"
                />
                {name}
              </li>
            ))}
          </ul>
        </div>
      </Link>
      {canMessage && (
        <div className="directory-card-dm">
          <DirectMessageLink uid={entry.uid} name={entry.displayName} variant="card" />
        </div>
      )}
      {isAdmin && (
        <div className="directory-card-admin">
          {entry.hidden && <span className="directory-card-admin-badge">Ausgeblendet</span>}
          <button
            type="button"
            className="btn btn-secondary directory-card-admin-btn"
            onClick={() => onToggleHidden(entry)}
            disabled={busy}
            data-testid="directory-toggle-hidden"
          >
            {entry.hidden ? (
              <>
                <Eye size={16} aria-hidden="true" />
                <span>Wieder anzeigen</span>
              </>
            ) : (
              <>
                <EyeOff size={16} aria-hidden="true" />
                <span>Ausblenden</span>
              </>
            )}
          </button>
        </div>
      )}
    </li>
  );
}

export default function DirectoryPage() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const { available: messengerOpen } = useMessengerAccess();
  const { statusOf } = useOnlineStatus();
  const { entries, loading, error, setHidden } = useDirectory();
  const { categories: registry, colorByName } = useCategoryRegistry();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busyUid, setBusyUid] = useState(null);
  const [moderationError, setModerationError] = useState('');

  const filters = useMemo(() => parseDirectoryParams(searchParams), [searchParams]);
  // search: only the length of the term is reported, after typing pauses.
  const queryLength = filters.query.trim().length;
  useEffect(() => {
    if (queryLength === 0) return undefined;
    const timer = window.setTimeout(
      () => trackEvent(EVENTS.SEARCH, { search_term_length: queryLength }),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [queryLength]);

  const countFilters = { ...filters, includeHidden: isAdmin };

  const updateFilters = (next) => {
    setSearchParams(buildDirectoryParams({ ...filters, ...next }), { replace: true });
  };

  const categoryCounts = useMemo(
    () => countFacet(entries, 'categories', countFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, filters.query, filters.regions, isAdmin]
  );
  const regionCounts = useMemo(
    () => countFacet(entries, 'regions', countFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, filters.query, filters.categories, isAdmin]
  );

  // Registry order first (admins curate it), then any category that is
  // listed on a profile but not in the registry. A chip stays visible while
  // selected even if its count dropped to zero so it can be switched off.
  const categoryOptions = useMemo(() => {
    const ordered = registry.map((cat) => cat.name);
    for (const name of categoryCounts.keys()) {
      if (!ordered.includes(name)) ordered.push(name);
    }
    return ordered.filter((name) => categoryCounts.has(name) || filters.categories.includes(name));
  }, [registry, categoryCounts, filters.categories]);

  const regionOptions = DIRECTORY_REGIONS.filter(
    (region) => regionCounts.has(region) || filters.regions.includes(region)
  );

  // New random order on every page load; stable while filtering.
  const [ranks] = useState(() => new Map());
  const results = useMemo(
    () => shuffleDirectoryEntries(filterDirectoryEntries(entries, countFilters), ranks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, filters.query, filters.categories, filters.regions, isAdmin]
  );

  const hasActiveFilters =
    filters.query.trim() !== '' || filters.categories.length > 0 || filters.regions.length > 0;
  const activeFilterCount = filters.categories.length + filters.regions.length;

  const handleToggleHidden = async (entry) => {
    setModerationError('');
    setBusyUid(entry.uid);
    try {
      await setHidden(entry.uid, !entry.hidden);
    } catch (err) {
      console.error('Directory moderation failed:', err);
      setModerationError('Das hat leider nicht geklappt. Bitte versuche es erneut.');
    } finally {
      setBusyUid(null);
    }
  };

  const renderChip = (value, selected, count, onClick, testId) => (
    <button
      key={value}
      type="button"
      className={`directory-chip${selected ? ' directory-chip--selected' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
      data-testid={testId}
    >
      <span>{value}</span>
      <span className="directory-chip-count">{count}</span>
    </button>
  );

  return (
    <>
      <SeoMeta
        title="Verzeichnis – Angebote in Vorarlberg"
        description="Finde Menschen mit bewussten Angeboten in Vorarlberg: nach Kategorie, Region oder Name durchsuchbar."
        path="/verzeichnis"
      />
      <div className="page-container directory-page" data-testid="directory-page">
        <header className="directory-header">
          <span className="directory-eyebrow">Verzeichnis</span>
          <h1 className="directory-title">Angebote &amp; Menschen finden</h1>
          <p className="directory-intro">
            Hier findest du Menschen mit bewussten Angeboten in Vorarlberg. Alle Details und
            Kontaktmöglichkeiten findest du auf dem jeweiligen Profil.
          </p>
          <Link
            to="/profil#verzeichnis"
            className="directory-top-cta"
            data-testid="directory-top-cta"
          >
            Du bietest etwas an? <strong>Trag dich in deinem Profil ein.</strong>
          </Link>
        </header>

        <section className="directory-controls" aria-label="Suche und Filter">
          <div className="directory-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={filters.query}
              onChange={(e) => updateFilters({ query: e.target.value })}
              placeholder="Name oder Angebot suchen…"
              aria-label="Verzeichnis durchsuchen"
              data-testid="directory-search"
            />
          </div>

          <button
            type="button"
            className="btn btn-secondary directory-filter-toggle"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="directory-filters"
            data-testid="directory-filter-toggle"
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>

          <div
            id="directory-filters"
            className={`directory-filters${filtersOpen ? ' directory-filters--open' : ''}`}
          >
            <div className="directory-filter-group" data-testid="directory-category-filters">
              <h2 className="directory-filter-title">Kategorie</h2>
              <div className="directory-chip-row">
                {categoryOptions.map((name) =>
                  renderChip(
                    name,
                    filters.categories.includes(name),
                    categoryCounts.get(name) || 0,
                    () => {
                      if (!filters.categories.includes(name)) trackFilter('category', name);
                      updateFilters({ categories: toggleValue(filters.categories, name) });
                    },
                    `directory-category-${name}`
                  )
                )}
              </div>
            </div>
            {regionOptions.length > 0 && (
              <div className="directory-filter-group" data-testid="directory-region-filters">
                <h2 className="directory-filter-title">Region</h2>
                <div className="directory-chip-row">
                  {regionOptions.map((region) =>
                    renderChip(
                      region,
                      filters.regions.includes(region),
                      regionCounts.get(region) || 0,
                      () => {
                        if (!filters.regions.includes(region)) trackFilter('region', region);
                        updateFilters({ regions: toggleValue(filters.regions, region) });
                      },
                      `directory-region-${region}`
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="directory-summary">
            <span data-testid="directory-count" aria-live="polite">
              {results.length === 1 ? '1 Eintrag' : `${results.length} Einträge`}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                className="directory-clear"
                onClick={() => setSearchParams({}, { replace: true })}
                data-testid="directory-clear"
              >
                <X size={14} aria-hidden="true" />
                <span>Alle Filter löschen</span>
              </button>
            )}
          </div>
        </section>

        {moderationError && <p className="submit-error">{moderationError}</p>}

        {loading ? (
          <div className="loading-spinner" data-testid="directory-loading" />
        ) : error ? (
          <p className="directory-message" data-testid="directory-error">
            Das Verzeichnis konnte gerade nicht geladen werden. Bitte versuche es später erneut.
          </p>
        ) : results.length === 0 ? (
          <div className="directory-message" data-testid="directory-empty">
            {entries.length === 0 ? (
              <p>Noch hat sich niemand ins Verzeichnis eingetragen.</p>
            ) : (
              <p>Keine Treffer für diese Auswahl. Versuche es mit weniger Filtern.</p>
            )}
            {hasActiveFilters && entries.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSearchParams({}, { replace: true })}
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        ) : (
          <ul className="directory-grid" data-testid="directory-list">
            {results.map((entry) => (
              <DirectoryCard
                key={entry.uid}
                entry={entry}
                colorByName={colorByName}
                isAdmin={isAdmin}
                onToggleHidden={handleToggleHidden}
                busy={busyUid === entry.uid}
                status={statusOf(entry.uid, entry.showOnlineStatus)}
                canMessage={messengerOpen && Boolean(user) && user.uid !== entry.uid}
              />
            ))}
          </ul>
        )}

        <p className="directory-cta">
          Du bietest etwas an? <Link to="/profil#verzeichnis">Trag dich in deinem Profil ein.</Link>
        </p>
      </div>
    </>
  );
}
