import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { MailOpen, PartyPopper } from 'lucide-react';
import { functions } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import SeoMeta from '../components/SeoMeta';
import ModeratorOnboardingWizard from '../components/ModeratorOnboardingWizard';
import {
  MODERATOR_ONBOARDING_TEXT_VERSION,
  inviteErrorMessage,
  tribeNames,
} from '../utils/moderatorOnboardingText';
import './ModeratorOnboardingPage.css';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function Shell({ children }) {
  return (
    <div className="page-container mod-invite-page fade-enter">
      <SeoMeta title="Einladung ins Moderations-Team" path="/einladung" noindex />
      <div className="mod-invite-card">{children}</div>
    </div>
  );
}

// /einladung?t=<token>: an invited person takes the onboarding and becomes
// Regions-Moderator:in (functions/src/moderatorInvites.ts). The token stays in the
// URL, so the way through login or registration (`from`) leads back here.
export default function ModeratorOnboardingPage() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const validToken = TOKEN_PATTERN.test(token);
  const { user, loading: authLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [accepted, setAccepted] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await httpsCallable(functions, 'getModeratorInvite')({ token });
      setInvite(result.data);
    } catch (err) {
      console.error('Loading the invitation failed:', err);
      setLoadError(err);
    }
  }, [token]);

  useEffect(() => {
    if (validToken) load();
  }, [validToken, load]);

  const from = `${location.pathname}${location.search}`;

  if (!validToken) {
    return (
      <Shell>
        <h1 className="mod-invite-title">Einladung nicht gefunden</h1>
        <p className="mod-invite-text">
          Dieser Einladungslink ist unvollständig. Bitte öffne ihn direkt aus der E-Mail.
        </p>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <h1 className="mod-invite-title">Einladung nicht gefunden</h1>
        <p className="mod-invite-text" role="alert">
          {inviteErrorMessage(loadError)}
        </p>
        <button type="button" className="btn btn-secondary" onClick={load}>
          Erneut versuchen
        </button>
      </Shell>
    );
  }

  if (!invite || authLoading) {
    return (
      <Shell>
        <div className="loading-spinner" />
      </Shell>
    );
  }

  const tribe = tribeNames(invite.regionNames);

  if (accepted) {
    return (
      <Shell>
        <PartyPopper size={40} className="mod-invite-icon" aria-hidden="true" />
        <h1 className="mod-invite-title">Willkommen im Team!</h1>
        <p className="mod-invite-text">
          Du bist jetzt Moderator:in beim {tribe}. In der Verwaltung findest du die Events, die auf
          eine Freigabe warten. Schön, dass du da bist!
        </p>
        {/* Full reload, so the new role is read again. */}
        <a href="/admin" className="btn btn-primary" data-testid="mod-invite-to-admin">
          Zur Verwaltung
        </a>
      </Shell>
    );
  }

  if (invite.state !== 'pending') {
    const text = {
      accepted: 'Diese Einladung wurde schon angenommen.',
      revoked: 'Diese Einladung wurde zurückgezogen.',
      expired: 'Diese Einladung ist abgelaufen. Bitte frag nach einer neuen Einladung.',
    }[invite.state];
    return (
      <Shell>
        <h1 className="mod-invite-title">Einladung vom {tribe}</h1>
        <p className="mod-invite-text" data-testid="mod-invite-state">
          {text}
        </p>
        <Link to="/" className="btn btn-secondary">
          Zum Kalender
        </Link>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <MailOpen size={40} className="mod-invite-icon" aria-hidden="true" />
        <h1 className="mod-invite-title">Du bist eingeladen!</h1>
        <p className="mod-invite-text">
          Schön, dass du beim {tribe} als Moderator:in mitwirken möchtest. Melde dich zuerst mit{' '}
          <strong>{invite.email}</strong> an. Hast du noch kein Konto, legst du es in einer Minute
          an. Danach geht es hier weiter.
        </p>
        <div className="mod-invite-actions">
          <Link
            to="/login"
            state={{ from, email: invite.email }}
            className="btn btn-primary"
            data-testid="mod-invite-login"
          >
            Anmelden
          </Link>
          <Link
            to="/login"
            state={{ from, email: invite.email, authMode: 'register' }}
            className="btn btn-secondary"
            data-testid="mod-invite-register"
          >
            Konto anlegen
          </Link>
        </div>
      </Shell>
    );
  }

  const accountEmail = (user.email || '').trim().toLowerCase();
  if (accountEmail !== invite.email) {
    return (
      <Shell>
        <h1 className="mod-invite-title">Anderes Konto nötig</h1>
        <p className="mod-invite-text" role="alert" data-testid="mod-invite-wrong-account">
          Diese Einladung gilt für <strong>{invite.email}</strong>. Du bist gerade mit{' '}
          <strong>{user.email || 'einem anderen Konto'}</strong> angemeldet. Bitte melde dich mit{' '}
          {invite.email} an.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            await logout();
            navigate('/login', { state: { from, email: invite.email } });
          }}
        >
          Abmelden und mit {invite.email} anmelden
        </button>
      </Shell>
    );
  }

  const accept = async ({ consents, signatureName }) => {
    await httpsCallable(
      functions,
      'acceptModeratorInvite'
    )({
      token,
      consents,
      signatureName,
      textVersion: MODERATOR_ONBOARDING_TEXT_VERSION,
    });
    setAccepted(true);
  };

  return (
    <Shell>
      <ModeratorOnboardingWizard
        tribe={tribe}
        onSubmit={accept}
        errorMessage={(err) => inviteErrorMessage(err, invite.email)}
      />
    </Shell>
  );
}
