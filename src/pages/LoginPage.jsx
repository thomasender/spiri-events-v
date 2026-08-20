import { Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../hooks/useAuth';
import AuthForm from '../components/AuthForm';

export default function LoginPage() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading-spinner"></div>;

  if (user) return <Navigate to="/" replace />;

  return (
    <>
      <Helmet>
        <title>Anmelden | tribe Vorarlberg</title>
      </Helmet>
      <AuthForm />
    </>
  );
}
