import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { bezirkLabel } from '../utils/regions';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { usePublicEvents, BEZIRKE, ONLINE_LOCATION } from '../hooks/useEvents';
import { useCategories } from '../hooks/useCategories';
import { useCategoryRegistry } from '../hooks/useCategoryRegistry';
import { useFavorites } from '../hooks/useFavorites';
import { useAuth } from '../hooks/useAuth';
import { useCalendarFeedToken } from '../hooks/useCalendarFeedToken';
import Calendar from '../components/Calendar';
import EventsSection from '../components/EventsSection';
import EmailVerificationModal from '../components/EmailVerificationModal';
import LoginPromptModal from '../components/LoginPromptModal';
import ConfirmDialog from '../components/ConfirmDialog';
import SeoMeta from '../components/SeoMeta';
import { getEventOccurrences } from '../utils/eventOccurrences';
import { copyToClipboard } from '../utils/copyToClipboard';
import { getCalendarCategories } from '../utils/calendarCategories';
import { compareEventsByDateTime } from '../utils/eventSort';
import { isOccurrencePast } from '../utils/pastEvents';
import { computeFacetCounts } from '../utils/filterFacetCounts';
import { resolveEventColor } from '../utils/categoryColors';
import { monthKeyToDate, dateToMonthKey } from '../utils/calendarFilterState';
import {
  DATE_FILTER_OPTIONS,
  applyDateFilter,
  getDateFilterMonthKey,
  isValidDateFilterId,
} from '../utils/dateQuickFilters';
import {
  MapPin,
  Sparkles,
  Users,
  ChevronDown,
  Check,
  Heart,
  PlusCircle,
  SlidersHorizontal,
  CalendarPlus,
  Copy,
  RefreshCw,
  Share,
} from 'lucide-react';
import './CalendarPage.css';
import { trackEventOpen, trackFilter } from '../lib/analyticsEvents';

const STORAGE_KEY = 'calendarFilterState';

const HERO_FEATURES = [
  {
    icon: MapPin,
    title: 'In deiner Umgebung',
    description: 'Für Vorarlberg und Umkreis',
  },
  {
    icon: Users,
    title: 'Für eine bewusste Community',
    description: 'Echt. Offen. Wertschätzend.',
  },
  {
    icon: Sparkles,
    title: 'Einfach & kostenlos',
    description: 'Finden. Teilen. Dabeisein.',
  },
  {
    icon: Sparkles,
    title: 'Tribe ist für alle da.',
    description: 'Ein Ort für Begegnung, Inspiration und echtes Miteinander.',
  },
];

const HERO_SLIDER_INTERVAL_MS = 4000;

// The four hero facts are grouped into two slides of two facts each so
// that on tablet+ viewports the slider can show two facts side by side.
// On phone-sized viewports CSS hides every fact beyond the first one in
// each slide, collapsing the row to a single fact. With two slides the
// rotation cycles every 8 s.
const HERO_FEATURE_PAIRS = [HERO_FEATURES.slice(0, 2), HERO_FEATURES.slice(2, 4)];

// Address of the user's personal iCal feed. Every selected Ort / Kategorie narrows it
// (repeated parameters; the server only accepts known values, so unknown Orte are left out).
// `token` is the user's secret calendar token: the feed is for signed-in users only and
// calendar apps cannot log in, so the server checks this instead (useCalendarFeedToken).
export function buildFeedUrl(origin, selectedOrte, selectedCategories, token) {
  const params = new URLSearchParams();
  const knownOrte = [...BEZIRKE, ONLINE_LOCATION];
  selectedOrte.filter((o) => knownOrte.includes(o)).forEach((o) => params.append('bezirk', o));
  selectedCategories.forEach((c) => params.append('kategorie', c));
  if (token) params.append('token', token);
  const query = params.toString();
  return `${origin}/calendar/feed.ics${query ? `?${query}` : ''}`;
}

// Opens Google Calendar's "add by URL" dialog with the feed prefilled.
export function buildGoogleCalendarUrl(webcalUrl) {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
}

