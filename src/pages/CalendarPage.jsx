import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAllEvents, KATEGORIEN, BEZIRKE, ONLINE_LOCATION } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import Calendar from '../components/Calendar';
import EventsSection from '../components/EventsSection';
import EmailVerificationModal from '../components/EmailVerificationModal';
import SeoMeta from '../components/SeoMeta';
import { getEventOccurrences } from '../utils/eventOccurrences';
import { CATEGORY_COLORS } from '../utils/categoryColors';
import { monthKeyToDate, dateToMonthKey } from '../utils/calendarFilterState';
import { MapPin, Sparkles, Users, ChevronDown, Check, PlusCircle } from 'lucide-react';
import './CalendarPage.css';

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

function loadFilterState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed.currentMonth === 'string' && !monthKeyToDate(parsed.currentMonth)) {
      // Legacy ISO timestamp format is timezone-dependent and unreliable.
      // Reset to the current month so users land where they expect.
      delete parsed.currentMonth;
    }
    // Backwards compat: previous schema stored the location filter under
    // `selectedBezirke`. Migrate any saved selection forward to the new key.
    if (parsed && Array.isArray(parsed.selectedBezirke) && !parsed.selectedOrte) {
      parsed.selectedOrte = parsed.selectedBezirke;
      delete parsed.selectedBezirke;
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

export default function CalendarPage() {
  const navigate = useNavigate();
  const { user, canCreateEvents } = useAuth();
  const savedState = loadFilterState();
  const [currentMonth, setCurrentMonth] = useState(
    monthKeyToDate(savedState?.currentMonth) || new Date()
  );
  const [selectedCategories, setSelectedCategories] = useState(
    savedState?.selectedCategories || KATEGORIEN
  );
  const [selectedOrte, setSelectedOrte] = useState(savedState?.selectedOrte || []);
  const [viewMode, setViewMode] = useState(savedState?.viewMode || 'card');
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const { events, loading, error } = useAllEvents();

  useEffect(() => {
    saveFilterState({
      currentMonth,
      selectedCategories,
      selectedOrte,
      viewMode,
    });
  }, [currentMonth, selectedCategories, selectedOrte, viewMode]);

  const handleEventClick = (event) => {
    const slugOrId = event.slug || event.id;
    const occurrenceDate = event.date;
    navigate(`/event/${slugOrId}?occurrenceDate=${occurrenceDate}`);
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

  const toggleOrt = (ort) => {
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

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const categoryMatch =
        selectedCategories.length === 0 ||
        (event.category && selectedCategories.includes(event.category));
      if (selectedOrte.length === 0) return categoryMatch;
      const eventOrtKey = event.isOnline ? ONLINE_LOCATION : event.bezirk;
      const ortMatch = selectedOrte.includes(eventOrtKey);
      return categoryMatch && ortMatch;
    });
  }, [events, selectedCategories, selectedOrte]);

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

  return (
    <div className="calendar-page">
      <SeoMeta
        title="Kalender"
        description="Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz, Grenznahe"
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
              <div className="filter-quick-actions">
                <button type="button" onClick={selectAllCategories}>
                  Alle
                </button>
                <button type="button" onClick={selectNoneCategories}>
                  Keine
                </button>
              </div>
            </div>
            <div className="filter-options">
              {KATEGORIEN.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="filter-chip filter-chip--category"
                  data-category={category}
                  style={{ '--category-color': CATEGORY_COLORS[category] }}
                  onClick={() => toggleCategory(category)}
                  aria-pressed={selectedCategories.includes(category)}
                >
                  <Check size={14} className="filter-chip-icon" aria-hidden="true" />
                  <span>{category}</span>
                </button>
              ))}
            </div>

            <details className="filter-accordion">
              <summary className="filter-accordion-summary">
                <span>Mehr Filter</span>
                <ChevronDown size={18} className="filter-accordion-icon" aria-hidden="true" />
              </summary>
              <div className="filter-accordion-body">
                <div className="filter-header">
                  <span className="filter-label">Ort</span>
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
                      <span>{bezirk}</span>
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
                  </button>
                </div>
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
        </aside>
      </div>

      <EmailVerificationModal
        open={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />
    </div>
  );
}
