import { Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useAuth } from './hooks/useAuth';
import AppCheckBanner from './components/AppCheckBanner';
import Header from './components/Header';
import Footer from './components/Footer';
import CalendarPage from './pages/CalendarPage';
import './lazyPageStyles/beforeEventDetail';
import EventDetailPage from './pages/EventDetailPage';
import './lazyPageStyles/afterEventDetail';
import FeedbackButton from './components/FeedbackButton';
import CreateEventFab from './components/CreateEventFab';
import SeedBootstrap from './components/SeedBootstrap';
import ThemeApplier from './components/ThemeApplier';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import ErrorPage from './pages/ErrorPage';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import DonationPopup from './components/DonationPopup';
import CookieConsent from './components/CookieConsent';
import OnlineStatusBeacon from './components/OnlineStatusBeacon';
import OutboundLinkTracker from './components/OutboundLinkTracker';
import { setAnalyticsAdminUser, trackPageView } from './lib/analytics';
import { CONSENT_CHANGE_EVENT, readConsent } from './lib/analyticsConsent';
import lazyWithReload from './lib/lazyWithReload';

// Landing pages (calendar, event detail) stay in the main bundle; everything
// else loads on demand so the first visit downloads less JavaScript.
const LoginPage = lazyWithReload(() => import('./pages/LoginPage'));
const AdminPage = lazyWithReload(() => import('./pages/AdminPage'));
const EventFormPage = lazyWithReload(() => import('./pages/EventFormPage'));
const LegalPage = lazyWithReload(() => import('./pages/LegalPage'));
const ProfilePage = lazyWithReload(() => import('./pages/ProfilePage'));
const ThemeEditorPage = lazyWithReload(() => import('./pages/ThemeEditorPage'));
const PublicProfilePage = lazyWithReload(() => import('./pages/PublicProfilePage'));
const AboutPage = lazyWithReload(() => import('./pages/AboutPage'));
const DirectoryPage = lazyWithReload(() => import('./pages/DirectoryPage'));
const FavoritesPage = lazyWithReload(() => import('./pages/FavoritesPage'));
const SpendenPage = lazyWithReload(() => import('./pages/SpendenPage'));
const SpendenDankePage = lazyWithReload(() => import('./pages/SpendenDankePage'));
const AuthActionPage = lazyWithReload(() => import('./pages/AuthActionPage'));
const ChatPage = lazyWithReload(() => import('./pages/ChatPage'));
const MessengerPage = lazyWithReload(() => import('./pages/MessengerPage'));

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
    <div className="app-layout">
      <SeedBootstrap />
      <ThemeApplier />
      <OnlineStatusBeacon />
      <ScrollToTop />
      <AnalyticsRouteTracker />
      <Header />
      <AppCheckBanner />
      <main className="main-content">
        <ErrorBoundary>
          <Suspense fallback={<div className="loading-spinner"></div>}>
            <Routes>
              <Route path="/" element={<CalendarPage />} />
              <Route path="/calendar" element={<Navigate to="/" replace />} />
              <Route path="/event/:slug" element={<EventDetailPage />} />
              <Route path="/verzeichnis" element={<DirectoryPage />} />
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
                    <ThemeEditorPage />
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
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/postfach"
                element={
                  <ProtectedRoute>
                    <MessengerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/postfach/:uid"
                element={
                  <ProtectedRoute>
                    <MessengerPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/:slug" element={<PublicProfilePage />} />
              <Route path="*" element={<ErrorPage type="not-found" />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <FeedbackButton />
      <CreateEventFab />
      <PwaInstallPrompt />
      <DonationPopup />
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
