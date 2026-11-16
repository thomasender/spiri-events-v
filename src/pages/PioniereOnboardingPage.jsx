import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, PartyPopper, Sprout } from 'lucide-react';
import { callable } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useMembershipAccess, useOwnMembership } from '../hooks/useMembership';
import SeoMeta from '../components/SeoMeta';
import ErrorPage from './ErrorPage';
import PioniereWizard from '../components/PioniereWizard';
import { isMembershipRunning, membershipErrorMessage } from '../utils/clubMembership';
import './ModeratorOnboardingPage.css';
import './PioniereOnboardingPage.css';

function Shell({ children, title = 'Pionier:in werden' }) {
  return (
    <div className="page-container mod-invite-page fade-enter">
      <SeoMeta title={title} path="/pioniere" noindex />
      <div className="mod-invite-card">{children}</div>
    </div>
  );
}

// /pioniere: sign-up for the Vereinsmitgliedschaft "Pioniere" (Trello 6af620c0),
// behind the flag app_settings/membership. A login is required (no guest sign-up):
// guests get "Anmelden" / "Konto anlegen" and come back here. Paying starts the
// Mollie checkout; membership begins once the first payment is paid (webhook).
export default function PioniereOnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const access = useMembershipAccess();
  const { profile, loading: profileLoading } = useProfile(user?.uid);
  const { membership, loading: membershipLoading } = useOwnMembership(user?.uid);

  if (access.loading || authLoading) {
    return (
      <Shell>
        <div className="loading-spinner" />
      </Shell>
    );
  }

  if (!access.visible) return <ErrorPage type="not-found" />;

  const from = `${location.pathname}${location.search}`;

  if (!user) {
    return (
      <Shell>
        <Sprout size={40} className="mod-invite-icon" aria-hidden="true" />
        <h1 className="mod-invite-title">Werde Pionier:in</h1>
        <p className="mod-invite-text">
          Schön, dass du Vereinsmitglied werden möchtest! Melde dich dazu zuerst an. Hast du noch
          kein Konto, legst du es in einer Minute an. Danach geht es hier weiter.
        </p>
        <div className="mod-invite-actions">
          <Link
            to="/login"
            state={{ from }}
            className="btn btn-primary"
            data-testid="pioniere-login"
          >
            Anmelden
          </Link>
          <Link
            to="/login"
            state={{ from, authMode: 'register' }}
            className="btn btn-secondary"
            data-testid="pioniere-register"
          >
            Konto anlegen
          </Link>
        </div>
      </Shell>
    );
  }

  if (profileLoading || membershipLoading) {
    return (
      <Shell>
        <div className="loading-spinner" />
      </Shell>
    );
  }

  if (isMembershipRunning(membership)) {
    return (
      <Shell>
        <CheckCircle2 size={40} className="mod-invite-icon" aria-hidden="true" />
        <h1 className="mod-invite-title">Du bist schon Pionier:in</h1>
        <p className="mod-invite-text" data-testid="pioniere-already-member">
          Danke, dass du den Tribe mitträgst! Deine Mitgliedschaft findest du in deinem Profil.
        </p>
        <Link to="/profil#pioniere" className="btn btn-primary">
          Zu meinem Profil
        </Link>
      </Shell>
    );
  }

  const start = async ({ amount, name, consents }) => {
    const result = await callable('createMembershipCheckout')({ amount, name, consents });
    window.location.assign(result.data.checkoutUrl);
  };

  return (
    <Shell>
      <PioniereWizard
        initialName={profile?.displayName || user.displayName || ''}
        email={user.email || ''}
        statutesUrl={access.statutesUrl}
        isAdmin={access.isAdmin}
        onSubmit={start}
        errorMessage={membershipErrorMessage}
      />
    </Shell>
  );
}

// /pioniere/danke: back from Mollie. The membership turns active as soon as the
// payment is confirmed (usually within seconds); the page follows it live.
export function PioniereDankePage() {
  const { user } = useAuth();
  const { membership } = useOwnMembership(user?.uid);
  const active = isMembershipRunning(membership);
  return (
    <Shell title="Danke, Pionier:in">
      <PartyPopper size={40} className="mod-invite-icon" aria-hidden="true" />
      <h1 className="mod-invite-title">Danke!</h1>
      {active ? (
        <p className="mod-invite-text" data-testid="pioniere-danke-active">
          Deine Zahlung ist angekommen, du bist jetzt Pionier:in. Eine Bestätigung mit allen Details
          ist per E-Mail unterwegs.
        </p>
      ) : (
        <p className="mod-invite-text" data-testid="pioniere-danke-pending">
          Sobald Mollie deine Zahlung bestätigt, bist du Pionier:in und bekommst eine Bestätigung
          per E-Mail. Das dauert meist nur einen Moment. Wurde die Zahlung abgebrochen, kannst du es
          jederzeit noch einmal versuchen.
        </p>
      )}
      <div className="mod-invite-actions">
        <Link to="/profil#pioniere" className="btn btn-primary">
          Zu meinem Profil
        </Link>
        <Link to="/" className="btn btn-secondary">
          Zum Kalender
        </Link>
      </div>
    </Shell>
  );
}
