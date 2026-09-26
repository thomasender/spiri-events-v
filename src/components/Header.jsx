import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { useUnreadFeedbackCount } from '../hooks/useFeedbackList';
import EmailVerificationModal from './EmailVerificationModal';
import { Calendar, LogOut, User, PlusCircle, UserCircle, Pen, Menu, X } from 'lucide-react';
import './Header.css';

const navClass = ({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link');

const getAdminNavClass = (pathname) =>
  pathname === '/admin' ? 'nav-link nav-link--admin nav-link--active' : 'nav-link nav-link--admin';

const HEADER_MOBILE_MAX_QUERY = '(max-width: 800px)';
const SCROLL_DIRECTION_THRESHOLD = 8;
const HEADER_TOP_BUFFER = 80;

export default function Header() {
  const { user, logout, role, canCreateEvents } = useAuth();
  const { profile } = useProfile(user?.uid);
  const isAdmin = role === 'Admin';
  const navigate = useNavigate();
  const location = useLocation();
  const { count: unreadMessageCount } = useUnreadMessageCount();
  const { count: unreadFeedbackCount } = useUnreadFeedbackCount(isAdmin);
  const [menuOpen, setMenuOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const menuRef = useRef(null);
  const toggleRef = useRef(null);

  const closeMenu = () => setMenuOpen(false);

  const openVerificationModal = () => {
    closeMenu();
    setVerificationModalOpen(true);
  };

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

  // Hide-on-scroll-down / show-on-scroll-up behaviour for the mobile
  // header (kq5ob4S0). Only runs while the viewport is at or below the
  // mobile breakpoint so the desktop nav never disappears. We also skip
  // the hide step entirely while the mobile menu is open — otherwise
  // tapping the burger would scroll-trigger the header away and the
  // menu would un-anchor from the top of the page.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mql = window.matchMedia?.(HEADER_MOBILE_MAX_QUERY);
    if (!mql) return undefined;

    let lastScrollY = window.scrollY;
    let rafHandle = 0;
    let enabled = mql.matches;

    const update = () => {
      rafHandle = 0;
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY;

      if (currentY <= HEADER_TOP_BUFFER) {
        setIsHeaderVisible(true);
      } else if (Math.abs(delta) >= SCROLL_DIRECTION_THRESHOLD) {
        setIsHeaderVisible(delta < 0);
      }

      lastScrollY = currentY;
    };

    const onScroll = () => {
      if (rafHandle !== 0) return;
      rafHandle = window.requestAnimationFrame(update);
    };

    const onMediaChange = (event) => {
      enabled = event.matches;
      if (enabled) {
        lastScrollY = window.scrollY;
      }
      setIsHeaderVisible(true);
    };

    const onScrollGuarded = () => {
      if (!enabled || menuOpen) return;
      onScroll();
    };

    window.addEventListener('scroll', onScrollGuarded, { passive: true });
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onMediaChange);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(onMediaChange);
    }

    return () => {
      window.removeEventListener('scroll', onScrollGuarded);
      if (rafHandle !== 0) window.cancelAnimationFrame(rafHandle);
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', onMediaChange);
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(onMediaChange);
      }
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    setIsHeaderVisible(true);
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
            <button
              type="button"
              className="nav-link nav-link--disabled"
              onClick={openVerificationModal}
              title="Bitte bestätige zuerst deine E-Mail-Adresse, um Events zu erstellen."
              data-testid="event-create-locked"
            >
              <PlusCircle size={18} aria-hidden="true" />
              <span>Event erstellen</span>
            </button>
          )}
          <button type="button" onClick={handleLogout} className="nav-link nav-link--logout">
            <LogOut size={18} />
            <span>Abmelden</span>
          </button>
        </>
      ) : (
        <>
          <NavLink to="/login" className={navClass} onClick={closeMenu}>
            <User size={18} />
            <span>Anmelden</span>
          </NavLink>
          <NavLink
            to="/login"
            className={navClass}
            onClick={closeMenu}
            data-testid="event-create-cta"
          >
            <PlusCircle size={18} />
            <span>Event erstellen</span>
          </NavLink>
        </>
      )}
    </>
  );

  const profilePhotoURL = profile?.photoURL || user?.photoURL;
  const profileTarget = user ? '/profil' : '/login';
  const profileLabel = user ? 'Mein Profil' : 'Anmelden';

  return (
    <header
      className={`header${menuOpen ? ' header--menu-open' : ''}${
        isHeaderVisible ? '' : ' header--hidden'
      }`}
      data-header-visible={isHeaderVisible}
    >
      <nav className="header-container" aria-label="Hauptnavigation">
        <Link to="/" className="logo" onClick={closeMenu}>
          <div className="logo-icon">
            <img src="/logo-mark.svg" alt="" aria-hidden="true" />
          </div>
          <div className="logo-text">
            <span className="logo-title">Dein Vorarlberger Kalender</span>
            <span className="logo-subtitle">für bewusste Events</span>
          </div>
        </Link>

        <div className="nav-desktop">{renderNavLinks()}</div>

        {/* Tablet+phone only — quick login/profile shortcut next to the
            burger so users do not have to open the mobile menu to sign in
            (or to reach their profile when already signed in). Hidden on
            desktop where the nav already exposes the same actions. */}
        <Link
          to={profileTarget}
          className="header-profile-button"
          aria-label={profileLabel}
          data-testid="header-profile-button"
          onClick={closeMenu}
        >
          {profilePhotoURL ? (
            <img
              src={profilePhotoURL}
              alt=""
              className="header-profile-avatar"
              aria-hidden="true"
              data-testid="header-profile-avatar"
            />
          ) : (
            <UserCircle size={24} aria-hidden="true" />
          )}
        </Link>

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

      <EmailVerificationModal
        open={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />
    </header>
  );
}
