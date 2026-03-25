import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Header from './components/Header'
import CalendarPage from './pages/CalendarPage'
import LoginPage from './pages/LoginPage'
import AdminPage from './pages/AdminPage'
import EventFormPage from './pages/EventFormPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  // Still checking auth — wait for Firebase to restore session
  if (loading) {
    return <div className="loading-spinner"></div>
  }

  // Auth resolved — only redirect if definitively no user (not just "not yet checked")
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPage />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
