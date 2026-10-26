import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { useUnreadFeedbackCount } from '../hooks/useFeedbackList';
import { useChatAccess, useMessengerAccess } from '../hooks/useChatSettings';
import { useThreads } from '../hooks/useMessenger';
import { useChatPresence } from '../hooks/useChatPresence';
import EmailVerificationModal from './EmailVerificationModal';
import AvatarImage from './AvatarImage';
import RegionSwitcher, { RegionMenuList } from './RegionSwitcher';
import { useRegion } from '../hooks/useRegion';
import { useRegionTexts } from '../hooks/useRegionTexts';
import { customSlogan, DEFAULT_SLOGAN_LINE2 } from '../utils/regionAboutText';
import MentionBell from './MentionBell';
import {
  Users,
  Calendar,
  Heart,
  Flame,
  Mail,
  ChevronDown,
  LogOut,
  User,
  PlusCircle,
  UserCircle,
  Pen,
  Menu,
  X,
} from 'lucide-react';
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
  const regionTexts = useRegionTexts();
  const {
    comingSoon,
    regionId,
    region,
    isNational,
    combinedView,
    neutralHeader,
    regionChooserOpen,
  } = useRegion();
  const slogan = !neutralHeader && !isNational && !combinedView ? customSlogan(region) : null;
  // On a coming-soon region page the event belongs to that region.
  const addEventPath = comingSoon && regionId ? `/admin/new?region=${regionId}` : '/admin/new';
  const isAdmin = role === 'Admin';
  const navigate = useNavigate();
  const location = useLocation();
  const { count: unreadMessageCount } = useUnreadMessageCount();
  const { count: unreadFeedbackCount } = useUnreadFeedbackCount(isAdmin);
  const { available: chatAvailable } = useChatAccess();
  const { count: chatOnline } = useChatPresence(chatAvailable);
  const { available: messengerAvailable } = useMessengerAccess();
  const { unreadCount: dmUnread } = useThreads(messengerAvailable);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const menuRef = useRef(null);
  const toggleRef = useRef(null);
  const accountRef = useRef(null);
  const accountToggleRef = useRef(null);

  const closeMenu = () => {
    setMenuOpen(false);
    setAccountOpen(false);
  };

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

  // The desktop account menu closes on Escape (focus returns to its button)
  // and on a click or tap outside of it.
  useEffect(() => {
    if (!accountOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setAccountOpen(false);
        accountToggleRef.current?.focus();
      }
    };
    const onPointer = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [accountOpen]);

  const unreadCount = unreadMessageCount + unreadFeedbackCount;
  const hasUnread = unreadCount > 0;

  const profilePhotoURL = profile?.photoURL || user?.photoURL;

  // ---- Nav items. Desktop groups them (primary links, actions, account menu),
  // the mobile menu lists them flat. -------------------------------------------

  const calendarLink = (
    <NavLink to="/" className={navClass} end onClick={closeMenu}>
      <Calendar size={18} />
      <span>Kalender</span>
    </NavLink>
  );

  const directoryLink = (
    <NavLink to="/verzeichnis" className={navClass} onClick={closeMenu}>
      <Users size={18} />
      <span>Verzeichnis</span>
    </NavLink>
  );

  const chatLink = chatAvailable && (
    <NavLink
      to="/chat"
      className={navClass}
      onClick={closeMenu}
      data-testid="nav-chat"
      aria-label={
        chatOnline > 0
          ? `Lagerfeuer (${chatOnline} ${chatOnline === 1 ? 'Person' : 'Personen'} online)`
          : 'Lagerfeuer'
      }
    >
      <span className="nav-link-admin-icon">
        <Flame size={18} aria-hidden="true" />
        {chatOnline > 0 && (
          <span
            className="nav-link-badge nav-link-badge--presence"
            data-testid="chat-online-badge"
            aria-hidden="true"
          >
            {chatOnline > 9 ? '9+' : chatOnline}
          </span>
        )}
      </span>
      <span>Lagerfeuer</span>
    </NavLink>
  );

  // On desktop the label is visually hidden: an envelope with a bubble is the
  // familiar pattern and saves space. The text stays for screen readers.
  const messengerLink = (iconOnly) =>
    messengerAvailable && (
      <NavLink
        to="/postfach"
        className={({ isActive }) =>
          `${navClass({ isActive })}${iconOnly ? ' nav-link--icon' : ''}`
        }
        onClick={closeMenu}
        data-testid="nav-messenger"
        title={iconOnly ? 'Postfach' : undefined}
        aria-label={
          dmUnread > 0
            ? `Postfach (${dmUnread} ungelesene ${dmUnread === 1 ? 'Unterhaltung' : 'Unterhaltungen'})`
            : 'Postfach'
        }
      >
        <span className="nav-link-admin-icon">
          <Mail size={18} aria-hidden="true" />
          {dmUnread > 0 && (
            <span
              className="nav-link-badge"
              data-testid="messenger-unread-badge"
              aria-hidden="true"
            >
              {dmUnread > 9 ? '9+' : dmUnread}
            </span>
          )}
        </span>
        <span>Postfach</span>
      </NavLink>
    );

  const favoritesLink = (
    <NavLink to="/favoriten" className={navClass} onClick={closeMenu}>
      <Heart size={18} aria-hidden="true" />
      <span>Meine Favoriten</span>
    </NavLink>
  );

  const adminLink = (
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

  const profileLink = (
    <NavLink to="/profil" className={navClass} onClick={closeMenu}>
      {profilePhotoURL ? (
        <AvatarImage
          src={profilePhotoURL}
          focalPoint={profile?.photoURL ? profile.photoFocalPoint : null}
          zoom={profile?.photoURL ? profile.photoZoom : 1}
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
  );

  const createLink = (extraClass = '') =>
    canCreateEvents ? (
      <NavLink
        to={addEventPath}
        className={({ isActive }) => `${navClass({ isActive })}${extraClass}`}
        onClick={closeMenu}
      >
        <PlusCircle size={18} />
        <span>Event erstellen</span>
      </NavLink>
    ) : (
      <button
        type="button"
        className={`nav-link nav-link--disabled${extraClass}`}
        onClick={openVerificationModal}
        title="Bitte bestätige zuerst deine E-Mail-Adresse, um Events zu erstellen."
        data-testid="event-create-locked"
      >
        <PlusCircle size={18} aria-hidden="true" />
        <span>Event erstellen</span>
      </button>
    );

  const logoutButton = (
    <button type="button" onClick={handleLogout} className="nav-link nav-link--logout">
      <LogOut size={18} />
      <span>Abmelden</span>
    </button>
  );

  const loggedOutLinks = (extraClass = '') => (
    <>
      <NavLink to="/login" className={navClass} onClick={closeMenu}>
        <User size={18} />
        <span>Anmelden</span>
      </NavLink>
      <NavLink
        to="/login"
        className={({ isActive }) => `${navClass({ isActive })}${extraClass}`}
        onClick={closeMenu}
        data-testid="event-create-cta"
      >
        <PlusCircle size={18} />
        <span>Event erstellen</span>
      </NavLink>
    </>
  );

  // Phones: one flat list, most used first, account things last.
  const renderMobileNav = () => (
    <>
      {calendarLink}
      {directoryLink}
      {user ? (
        <>
          {chatLink}
          {chatAvailable && <MentionBell uid={user.uid} variant="row" onNavigate={closeMenu} />}
          {messengerLink(false)}
          {createLink()}
          {favoritesLink}
          {profileLink}
          {adminLink}
          {logoutButton}
        </>
      ) : (
        loggedOutLinks()
      )}
    </>
  );

  // Desktop: places to go on the left, actions and the account menu on the
  // right. Favorites, profile, Verwaltung and logout live in the account menu.
  const accountActive =
    ['/profil', '/favoriten', '/admin'].some(
      (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
    ) && !location.pathname.startsWith('/admin/new');
  const renderDesktopNav = () => (
    <>
      <div className="nav-group nav-group--primary">
        {calendarLink}
        {directoryLink}
        {user && chatLink}
      </div>
      <div className="nav-group nav-group--actions">
        {user ? (
          <>
            {createLink(' nav-link--create')}
            {chatAvailable && <MentionBell uid={user.uid} />}
            {messengerLink(true)}
            <div className="account-menu" ref={accountRef}>
              <button
                ref={accountToggleRef}
                type="button"
                className={`account-menu-toggle${accountActive ? ' account-menu-toggle--active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-controls="account-menu-panel"
                aria-label={
                  hasUnread
                    ? `Mein Konto (${unreadCount} ungelesene Benachrichtigungen)`
                    : 'Mein Konto'
                }
                onClick={() => setAccountOpen((open) => !open)}
                data-testid="account-menu-toggle"
              >
                <span className="nav-link-admin-icon">
                  {profilePhotoURL ? (
                    <AvatarImage
                      src={profilePhotoURL}
                      focalPoint={profile?.photoURL ? profile.photoFocalPoint : null}
                      zoom={profile?.photoURL ? profile.photoZoom : 1}
                      alt=""
                      className="account-avatar"
                      aria-hidden="true"
                    />
                  ) : (
                    <UserCircle size={28} aria-hidden="true" />
                  )}
                  {hasUnread && !accountOpen && (
                    <span
                      className="nav-link-badge"
                      data-testid="account-unread-badge"
                      aria-hidden="true"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                <ChevronDown size={16} aria-hidden="true" className="account-menu-chevron" />
              </button>
              <div
                id="account-menu-panel"
                className="account-menu-panel"
                role="group"
                aria-label="Mein Konto"
                hidden={!accountOpen}
              >
                {profileLink}
                {favoritesLink}
                {adminLink}
                <div className="account-menu-divider" role="separator" />
                {logoutButton}
              </div>
            </div>
          </>
        ) : (
          loggedOutLinks(' nav-link--create')
        )}
      </div>
    </>
  );

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
            <span className="logo-title">{slogan?.line1 || regionTexts.headerTitle}</span>
            <span className="logo-subtitle">{slogan?.line2 || DEFAULT_SLOGAN_LINE2}</span>
          </div>
        </Link>

        {/* Signed-in people change the region in their profile (Super-Admins in the footer).
            Not above "Wo suchst du?": no region name there. */}
        {!user && !regionChooserOpen && <RegionSwitcher />}

        <div className="nav-desktop">{renderDesktopNav()}</div>

        {/* Tablet+phone only — quick login/profile shortcut next to the
            burger so users do not have to open the mobile menu to sign in
            (or to reach their profile when already signed in). Hidden on
            desktop where the nav already exposes the same actions. */}
        <Link
          to="/verzeichnis"
          className="header-profile-button header-directory-button"
          aria-label="Verzeichnis"
          data-testid="header-directory-button"
          onClick={closeMenu}
        >
          <Users size={24} aria-hidden="true" />
        </Link>

        <Link
          to={profileTarget}
          className="header-profile-button"
          aria-label={profileLabel}
          data-testid="header-profile-button"
          onClick={closeMenu}
        >
          {profilePhotoURL ? (
            <AvatarImage
              src={profilePhotoURL}
              focalPoint={profile?.photoURL ? profile.photoFocalPoint : null}
              zoom={profile?.photoURL ? profile.photoZoom : 1}
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
        {!user && !regionChooserOpen && <RegionMenuList onNavigate={closeMenu} />}
        {renderMobileNav()}
      </div>

      <EmailVerificationModal
        open={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />
    </header>
  );
}
