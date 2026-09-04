import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AuthForm from '../components/AuthForm';
import SeoMeta from '../components/SeoMeta';

export default function LoginPage() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading-spinner"></div>;

  if (user) return <Navigate to="/" replace />;

  return (
    <>
      <SeoMeta title="Anmelden" path="/login" noindex />
      <AuthForm />
    </>
  );
}
