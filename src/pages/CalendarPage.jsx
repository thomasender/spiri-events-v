import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAllEvents, KATEGORIEN, BEZIRKE } from '../hooks/useEvents';
import Calendar from '../components/Calendar';
import EventsSection from '../components/EventsSection';
import { getEventOccurrences } from '../utils/eventOccurrences';
import { Filter, MapPin, Sparkles, Users, X } from 'lucide-react';
import './CalendarPage.css';

const STORAGE_KEY = 'calendarFilterState';

const CATEGORY_COLORS = {
  Yoga: 'var(--accent-primary)',
  Meditation: 'var(--free-text)',
  Tanz: 'var(--pending-text)',
  Singen: 'var(--chip-text)',
  Atemarbeit: 'var(--error)',
  Sonstiges: 'var(--text-light)',
};

const HERO_FEATURES = [
  {
    icon: MapPin,
    title: 'Regional & persönlich',
    description: 'Für Vorarlberg & Umgebung',
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
];

function loadFilterState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}
  return null;
}

function saveFilterState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const savedState = loadFilterState();
  const [currentMonth, setCurrentMonth] = useState(
    savedState?.currentMonth ? new Date(savedState.currentMonth) : new Date()
  );
  const [selectedCategories, setSelectedCategories] = useState(
    savedState?.selectedCategories || KATEGORIEN
  );
  const [selectedBezirke, setSelectedBezirke] = useState(savedState?.selectedBezirke || []);
  const [showFilters, setShowFilters] = useState(savedState?.showFilters || false);
  const [viewMode, setViewMode] = useState(savedState?.viewMode || 'list');
  const { events, loading, error } = useAllEvents();

  useEffect(() => {
    saveFilterState({
      currentMonth: currentMonth.toISOString(),
      selectedCategories,
      selectedBezirke,
      showFilters,
      viewMode,
    });
  }, [currentMonth, selectedCategories, selectedBezirke, showFilters, viewMode]);

  const handleEventClick = (event) => {
    const slugOrId = event.slug || event.id;
    navigate(`/event/${slugOrId}`);
  };

  const toggleCategory = (category) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const selectAllCategories = () => {
    setSelectedCategories(KATEGORIEN);
  };

  const selectNoneCategories = () => {
    setSelectedCategories([]);
  };

  const toggleBezirk = (bezirk) => {
    setSelectedBezirke((prev) =>
      prev.includes(bezirk) ? prev.filter((b) => b !== bezirk) : [...prev, bezirk]
    );
  };

  const selectAllBezirke = () => {
    setSelectedBezirke(BEZIRKE);
  };

  const selectNoneBezirke = () => {
    setSelectedBezirke([]);
  };

  const filteredEvents = useMemo(() => {
    if (!showFilters) return events;
    return events.filter((event) => {
      const categoryMatch =
        selectedCategories.length === 0 ||
        (event.categories && event.categories.some((cat) => selectedCategories.includes(cat)));
      const bezirkMatch = selectedBezirke.length === 0 || selectedBezirke.includes(event.bezirk);
      return categoryMatch && bezirkMatch;
    });
  }, [events, selectedCategories, selectedBezirke, showFilters]);

  const monthEvents = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return filteredEvents
      .flatMap((event) => getEventOccurrences(event))
      .filter((event) => {
        const [eventYear, eventMonth] = event.date.split('-').map(Number);
        return eventYear === year && eventMonth - 1 === month;
      })
      .sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [filteredEvents, currentMonth]);

  const hasActiveFilters =
    selectedCategories.length < KATEGORIEN.length || selectedBezirke.length > 0;
  const hasSelection = selectedCategories.length > 0 || selectedBezirke.length > 0;

  const clearAllFilters = () => {
    selectAllCategories();
    selectNoneBezirke();
  };

  return (
    <div className={`calendar-page${showFilters ? ' filter-panel-open' : ''}`}>
      <Helmet>
        <title>tribe Vorarlberg | Kalender</title>
        <meta
          name="description"
          content="Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz, Grenznahe"
        />
        <link rel="canonical" href="https://spirievents.at/" />
      </Helmet>

      <div className="page-layout">
        <div className="page-main">
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
                Tanz und viele weitere
                <br />
                Veranstaltungen in Vorarlberg.
              </p>
              <ul className="hero-features">
                {HERO_FEATURES.map(({ icon: Icon, title, description }) => (
                  <li key={title}>
                    <Icon size={20} />
                    <div>
                      <span className="hero-feature-title">{title}</span>
                      <span className="hero-feature-description">{description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <img src="/hero.jpeg" alt="" className="hero-visual-image" />
            </div>
          </section>

          <div className="filter-bar">
            <button className="filter-toggle-btn" onClick={() => setShowFilters(!showFilters)}>
              <Filter size={18} />
              <span>Filter</span>
              {selectedCategories.length < KATEGORIEN.length && (
                <span className="filter-badge">{selectedCategories.length}</span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="filter-panel">
              <div className="filter-header">
                <span className="filter-label">Kategorien</span>
                <div className="filter-quick-actions">
                  <button onClick={selectAllCategories}>Alle</button>
                  <button onClick={selectNoneCategories}>Keine</button>
                </div>
              </div>
              <div className="filter-options">
                {KATEGORIEN.map((category) => (
                  <label key={category} className="filter-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={() => toggleCategory(category)}
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </div>

              <div className="filter-header">
                <span className="filter-label">Bezirk</span>
                <div className="filter-quick-actions">
                  <button onClick={selectAllBezirke}>Alle</button>
                  <button onClick={selectNoneBezirke}>Keine</button>
                </div>
              </div>
              <div className="filter-options">
                {BEZIRKE.map((bezirk) => (
                  <label
                    key={bezirk}
                    className={`filter-checkbox ${selectedBezirke.includes(bezirk) ? 'active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBezirke.includes(bezirk)}
                      onChange={() => toggleBezirk(bezirk)}
                    />
                    <span>{bezirk}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="sidebar-card sidebar-card-mobile" data-mobile-only="true">
            <div className="sidebar-card-header">
              <h2 className="sidebar-card-title">Deine Auswahl</h2>
              {hasActiveFilters && (
                <button type="button" className="sidebar-clear-btn" onClick={clearAllFilters}>
                  Alle Filter löschen
                </button>
              )}
            </div>
            {hasSelection ? (
              <div className="selection-chips">
                {selectedCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className="selection-chip"
                    onClick={() => toggleCategory(category)}
                  >
                    {category}
                    <X size={12} />
                  </button>
                ))}
                {selectedBezirke.map((bezirk) => (
                  <button
                    key={bezirk}
                    type="button"
                    className="selection-chip"
                    onClick={() => toggleBezirk(bezirk)}
                  >
                    {bezirk}
                    <X size={12} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="sidebar-card-empty">Noch keine Filter ausgewählt.</p>
            )}
          </div>

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
              events={monthEvents}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              categoryColors={CATEGORY_COLORS}
            />
          )}
        </div>

        <aside className="page-sidebar">
          <Calendar
            events={filteredEvents}
            onEventClick={handleEventClick}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            categoryColors={CATEGORY_COLORS}
            categories={KATEGORIEN}
          />

          <div className="sidebar-cards-row sidebar-cards-row-desktop">
            <div className="sidebar-card">
              <div className="sidebar-card-header">
                <h2 className="sidebar-card-title">Deine Auswahl</h2>
                {hasActiveFilters && (
                  <button type="button" className="sidebar-clear-btn" onClick={clearAllFilters}>
                    Alle Filter löschen
                  </button>
                )}
              </div>
              {hasSelection ? (
                <div className="selection-chips">
                  {selectedCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className="selection-chip"
                      onClick={() => toggleCategory(category)}
                    >
                      {category}
                      <X size={12} />
                    </button>
                  ))}
                  {selectedBezirke.map((bezirk) => (
                    <button
                      key={bezirk}
                      type="button"
                      className="selection-chip"
                      onClick={() => toggleBezirk(bezirk)}
                    >
                      {bezirk}
                      <X size={12} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="sidebar-card-empty">Noch keine Filter ausgewählt.</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <section className="impact-strip">
        <div className="impact-message">
          <Sparkles size={22} />
          <div>
            <strong>Tribe ist für alle da.</strong>
            <span>Ein Ort für Begegnung, Inspiration und echtes Miteinander.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