function loadFilterState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed.currentMonth === 'string' && !monthKeyToDate(parsed.currentMonth)) {
      // Legacy ISO timestamp format is timezone-dependent and unreliable.
      // Reset to the current month so users land where they expect.
      delete parsed.currentMonth;
    } else if (parsed?.currentMonth) {
      // Past months are no longer navigable in the calendar — drop a stale
      // saved month so users don't load onto an empty calendar with the back
      // button disabled.
      const savedDate = monthKeyToDate(parsed.currentMonth);
      if (savedDate) {
        const now = new Date();
        const isPast =
          savedDate.getFullYear() < now.getFullYear() ||
          (savedDate.getFullYear() === now.getFullYear() && savedDate.getMonth() < now.getMonth());
        if (isPast) delete parsed.currentMonth;
      }
    }
    // Backwards compat: previous schema stored the location filter under
    // `selectedBezirke`. Migrate any saved selection forward to the new key.
    if (parsed && Array.isArray(parsed.selectedBezirke) && !parsed.selectedOrte) {
      parsed.selectedOrte = parsed.selectedBezirke;
      delete parsed.selectedBezirke;
    }
    // Drop any persisted date filter that doesn't match the current schema.
    if (parsed && !isValidDateFilterId(parsed.dateFilter)) {
      delete parsed.dateFilter;
    }
    return parsed;
  } catch {}
  return null;
}

