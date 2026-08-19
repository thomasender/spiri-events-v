import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAllEvents, KATEGORIEN, BEZIRKE } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import Calendar from '../components/Calendar';
import EventsSection from '../components/EventsSection';
import EmailVerificationModal from '../components/EmailVerificationModal';
import { getEventOccurrences } from '../utils/eventOccurrences';
import { CATEGORY_COLORS } from '../utils/categoryColors';
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
  const { user, canCreateEvents } = useAuth();
  const savedState = loadFilterState();
  const [currentMonth, setCurrentMonth] = useState(
    savedState?.currentMonth ? new Date(savedState.currentMonth) : new Date()
  );
  const [selectedCategories, setSelectedCategories] = useState(
    savedState?.selectedCategories || KATEGORIEN
  );
  const [selectedBezirke, setSelectedBezirke] = useState(savedState?.selectedBezirke || []);
  const [viewMode, setViewMode] = useState(savedState?.viewMode || 'list');
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const { events, loading, error } = useAllEvents();

  useEffect(() => {
    saveFilterState({
      currentMonth: currentMonth.toISOString(),
      selectedCategories,
      selectedBezirke,
      viewMode,
    });
  }, [currentMonth, selectedCategories, selectedBezirke, viewMode]);

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
    return events.filter((event) => {
      const categoryMatch =
        selectedCategories.length === 0 ||
        (event.category && selectedCategories.includes(event.category));
      const bezirkMatch = selectedBezirke.length === 0 || selectedBezirke.includes(event.bezirk);
      return categoryMatch && bezirkMatch;
    });
  }, [events, selectedCategories, selectedBezirke]);

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
      <Helmet>
        <title>tribe Vorarlberg | Kalender</title>
        <meta
          name="description"
          content="Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz, Grenznahe"
        />
        <link rel="canonical" href="https://spirievents.at/" />
      </Helmet>

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
          <div className="hero-tagline">
            <Sparkles size={22} aria-hidden="true" />
            <div>
              <strong>Tribe ist für alle da.</strong>
              <span>Ein Ort für Begegnung, Inspiration und echtes Miteinander.</span>
            </div>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <img src="/hero.jpeg" alt="" className="hero-visual-image" />
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
                  <span className="filter-label">Bezirk</span>
                  <div className="filter-quick-actions">
                    <button type="button" onClick={selectAllBezirke}>
                      Alle
                    </button>
                    <button type="button" onClick={selectNoneBezirke}>
                      Keine
                    </button>
                  </div>
                </div>
                <div className="filter-options">
                  {BEZIRKE.map((bezirk) => (
                    <button
                      key={bezirk}
                      type="button"
                      className="filter-chip filter-chip--bezirk"
                      onClick={() => toggleBezirk(bezirk)}
                      aria-pressed={selectedBezirke.includes(bezirk)}
                    >
                      <Check size={14} className="filter-chip-icon" aria-hidden="true" />
                      <span>{bezirk}</span>
                    </button>
                  ))}
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
