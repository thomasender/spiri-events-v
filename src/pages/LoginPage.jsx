import { Navigate, useLocation } from 'react-router-dom';
import { getReturnPath } from '../utils/returnPath';
import { useAuth } from '../hooks/useAuth';
import AuthForm from '../components/AuthForm';
import SeoMeta from '../components/SeoMeta';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="loading-spinner"></div>;

  if (user) return <Navigate to={getReturnPath(location.state)} replace />;

  return (
    <>
      <SeoMeta title="Anmelden" path="/login" noindex />
      <AuthForm />
    </>
  );
}
