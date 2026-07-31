import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Calendar, LogOut, User, PlusCircle, UserCircle, Pen, Menu, X } from 'lucide-react';
import './Header.css';

const navClass = ({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link');

const adminNavClass = ({ isActive }) =>
  isActive ? 'nav-link nav-link--admin nav-link--active' : 'nav-link nav-link--admin';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const toggleRef = useRef(null);

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async () => {
    closeMenu();
    await logout();
    navigate('/');
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        !toggleRef.current?.contains(e.target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [menuOpen]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    closeMenu();
  }, [location.pathname]);

  const renderNavLinks = () => (
    <>
      <NavLink to="/" className={navClass} end onClick={closeMenu}>
        <Calendar size={18} />
        <span>Kalender</span>
      </NavLink>
      {user ? (
        <>
          <NavLink to="/admin" className={adminNavClass} onClick={closeMenu}>
            <Pen size={18} />
            <span>Verwaltung</span>
          </NavLink>
          <NavLink to="/profil" className={navClass} onClick={closeMenu}>
            <UserCircle size={18} />
            <span>Mein Profil</span>
          </NavLink>
          <NavLink to="/admin/new" className={navClass} onClick={closeMenu}>
            <PlusCircle size={18} />
            <span>Event erstellen</span>
          </NavLink>
          <button type="button" onClick={handleLogout} className="nav-link nav-link--logout">
            <LogOut size={18} />
            <span>Abmelden</span>
          </button>
        </>
      ) : (
        <NavLink to="/login" className={navClass} onClick={closeMenu}>
          <User size={18} />
          <span>Anmelden</span>
        </NavLink>
      )}
    </>
  );

  return (
    <header className={`header${menuOpen ? ' header--menu-open' : ''}`}>
      <nav className="header-container" aria-label="Hauptnavigation">
        <Link to="/" className="logo" onClick={closeMenu}>
          <div className="logo-icon">
            <img src="/logo-mark.svg" alt="" aria-hidden="true" />
          </div>
          <div className="logo-text">
            <span className="logo-title">tribe</span>
            <span className="logo-subtitle">Vorarlberg</span>
          </div>
        </Link>

        <div className="nav-desktop">{renderNavLinks()}</div>

        <button
          ref={toggleRef}
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Menü schließen' : 'Menü öffnen'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </nav>

      <div
        id="mobile-menu"
        ref={menuRef}
        className={`nav-mobile${menuOpen ? ' nav-mobile--open' : ''}`}
        aria-hidden={!menuOpen}
      >
        {renderNavLinks()}
      </div>
    </header>
  );
}
