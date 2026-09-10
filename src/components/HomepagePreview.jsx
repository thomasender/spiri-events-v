import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, MapPin, PlusCircle, Sparkles, Users } from 'lucide-react';
import Calendar from './Calendar';
import EventsSection from './EventsSection';
import { resolveEventColor } from '../utils/categoryColors';
import { getPrimaryCategory } from '../utils/eventFormat';
import { getEventOccurrences } from '../utils/eventOccurrences';
import { DATE_FILTER_OPTIONS, applyDateFilter } from '../utils/dateQuickFilters';
// Reuses the public-facing homepage layout. Scoped overrides for the
// sandbox live in HomepagePreview.css so the styles below stay clean.
import '../pages/CalendarPage.css';
import './HomepagePreview.css';

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

const BEZIRKE = ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe'];
const ONLINE_LOCATION = 'Online';

// Static, navigation-free replica of the public homepage (CalendarPage)
// used as the Theme Editor's live preview surface. Mirrors the real
// homepage's structure (hero, filter panel, events section, calendar
// sidebar) but takes all data via props and stubs every click handler —
// so the preview can never trigger real navigation, write to Firestore,
// or accidentally subscribe to live data.
//
// Why not render the real CalendarPage?
//   - CalendarPage subscribes to useAllEvents / useCategories /
//     useCategoryRegistry via Firestore. The Theme Editor should not
//     pay that network cost on every open.
//   - CalendarPage routes to /event/... when an event card is clicked.
//     Inside the editor we'd lose state and bounce out of the editor.
//   - The editor wants the preview to render the *current draft* of
//     the theme, not whatever the live database happens to serve —
//     using the real page would mix drafts and live data.
export default function HomepagePreview({
  events,
  categories,
  categoryColorByName,
  currentMonth,
  onMonthChange,
  onEventClick,
  onCardClick,
}) {
  const [activeHeroFeature, setActiveHeroFeature] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState(categories);
  const [selectedOrte, setSelectedOrte] = useState(() => [...BEZIRKE, ONLINE_LOCATION]);
  const [dateFilter, setDateFilter] = useState(null);
  const [viewMode, setViewMode] = useState('card');

  // Auto-rotate the hero features so the preview stays lively.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReducedMotion) return undefined;
    const id = window.setInterval(() => {
      setActiveHeroFeature((prev) => (prev + 1) % HERO_FEATURES.length);
    }, HERO_SLIDER_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const categoryName = getPrimaryCategory(event);
      const categoryMatch =
        selectedCategories.length === 0 ||
        (categoryName && selectedCategories.includes(categoryName));
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

  const visibleEvents = useMemo(() => {
    if (!dateFilter) return monthEvents;
    return applyDateFilter(monthEvents, dateFilter);
  }, [monthEvents, dateFilter]);

  const toggleCategory = (category) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const selectAllCategories = () => setSelectedCategories(categories);
  const selectNoneCategories = () => setSelectedCategories([]);

  const toggleOrt = (ort) => {
    setSelectedOrte((prev) =>
      prev.includes(ort) ? prev.filter((o) => o !== ort) : [...prev, ort]
    );
  };

  const selectAllOrte = () => setSelectedOrte([...BEZIRKE, ONLINE_LOCATION]);
  const selectNoneOrte = () => setSelectedOrte([]);

  const toggleDateFilter = (id) => {
    setDateFilter((prev) => (prev === id ? null : id));
  };

  // `onCardClick` defaults to `preventDefault` so clicking an event card
  // inside the preview never navigates away from the editor. Tests can
  // override the prop to spy on the call.
  const handleCardClick = onCardClick || ((e) => e.preventDefault());
  const handleEventClick = onEventClick || (() => {});

  return (
    <div className="homepage-preview" data-testid="homepage-preview">
      <div className="calendar-page homepage-preview-page">
        <section className="hero" data-testid="homepage-preview-hero">
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
              data-testid="homepage-preview-hero-slider"
            >
              {HERO_FEATURES.map(({ icon: Icon, title, description }, index) => {
                const isActive = index === activeHeroFeature;
                return (
                  <div
                    key={title}
                    className={`hero-feature-slide${isActive ? ' is-active' : ''}`}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${index + 1} von ${HERO_FEATURES.length}`}
                    aria-hidden={!isActive}
                    data-testid="homepage-preview-hero-slide"
                    data-slide-index={index}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <div>
                      <span className="hero-feature-title">{title}</span>
                      <span className="hero-feature-description">{description}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="page-layout">
          <div className="page-main">
            <section
              className="filter-panel"
              aria-label="Filter"
              data-testid="homepage-preview-filter-panel"
            >
              <div className="filter-header filter-header--title">
                <h2 className="filter-section-title">Hier kannst du filtern</h2>
              </div>

              <div className="filter-header filter-header--section">
                <span className="filter-label">Datum</span>
              </div>
              <div className="filter-options" data-testid="homepage-preview-filter-date">
                {DATE_FILTER_OPTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className="filter-chip filter-chip--date"
                    data-date-filter={id}
                    data-testid={`homepage-preview-filter-date-${id}`}
                    onClick={() => toggleDateFilter(id)}
                    aria-pressed={dateFilter === id}
                  >
                    <Check size={14} className="filter-chip-icon" aria-hidden="true" />
                    <span>{label}</span>
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
              <div className="filter-options" data-testid="homepage-preview-filter-category">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className="filter-chip filter-chip--category"
                    data-category={category}
                    data-testid={`homepage-preview-filter-category-${category}`}
                    style={{
                      '--category-color': resolveEventColor({ category }, categoryColorByName),
                    }}
                    onClick={() => toggleCategory(category)}
                    aria-pressed={selectedCategories.includes(category)}
                  >
                    <Check size={14} className="filter-chip-icon" aria-hidden="true" />
                    <span>{category}</span>
                  </button>
                ))}
              </div>

              <details className="filter-accordion" data-testid="homepage-preview-filter-ort">
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
                        data-testid={`homepage-preview-filter-ort-${bezirk}`}
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
                      data-testid="homepage-preview-filter-ort-online"
                    >
                      <Check size={14} className="filter-chip-icon" aria-hidden="true" />
                      <span>{ONLINE_LOCATION}</span>
                    </button>
                  </div>
                </div>
              </details>
            </section>

            <EventsSection
              events={visibleEvents}
              currentMonth={currentMonth}
              onMonthChange={onMonthChange}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              categoryColorByName={categoryColorByName}
              onCardClick={handleCardClick}
              data-testid="homepage-preview-events"
            />
          </div>

          <aside className="page-sidebar" data-testid="homepage-preview-sidebar-calendar">
            <Calendar
              events={filteredEvents}
              onEventClick={handleEventClick}
              currentMonth={currentMonth}
              onMonthChange={onMonthChange}
              categoryColorByName={categoryColorByName}
              categories={categories}
            />
          </aside>
        </div>
      </div>

      {/* The CTA is part of the real homepage only on small viewports;
          we still want the button visible in the preview so designers
          can see how their theme affects it. */}
      <div className="homepage-preview-create-cta" data-testid="homepage-preview-create-cta">
        <div className="create-event-cta-text">
          <strong>Du willst ein Event teilen?</strong>
          <span>Erstelle dein eigenes Event in wenigen Schritten.</span>
        </div>
        <button
          type="button"
          className="btn btn-primary create-event-cta-button"
          onClick={(e) => e.preventDefault()}
        >
          <PlusCircle size={18} aria-hidden="true" />
          <span>Event erstellen</span>
        </button>
      </div>
    </div>
  );
}