function saveFilterState(state) {
  try {
    const date =
      state.currentMonth instanceof Date ? state.currentMonth : new Date(state.currentMonth);
    const toSave = {
      ...state,
      currentMonth: isNaN(date.getTime()) ? dateToMonthKey(new Date()) : dateToMonthKey(date),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
}

// Number of events a filter chip would show. Chips at 0 are dimmed via CSS
// (data-empty, see CalendarPage.css) but stay clickable so a stale filter can be undone.
function FacetCount({ value }) {
  return (
    <span className="filter-chip-count" data-testid="filter-chip-count" data-empty={value === 0}>
      {value}
    </span>
  );
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, canCreateEvents } = useAuth();
  // Load saved state exactly once per mount. Reading it inside the render body
  // would create a new object reference on every render and trip downstream
  // effects into re-doing work that depends on the initial values.
  const [savedState] = useState(() => loadFilterState());
  const registryCategories = useCategories();
  const [currentMonth, setCurrentMonth] = useState(
    monthKeyToDate(savedState?.currentMonth) || new Date()
  );
  const [selectedCategories, setSelectedCategories] = useState(
    savedState?.selectedCategories || []
  );
  const [selectedOrte, setSelectedOrte] = useState(savedState?.selectedOrte || []);
  const [dateFilter, setDateFilter] = useState(savedState?.dateFilter || null);
  const [onlyFavorites, setOnlyFavorites] = useState(savedState?.onlyFavorites === true);
  const { isSignedIn, favoriteIds } = useFavorites();
  // The filter only means something for signed-in users; for visitors it is
  // neither shown nor applied (a persisted flag must not hide every event).
  const favoritesFilterActive = onlyFavorites && isSignedIn;
  const { colorByName } = useCategoryRegistry();
  const [viewMode, setViewMode] = useState(savedState?.viewMode || 'card');
  // Auto-expand the "Mehr Filter" accordion when one of its inner filters is
  // already set (e.g. a user picked a Bezirk a week ago and forgot). Without
  // this they'd land on a filtered list with no visible cue that a filter is
  // active. We seed once at mount and then defer to the user — collapsing or
  // expanding the accordion after load is always under their control.
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(
    (savedState?.selectedOrte?.length ?? 0) > 0 || savedState?.onlyFavorites === true
  );
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const { events, loading, error } = usePublicEvents();
  // Only offer categories that currently have events (see calendarCategories.js).
  const categories = useMemo(
    () => getCalendarCategories(registryCategories, events, selectedCategories),
    [registryCategories, events, selectedCategories]
  );

  const [activeHeroPair, setActiveHeroPair] = useState(0);
  const heroSliderRef = useRef(null);

  // Auto-rotate the hero slides every HERO_SLIDER_INTERVAL_MS. Each slide
  // shows two facts on tablet+ viewports and a single fact on phone-sized
  // viewports (see CSS `.hero-feature-item:nth-child(n+2)`). Users cannot
  // swipe/click through the items by design — the slider is purely
  // presentational. prefers-reduced-motion disables the rotation.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReducedMotion) return undefined;

    const id = window.setInterval(() => {
      setActiveHeroPair((prev) => (prev + 1) % HERO_FEATURE_PAIRS.length);
    }, HERO_SLIDER_INTERVAL_MS);
    heroSliderRef.current = id;
    return () => {
      window.clearInterval(id);
      if (heroSliderRef.current === id) heroSliderRef.current = null;
    };
  }, []);

  // No auto-include of newly loaded categories: the filter starts on "Keine"
  // (selectedCategories === []), which shows every event because the
  // category match short-circuits on an empty selection. A user who wants to
  // see every category can hit the "Alle" button — surfacing new categories
  // silently would contradict the "one click to filter" promise of the UI.

  useEffect(() => {
    saveFilterState({
      currentMonth,
      selectedCategories,
      selectedOrte,
      dateFilter,
      onlyFavorites,
      viewMode,
    });
  }, [currentMonth, selectedCategories, selectedOrte, dateFilter, onlyFavorites, viewMode]);

  const handleEventClick = (event) => {
    const slugOrId = event.slug || event.id;
    trackEventOpen(event);
    navigate(`/event/${slugOrId}`);
  };

  const toggleCategory = (category) => {
    if (!selectedCategories.includes(category)) trackFilter('category', category);
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const selectAllCategories = useCallback(() => {
    setSelectedCategories(categories);
  }, [categories]);

  const selectNoneCategories = () => {
    setSelectedCategories([]);
  };

  const toggleOrt = (ort) => {
    if (!selectedOrte.includes(ort)) trackFilter('region', ort);
    setSelectedOrte((prev) =>
      prev.includes(ort) ? prev.filter((o) => o !== ort) : [...prev, ort]
    );
  };

  const selectAllOrte = () => {
    setSelectedOrte([...BEZIRKE, ONLINE_LOCATION]);
  };

  const selectNoneOrte = () => {
    setSelectedOrte([]);
  };

  const toggleDateFilter = (filterId) => {
    if (dateFilter !== filterId) trackFilter('date', filterId);
    setDateFilter((prev) => {
      const next = prev === filterId ? null : filterId;
      // When activating a date filter, jump the calendar sidebar to the month
      // the filter targets so the agenda and the sidebar stay in sync. When
      // clearing the filter, leave the current month untouched.
      if (next) {
        const monthKey = getDateFilterMonthKey(next);
        if (monthKey) {
          const target = monthKeyToDate(monthKey);
          if (target) setCurrentMonth(target);
        }
      }
      return next;
    });
  };

  const baseEvents = useMemo(
    () => (favoritesFilterActive ? events.filter((e) => favoriteIds.has(e.id)) : events),
    [events, favoritesFilterActive, favoriteIds]
  );

  const filteredEvents = useMemo(() => {
    return baseEvents.filter((event) => {
      const categoryMatch =
        selectedCategories.length === 0 ||
        (event.category && selectedCategories.includes(event.category));
      if (selectedOrte.length === 0) return categoryMatch;
      const eventOrtKey = event.isOnline ? ONLINE_LOCATION : event.bezirk;
      const ortMatch = selectedOrte.includes(eventOrtKey);
      return categoryMatch && ortMatch;
    });
  }, [baseEvents, selectedCategories, selectedOrte]);

  const monthEvents = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const now = new Date();
    return filteredEvents
      .flatMap((event) => getEventOccurrences(event))
      .filter((event) => {
        const [eventYear, eventMonth] = event.date.split('-').map(Number);
        return eventYear === year && eventMonth - 1 === month;
      })
      .filter((event) => !isOccurrencePast(event, now))
      .sort(compareEventsByDateTime);
  }, [filteredEvents, currentMonth]);

  const visibleEvents = useMemo(() => {
    if (!dateFilter) return monthEvents;
    return applyDateFilter(monthEvents, dateFilter);
  }, [monthEvents, dateFilter]);

  const hasActiveFilter =
    selectedCategories.length > 0 ||
    selectedOrte.length > 0 ||
    !!dateFilter ||
    favoritesFilterActive;

  const facetCounts = useMemo(
    () =>
      computeFacetCounts({
        occurrences: baseEvents.flatMap((event) => getEventOccurrences(event)),
        monthKey: dateToMonthKey(currentMonth),
        selectedCategories,
        selectedOrte,
        dateFilter,
        onlineLocation: ONLINE_LOCATION,
      }),
    [baseEvents, currentMonth, selectedCategories, selectedOrte, dateFilter]
  );

  // Calendar export: signed-in users only (like Favoriten). The personal token
  // is requested when the user opens the section, not on page load.
  const calendarUid = user?.uid ?? null;
  const calendarToken = useCalendarFeedToken(calendarUid);
  const [calendarLoginPromptOpen, setCalendarLoginPromptOpen] = useState(false);
  const [calendarExportOpen, setCalendarExportOpen] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const exportVisible = Boolean(calendarUid) && calendarExportOpen;
  const loadCalendarToken = calendarToken.load;
  const hasCalendarToken = Boolean(calendarToken.token);
  const calendarTokenLoading = calendarToken.loading;
  const calendarTokenFailed = Boolean(calendarToken.error);
  useEffect(() => {
    if (exportVisible && !hasCalendarToken && !calendarTokenLoading && !calendarTokenFailed) {
      loadCalendarToken();
    }
  }, [
    exportVisible,
    hasCalendarToken,
    calendarTokenLoading,
    calendarTokenFailed,
    loadCalendarToken,
  ]);

  const handleCalendarExportSummaryClick = (event) => {
    if (calendarUid) return;
    event.preventDefault();
    setCalendarLoginPromptOpen(true);
  };

  const feedUrl = buildFeedUrl(
    typeof window !== 'undefined' ? window.location.origin : 'https://www.thetribe.at',
    selectedOrte,
    selectedCategories,
    calendarToken.token
  );

  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:');
  const googleCalendarUrl = buildGoogleCalendarUrl(webcalUrl);
  const [feedCopied, setFeedCopied] = useState(false);
  const copyFeedUrl = async () => {
    if (await copyToClipboard(feedUrl)) {
      setFeedCopied(true);
      window.setTimeout(() => setFeedCopied(false), 2500);
    }
  };

  const resetAllFilters = () => {
    setSelectedCategories([]);
    setSelectedOrte([]);
    setDateFilter(null);
    setOnlyFavorites(false);
  };

  // Color resolution is now driven by the categories registry. Legacy
  // events that still carry an `event.categoryColor` override win over the
  // registry; everyone else uses the registry color for their category name.
  const categoryColorByName = colorByName;

  return (
    <div className="calendar-page">
      <SeoMeta
        title="Kalender"
        description="Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz, Umgebung"
        path="/"
      />

      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Finde Events.
            <br />
            Finde <em>Menschen.</em>
          </h1>
          <p className="hero-subtitle">
            Dein Kalender für Yoga, Breathwork, Meditation,
            <br />
            Tanz, Singen, Soundhealing und viele
            <br />
            weitere Veranstaltungen in Vorarlberg.
          </p>
          <div
            className="hero-features-slider"
            role="group"
            aria-roledescription="carousel"
            aria-label="Was die Seite bietet"
            data-testid="hero-features-slider"
          >
            {HERO_FEATURE_PAIRS.map((pair, pairIndex) => {
              const isActive = pairIndex === activeHeroPair;
              return (
                <div
                  key={pairIndex}
                  className={`hero-feature-slide${isActive ? ' is-active' : ''}`}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${pairIndex + 1} von ${HERO_FEATURE_PAIRS.length}`}
                  aria-hidden={!isActive}
                  data-testid="hero-feature-slide"
                  data-slide-index={pairIndex}
                >
                  {pair.map(({ icon: Icon, title, description }) => (
                    <div key={title} className="hero-feature-item">
                      <Icon size={20} aria-hidden="true" />
                      <div>
                        <span className="hero-feature-title">{title}</span>
                        <span className="hero-feature-description">{description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="page-layout">
        <div className="page-main">
          <div className="create-event-cta" data-testid="create-event-cta">
            <div className="create-event-cta-text">
              <strong>Du willst ein Event teilen?</strong>
              <span>Erstelle dein eigenes Event in wenigen Schritten.</span>
            </div>
            {canCreateEvents ? (
              <Link
                to="/admin/new"
                className="btn btn-primary create-event-cta-button"
                data-testid="create-event-cta-button"
              >
                <PlusCircle size={18} aria-hidden="true" />
                <span>Event erstellen</span>
              </Link>
            ) : user ? (
              <button
                type="button"
                className="btn btn-primary create-event-cta-button btn-disabled"
                onClick={() => setVerificationModalOpen(true)}
                title="Bitte bestätige zuerst deine E-Mail-Adresse, um Events zu erstellen."
                data-testid="create-event-cta-locked"
              >
                <PlusCircle size={18} aria-hidden="true" />
                <span>Event erstellen</span>
              </button>
            ) : (
              <Link
                to="/login"
                className="btn btn-primary create-event-cta-button"
                data-testid="create-event-cta-button"
              >
                <PlusCircle size={18} aria-hidden="true" />
                <span>Event erstellen</span>
              </Link>
            )}
          </div>

          <section className="filter-panel" aria-label="Filter">
            <div className="filter-header filter-header--title">
              <h2 className="filter-section-title">Hier kannst du filtern</h2>
            </div>

            <div className="filter-header filter-header--section">
              <span className="filter-label">Datum</span>
            </div>
            <div className="filter-options" data-testid="filter-options-date">
              {DATE_FILTER_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className="filter-chip filter-chip--date"
                  data-date-filter={id}
                  data-testid={`filter-chip-date-${id}`}
                  onClick={() => toggleDateFilter(id)}
                  aria-pressed={dateFilter === id}
                >
                  <Check size={14} className="filter-chip-icon" aria-hidden="true" />
                  <span>{label}</span>
                  <FacetCount value={facetCounts.date[id]} />
                </button>
              ))}
            </div>

            <div className="filter-header filter-header--section">
              <span className="filter-label">Kategorie</span>
              <div className="filter-quick-actions">
                <button type="button" onClick={selectAllCategories}>
                  Alle
                </button>
                <button type="button" onClick={selectNoneCategories}>
                  Keine
                </button>
              </div>
            </div>
            <div className="filter-options" data-testid="filter-options-category">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="filter-chip filter-chip--category"
                  data-category={category}
                  style={{
                    '--category-color': resolveEventColor({ category }, categoryColorByName),
                  }}
                  onClick={() => toggleCategory(category)}
                  aria-pressed={selectedCategories.includes(category)}
                >
                  <Check size={14} className="filter-chip-icon" aria-hidden="true" />
                  <span>{category}</span>
                  <FacetCount value={facetCounts.category[category] || 0} />
                </button>
              ))}
            </div>

            <details
              className="filter-accordion"
              open={moreFiltersOpen}
              onToggle={(event) => setMoreFiltersOpen(event.currentTarget.open)}
            >
              <summary className="filter-accordion-summary">
                <span className="filter-accordion-label">
                  <SlidersHorizontal
                    size={16}
                    className="filter-accordion-filter-icon"
                    aria-hidden="true"
                  />
                  <span>Mehr Filter</span>
                </span>
                <ChevronDown size={18} className="filter-accordion-icon" aria-hidden="true" />
              </summary>
              <div className="filter-accordion-body">
                <div className="filter-header">
                  <span className="filter-label">Bezirk</span>
                  <div className="filter-quick-actions">
                    <button type="button" onClick={selectAllOrte}>
                      Alle
                    </button>
                    <button type="button" onClick={selectNoneOrte}>
                      Keine
                    </button>
                  </div>
                </div>
                <div className="filter-options">
                  {BEZIRKE.map((bezirk) => (
                    <button
                      key={bezirk}
                      type="button"
                      className="filter-chip filter-chip--ort"
                      onClick={() => toggleOrt(bezirk)}
                      aria-pressed={selectedOrte.includes(bezirk)}
                    >
                      <Check size={14} className="filter-chip-icon" aria-hidden="true" />
                      <span>{bezirkLabel(bezirk)}</span>
                      <FacetCount value={facetCounts.ort[bezirk] || 0} />
                    </button>
                  ))}
                  <button
                    type="button"
                    className="filter-chip filter-chip--ort filter-chip--ort-online"
                    onClick={() => toggleOrt(ONLINE_LOCATION)}
                    aria-pressed={selectedOrte.includes(ONLINE_LOCATION)}
                    data-testid="filter-chip-online"
                  >
                    <Check size={14} className="filter-chip-icon" aria-hidden="true" />
                    <span>{ONLINE_LOCATION}</span>
                    <FacetCount value={facetCounts.ort[ONLINE_LOCATION] || 0} />
                  </button>
                </div>
                {isSignedIn && (
                  <>
                    <div className="filter-header filter-header--section">
                      <span className="filter-label">Meine Events</span>
                    </div>
                    <div className="filter-options" data-testid="filter-options-favorites">
                      <button
                        type="button"
                        className="filter-chip filter-chip--date"
                        data-testid="filter-chip-favorites"
                        onClick={() => {
                          if (!onlyFavorites) trackFilter('favorites', 'on');
                          setOnlyFavorites((prev) => !prev);
                        }}
                        aria-pressed={onlyFavorites}
                      >
                        <Heart size={14} className="filter-chip-icon" aria-hidden="true" />
                        <span>Meine Favoriten</span>
                      </button>
                    </div>
                  </>
                )}
                <details
                  className="calendar-export"
                  data-testid="calendar-subscribe"
                  open={exportVisible}
                  onToggle={(event) => {
                    // Visitors never get the options, even where the summary
                    // click could not be prevented.
                    if (!calendarUid && event.currentTarget.open) {
                      event.currentTarget.open = false;
                      return;
                    }
                    setCalendarExportOpen(event.currentTarget.open);
                  }}
                >
                  <summary
                    className="calendar-export-summary"
                    onClick={handleCalendarExportSummaryClick}
                  >
                    <Share size={14} aria-hidden="true" />
                    <span>im eigenen Kalender speichern</span>
                  </summary>
                  {exportVisible && !calendarToken.token && (
                    <div className="calendar-export-panel" data-testid="calendar-subscribe-status">
                      {calendarToken.error ? (
                        <>
                          <span>Dein persönlicher Kalender-Link konnte nicht geladen werden.</span>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => calendarToken.load()}
                            data-testid="calendar-subscribe-retry"
                          >
                            Erneut versuchen
                          </button>
                        </>
                      ) : (
                        <span>Dein persönlicher Kalender-Link wird erstellt …</span>
                      )}
                    </div>
                  )}
                  {exportVisible && calendarToken.token && (
                    <div className="calendar-export-panel">
                      <a
                        className="btn btn-primary calendar-export-cta"
                        href={webcalUrl}
                        data-testid="calendar-subscribe-link"
                      >
                        <CalendarPlus size={16} aria-hidden="true" />
                        <span>Abonnieren</span>
                      </a>
                      <a
                        className="btn btn-secondary"
                        href={googleCalendarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="calendar-subscribe-google"
                      >
                        Google Kalender
                      </a>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={copyFeedUrl}
                        data-testid="calendar-subscribe-copy"
                      >
                        {feedCopied ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )}
                        <span>{feedCopied ? 'Adresse kopiert' : 'Adresse kopieren'}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setRegenerateConfirmOpen(true)}
                        disabled={calendarToken.loading}
                        data-testid="calendar-subscribe-regenerate"
                      >
                        <RefreshCw size={14} aria-hidden="true" />
                        <span>Neuen Link erzeugen</span>
                      </button>
                      <code className="calendar-subscribe-url" data-testid="calendar-subscribe-url">
                        {feedUrl}
                      </code>
                      <p className="calendar-subscribe-hint">
                        Dieser Link ist persönlich. Bitte gib ihn nicht weiter.
                      </p>
                    </div>
                  )}
                </details>
              </div>
            </details>
          </section>

          {loading ? (
            <div className="loading-spinner"></div>
          ) : error ? (
            <div className="calendar-error">
              <h3>Verbindungsfehler</h3>
              <p>
                Kalender konnte nicht geladen werden. Bitte überprüfe deine Firebase Konfiguration
                und Firestore Regeln.
              </p>
              <p className="error-detail">{error}</p>
            </div>
          ) : (
            <EventsSection
              events={visibleEvents}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              categoryColorByName={categoryColorByName}
              onResetFilters={hasActiveFilter ? resetAllFilters : undefined}
            />
          )}
        </div>

        <aside className="page-sidebar">
          <Calendar
            events={filteredEvents}
            onEventClick={handleEventClick}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            categoryColorByName={categoryColorByName}
            categories={categories}
          />
        </aside>
      </div>

      <EmailVerificationModal
        open={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />
      <LoginPromptModal
        open={calendarLoginPromptOpen}
        variant="calendar"
        onClose={() => setCalendarLoginPromptOpen(false)}
        returnTo={`${location.pathname}${location.search}${location.hash}`}
        onLogin={() => setCalendarLoginPromptOpen(false)}
      />
      <ConfirmDialog
        isOpen={regenerateConfirmOpen}
        title="Neuen Kalender-Link erzeugen?"
        message="Der bisherige Link funktioniert danach nicht mehr. Kalender, die ihn abonniert haben, bekommen keine neuen Events mehr, bis du dort den neuen Link einträgst."
        confirmLabel="Neuen Link erzeugen"
        onCancel={() => setRegenerateConfirmOpen(false)}
        onConfirm={() => {
          setRegenerateConfirmOpen(false);
          calendarToken.regenerate();
        }}
      />
    </div>
  );
}
