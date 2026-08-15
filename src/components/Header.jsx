import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { useUnreadFeedbackCount } from '../hooks/useFeedbackList';
import { Calendar, LogOut, User, PlusCircle, UserCircle, Pen, Menu, X } from 'lucide-react';
import './Header.css';

const navClass = ({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link');

const getAdminNavClass = (pathname) =>
  pathname === '/admin' ? 'nav-link nav-link--admin nav-link--active' : 'nav-link nav-link--admin';

export default function Header() {
  const { user, logout, role, canCreateEvents } = useAuth();
  const { profile } = useProfile(user?.uid);
  const isAdmin = role === 'Admin';
  const navigate = useNavigate();
  const location = useLocation();
  const { count: unreadMessageCount } = useUnreadMessageCount();
  const { count: unreadFeedbackCount } = useUnreadFeedbackCount(isAdmin);
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

  const unreadCount = unreadMessageCount + unreadFeedbackCount;
  const hasUnread = unreadCount > 0;

  const renderAdminLink = () => (
    <NavLink
      to="/admin"
      className={getAdminNavClass(location.pathname)}
      end
      onClick={closeMenu}
      aria-label={
        hasUnread ? `Verwaltung (${unreadCount} ungelesene Benachrichtigungen)` : 'Verwaltung'
      }
    >
      <span className="nav-link-admin-icon">
        <Pen size={18} aria-hidden="true" />
        {hasUnread && (
          <span className="nav-link-badge" data-testid="verwaltung-unread-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </span>
      <span>Verwaltung</span>
    </NavLink>
  );

  const renderNavLinks = () => (
    <>
      <NavLink to="/" className={navClass} end onClick={closeMenu}>
        <Calendar size={18} />
        <span>Kalender</span>
      </NavLink>
      {user ? (
        <>
          {renderAdminLink()}
          <NavLink to="/profil" className={navClass} onClick={closeMenu}>
            {profile?.photoURL || user?.photoURL ? (
              <img
                src={profile?.photoURL || user?.photoURL}
                alt=""
                className="nav-link-avatar"
                aria-hidden="true"
                data-testid="profile-nav-avatar"
              />
            ) : (
              <UserCircle size={18} aria-hidden="true" />
            )}
            <span>Mein Profil</span>
          </NavLink>
          {canCreateEvents ? (
            <NavLink to="/admin/new" className={navClass} onClick={closeMenu}>
              <PlusCircle size={18} />
              <span>Event erstellen</span>
            </NavLink>
          ) : (
            <span
              className="nav-link nav-link--disabled"
              aria-disabled="true"
              title="Bitte bestätige zuerst deine E-Mail-Adresse, um Events zu erstellen."
              data-testid="event-create-locked"
            >
              <PlusCircle size={18} aria-hidden="true" />
              <span>Event erstellen</span>
            </span>
          )}
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
