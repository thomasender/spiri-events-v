import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAllEvents, KATEGORIEN, BEZIRKE } from '../hooks/useEvents'
import Calendar from '../components/Calendar'
import { Filter } from 'lucide-react'
import './CalendarPage.css'

export default function CalendarPage() {
  const navigate = useNavigate()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedCategories, setSelectedCategories] = useState(KATEGORIEN)
  const [selectedBezirke, setSelectedBezirke] = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const { events, loading, error } = useAllEvents()

  const handleEventClick = (event) => {
    navigate(`/event/${event.id}`)
  }

  const toggleCategory = (category) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const selectAllCategories = () => {
    setSelectedCategories(KATEGORIEN)
  }

  const selectNoneCategories = () => {
    setSelectedCategories([])
  }

  const toggleBezirk = (bezirk) => {
    setSelectedBezirke(prev =>
      prev.includes(bezirk)
        ? prev.filter(b => b !== bezirk)
        : [...prev, bezirk]
    )
  }

  const selectAllBezirke = () => {
    setSelectedBezirke(BEZIRKE)
  }

  const selectNoneBezirke = () => {
    setSelectedBezirke([])
  }

  const filteredEvents = useMemo(() => {
    if (!showFilters) return events
    return events.filter(event => {
      const categoryMatch = selectedCategories.length === 0 || (event.categories && event.categories.some(cat => selectedCategories.includes(cat)))
      const bezirkMatch = selectedBezirke.length === 0 || selectedBezirke.includes(event.bezirk)
      return categoryMatch && bezirkMatch
    })
  }, [events, selectedCategories, selectedBezirke, showFilters])

  return (
    <div className="calendar-page">
      <Helmet>
        <title>Spirituelle Events Vorarlberg | Kalender</title>
        <meta name="description" content="Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz" />
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
          <button
            className="filter-toggle-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
            <span>Filter</span>
            {selectedCategories.length < KATEGORIEN.length && (
              <span className="filter-badge">{selectedCategories.length}</span>
            )}
          </button>
          {selectedCategories.length === 0 && (
            <span className="filter-hint">Keine Kategorien ausgewählt</span>
          )}
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
              {KATEGORIEN.map(category => (
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

            <div className="filter-section">
              <div className="filter-header">
                <span className="filter-label">Bezirk</span>
              </div>
              <div className="filter-options">
                <label className={`filter-checkbox ${selectedBezirke.length === BEZIRKE.length ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedBezirke.length === BEZIRKE.length}
                    onChange={() => selectedBezirke.length === BEZIRKE.length ? selectNoneBezirke() : selectAllBezirke()}
                  />
                  <span>Alle</span>
                </label>
                {BEZIRKE.map(bezirk => (
                  <label key={bezirk} className={`filter-checkbox ${selectedBezirke.includes(bezirk) ? 'active' : ''}`}>
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
          </div>
        )}

        {loading ? (
          <div className="loading-spinner"></div>
        ) : error ? (
          <div className="calendar-error">
            <h3>Verbindungsfehler</h3>
            <p>Kalender konnte nicht geladen werden. Bitte überprüfe deine Firebase Konfiguration und Firestore Regeln.</p>
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
  )
}
