import { Link } from 'react-router-dom'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <span className="footer-copy">© 2026 Spirituelle Events Vorarlberg</span>
        <nav className="footer-nav">
          <Link to="/impressum">Impressum</Link>
          <Link to="/datenschutz">Datenschutz</Link>
          <Link to="/nutzungsbedingungen">Nutzungsbedingungen</Link>
        </nav>
      </div>
    </footer>
  )
}
