import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAllEvents, KATEGORIEN, BEZIRKE } from '../hooks/useEvents';
import Calendar from '../components/Calendar';
import { Filter } from 'lucide-react';
import './CalendarPage.css';

const STORAGE_KEY = 'calendarFilterState';

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
  const { events, loading, error } = useAllEvents();

  useEffect(() => {
    saveFilterState({
      currentMonth: currentMonth.toISOString(),
      selectedCategories,
      selectedBezirke,
      showFilters,
    });
  }, [currentMonth, selectedCategories, selectedBezirke, showFilters]);

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

  return (
    <div className="calendar-page">
      <Helmet>
        <title>Spirituelle Events Vorarlberg | Kalender</title>
        <meta
          name="description"
          content="Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz"
        />
        <link rel="canonical" href="https://spirievents.at/" />
      </Helmet>

      <div className="page-header">
        <div className="header-content">
          <h1>Spirituelle Events Vorarlberg</h1>
          <p>Entdecke Workshops, Meditationen und Retreats in deiner Nähe</p>
        </div>
        <div className="header-decoration"></div>
      </div>

      <div className="calendar-wrapper">
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

        {loading ? (
          <div className="loading-spinner"></div>
        ) : error ? (
          <div className="calendar-error">
            <h3>Verbindungsfehler</h3>
            <p>
              Kalender konnte nicht geladen werden. Bitte überprüfe deine Firebase Konfiguration und
              Firestore Regeln.
            </p>
            <p className="error-detail">{error}</p>
          </div>
        ) : (
          <Calendar
            events={filteredEvents}
            onEventClick={handleEventClick}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
          />
        )}
      </div>
    </div>
  );
}
