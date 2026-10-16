import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useAuth } from './hooks/useAuth';
import AppCheckBanner from './components/AppCheckBanner';
import Header from './components/Header';
import Footer from './components/Footer';
import CalendarPage from './pages/CalendarPage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import EventFormPage from './pages/EventFormPage';
import LegalPage from './pages/LegalPage';
import EventDetailPage from './pages/EventDetailPage';
import ProfilePage from './pages/ProfilePage';
import ThemeEditorPage from './pages/ThemeEditorPage';
import AboutPage from './pages/AboutPage';
import DirectoryPage from './pages/DirectoryPage';
import FavoritesPage from './pages/FavoritesPage';
import SpendenPage from './pages/SpendenPage';
import SpendenDankePage from './pages/SpendenDankePage';
import AuthActionPage from './pages/AuthActionPage';
import FeedbackButton from './components/FeedbackButton';
import CreateEventFab from './components/CreateEventFab';
import SeedBootstrap from './components/SeedBootstrap';
import ThemeApplier from './components/ThemeApplier';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import ErrorPage from './pages/ErrorPage';
import NoAccess from './components/NoAccess';
import RegionProvider from './components/RegionProvider';
import RegionChooser from './components/RegionChooser';
import {
  RegionAboutRoute,
  RegionDirectoryRoute,
  RegionOrProfileRoute,
} from './components/RegionRoutes';
import RegionsPage from './pages/RegionsPage';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import CookieConsent from './components/CookieConsent';
import OutboundLinkTracker from './components/OutboundLinkTracker';
import { setAnalyticsAdminUser, setAnalyticsRegion, trackPageView } from './lib/analytics';
import { analyticsRegionLabel } from './lib/analyticsEvents';
import { useRegion } from './hooks/useRegion';
import { CONSENT_CHANGE_EVENT, readConsent } from './lib/analyticsConsent';

// Helmet updates document.title on the next animation frame; wait a moment so
// page_view carries the new page's title rather than the previous one.
export const PAGE_VIEW_TITLE_DELAY_MS = 150;

// Sends one page_view per navigation (path only, never query or hash) and keeps
// admins out of the statistics.
export function AnalyticsRouteTracker() {
  const { pathname } = useLocation();
  const { role, loading } = useAuth();
  const [consented, setConsented] = useState(() => readConsent() === 'granted');
  const lastSent = useRef(null);
  const { regions, regionId, combinedView } = useRegion();
  const regionLabel = analyticsRegionLabel({ regions, regionId, combinedView });

  // Every event carries the region (only with two or more active regions).
  useEffect(() => {
    setAnalyticsRegion(regionLabel);
  }, [regionLabel]);

  // Treat the visitor as an admin until the auth role is known, so an admin's
  // first page view is never sent.
  useEffect(() => {
    setAnalyticsAdminUser(loading || Boolean(role));
  }, [loading, role]);

  useEffect(() => {
    const onChange = (event) => {
      setConsented(event.detail?.granted === true);
      if (event.detail?.granted !== true) lastSent.current = null;
    };
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!consented || loading || role || lastSent.current === pathname) return undefined;
    const timer = setTimeout(() => {
      lastSent.current = pathname;
      trackPageView(pathname, document.title);
    }, PAGE_VIEW_TITLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, consented, loading, role]);

  return null;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading-spinner"></div>;
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  return children;
}

// Areas only Super-Admins may open (e.g. the Theme editor). Everyone else,
// Regions-Moderator:innen included, gets a clear "Kein Zugriff" page instead
// of a half-working editor; the data itself is protected by the rules.
export function SuperAdminRoute({ children }) {
  const { role, loading } = useAuth();
  if (loading) {
    return <div className="loading-spinner"></div>;
  }
  if (role !== 'Admin') {
    return (
      <div className="admin-page">
        <NoAccess />
      </div>
    );
  }
  return children;
}

function AdminReviewRedirect() {
  const navigate = useNavigate();
  const hash =
    typeof window !== 'undefined' && typeof window.location.hash === 'string'
      ? window.location.hash
      : '';
  useEffect(() => {
    navigate(`/admin?tab=review${hash}`, { replace: true });
  }, [navigate, hash]);
  return null;
}

function AppContent() {
  return (
    <RegionProvider>
      <AppLayout />
    </RegionProvider>
  );
}

function AppLayout() {
  return (
    <div className="app-layout">
      <SeedBootstrap />
      <ThemeApplier />
      <ScrollToTop />
      <AnalyticsRouteTracker />
      <Header />
      <RegionChooser />
      <AppCheckBanner />
      <main className="main-content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<CalendarPage />} />
            <Route path="/calendar" element={<Navigate to="/" replace />} />
            <Route path="/event/:slug" element={<EventDetailPage />} />
            <Route path="/verzeichnis" element={<DirectoryPage />} />
            <Route path="/regionen" element={<RegionsPage />} />
            <Route path="/favoriten" element={<FavoritesPage />} />
            <Route path="/ueber-uns" element={<AboutPage />} />
            <Route path="/spenden" element={<SpendenPage />} />
            <Route path="/spenden/danke" element={<SpendenDankePage />} />
            <Route path="/auth-action" element={<AuthActionPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/datenschutz" element={<LegalPage page="datenschutz" />} />
            <Route path="/impressum" element={<LegalPage page="impressum" />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/review"
              element={
                <ProtectedRoute>
                  <AdminReviewRedirect />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/theme-editor"
              element={
                <ProtectedRoute>
                  <SuperAdminRoute>
                    <ThemeEditorPage />
                  </SuperAdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/new"
              element={
                <ProtectedRoute>
                  <EventFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/edit/:id"
              element={
                <ProtectedRoute>
                  <EventFormPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profil"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            {/* Region addresses share the top level with profiles: `/tirol` is a
                region, `/<username>` a profile (region slugs are reserved
                usernames). `/` and `/verzeichnis` stay valid. */}
            <Route path="/:regionSlug/verzeichnis" element={<RegionDirectoryRoute />} />
            <Route path="/:regionSlug/ueber-uns" element={<RegionAboutRoute />} />
            <Route path="/:slug" element={<RegionOrProfileRoute />} />
            <Route path="*" element={<ErrorPage type="not-found" />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
      <FeedbackButton />
      <CreateEventFab />
      <PwaInstallPrompt />
      <CookieConsent />
      <OutboundLinkTracker />
    </div>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </HelmetProvider>
  );
}
