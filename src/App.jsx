import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { useAuth } from './hooks/useAuth';
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
import PublicProfilePage from './pages/PublicProfilePage';
import AboutPage from './pages/AboutPage';
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

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-spinner"></div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
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
      <ScrollToTop />
      <Header />
      <main className="main-content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<CalendarPage />} />
            <Route path="/calendar" element={<Navigate to="/" replace />} />
            <Route path="/event/:slug" element={<EventDetailPage />} />
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
            <Route path="/:slug" element={<PublicProfilePage />} />
            <Route path="*" element={<ErrorPage type="not-found" />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
      <FeedbackButton />
      <CreateEventFab />
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
