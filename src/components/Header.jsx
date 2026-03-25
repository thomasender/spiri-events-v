import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Calendar, LogOut, User, PlusCircle } from 'lucide-react'
import './Header.css'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="2"/>
              <circle cx="50" cy="50" r="20" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="50" cy="35" r="4" fill="currentColor"/>
              <circle cx="35" cy="60" r="4" fill="currentColor"/>
              <circle cx="65" cy="60" r="4" fill="currentColor"/>
            </svg>
          </div>
          <div className="logo-text">
            <span className="logo-title">Spirituelle Events</span>
            <span className="logo-subtitle">Vorarlberg</span>
          </div>
        </Link>

        <nav className="nav">
          <Link to="/" className="nav-link">
            <Calendar size={18} />
            <span>Kalender</span>
          </Link>

          {user ? (
            <>
              <Link to="/admin" className="nav-link">
                <User size={18} />
                <span>Verwaltung</span>
              </Link>
              <Link to="/admin/new" className="nav-link nav-link--cta">
                <PlusCircle size={18} />
                <span>Event erstellen</span>
              </Link>
              <button onClick={handleLogout} className="nav-link nav-link--logout">
                <LogOut size={18} />
                <span>Abmelden</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="nav-link">
              <User size={18} />
              <span>Anmelden</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
