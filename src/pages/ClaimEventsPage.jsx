import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CalendarCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { claimCuratedEvents } from '../lib/eventClaim';
import {
  claimErrorMessage,
  claimResultMessage,
  clearPendingClaimToken,
  isClaimToken,
  readPendingClaimToken,
  savePendingClaimToken,
} from '../utils/eventClaim';
import SeoMeta from '../components/SeoMeta';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import '../components/EventClaim.css';

const PATH = '/uebernehmen';

// Reads `?claim=<token>` once, keeps it in localStorage and removes it from the
// address bar at once (history.replaceState), so it reaches neither the
// analytics (they drop the query anyway), nor a Referer, nor the `from` of
// the login, nor the confirmation mail.
function takeTokenFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('claim');
  if (token === null) return null;
  params.delete('claim');
  const rest = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`
  );
  if (!isClaimToken(token)) return null;
  savePendingClaimToken(token);
  return token;
}

function Shell({ children }) {
  return (
    <div className="page-container event-claim-page fade-enter">
      <SeoMeta title="Events übernehmen" path={PATH} noindex />
      <Helmet>
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="event-claim-card">{children}</div>
    </div>
  );
}

// /uebernehmen?claim=<token>: an organizer whose events the curation team
// entered takes them over into their own account (docs/event-import.md,
// "Claim"). Login / registration first (back here via `from` and, after the
// confirmation mail, via `next=/uebernehmen`), then claimCuratedEvents({ token }).
export default function ClaimEventsPage() {
  const { user, loading: authLoading, emailVerified, refreshEmailVerified } = useAuth();
  const [token] = useState(() => takeTokenFromUrl() ?? readPendingClaimToken());
  const [state, setState] = useState({ phase: 'idle', message: '' });
  const started = useRef(false);
  const verified = Boolean(user) && Boolean(emailVerified);

  const claim = useCallback(async () => {
    setState({ phase: 'working', message: '' });
    try {
      const result = await claimCuratedEvents({ token });
      clearPendingClaimToken();
      setState({ phase: 'done', result, message: claimResultMessage(result) });
    } catch (err) {
      const reason = err?.details?.reason;
      // A dead link stays dead: forget it. Other errors may pass (retry).
      if (
        ['invalid-token', 'token-expired', 'already-claimed', 'declined', 'blocked'].includes(
          reason
        )
      ) {
        clearPendingClaimToken();
      }
      setState({ phase: 'error', message: claimErrorMessage(err) });
    }
  }, [token]);

  // Waiting for the confirmation link (maybe clicked in another tab): check
  // again on focus and every 15 s, like the event wizard.
  useEffect(() => {
    if (!token || !user || verified) return undefined;
    const check = () => refreshEmailVerified?.();
    const timer = setInterval(check, 15000);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [token, user, verified, refreshEmailVerified]);

  useEffect(() => {
    if (!token || !user || !verified || started.current) return;
    started.current = true;
    claim();
  }, [token, user, verified, claim]);

  if (!token) {
    return (
      <Shell>
        <h1 className="event-claim-page-title">Link nicht gefunden</h1>
        <p className="event-claim-text">
          Dieser Link ist unvollständig. Bitte öffne ihn direkt aus unserer E-Mail.
        </p>
        <Link to="/" className="btn btn-secondary">
          Zum Kalender
        </Link>
      </Shell>
    );
  }

  if (authLoading) {
    return (
      <Shell>
        <div className="loading-spinner" />
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <CalendarCheck size={40} aria-hidden="true" />
        <h1 className="event-claim-page-title">Deine Events übernehmen</h1>
        <p className="event-claim-text">
          Wir haben Events von deiner Website bei uns eingetragen. Damit du sie selbst bearbeiten
          kannst, melde dich an. Hast du noch kein Konto, legst du es in einer Minute an. Danach
          geht es hier weiter.
        </p>
        <div className="event-claim-actions">
          <Link
            to="/login"
            state={{ from: PATH, authMode: 'register' }}
            className="btn btn-primary"
            data-testid="claim-register"
          >
            Konto anlegen
          </Link>
          <Link
            to="/login"
            state={{ from: PATH }}
            className="btn btn-secondary"
            data-testid="claim-login"
          >
            Ich habe schon ein Konto
          </Link>
        </div>
      </Shell>
    );
  }

  if (!verified) {
    return (
      <Shell>
        <h1 className="event-claim-page-title">Noch ein Schritt</h1>
        <EmailVerificationBanner
          title="Bitte bestätige deine E-Mail-Adresse."
          text={
            <>
              Wir haben dir eine E-Mail an <strong>{user.email}</strong> geschickt. Sobald du den
              Link darin geklickt hast, übernehmen wir deine Events.
            </>
          }
          afterVerify="claimEvents"
          showProfileLink={false}
        />
      </Shell>
    );
  }

  if (state.phase === 'done') {
    return (
      <Shell>
        <CalendarCheck size={40} aria-hidden="true" />
        <h1 className="event-claim-page-title">
          {state.result?.status === 'claimed' ? 'Willkommen!' : 'Danke!'}
        </h1>
        <p className="event-claim-text" data-testid="claim-result">
          {state.message}
        </p>
        <Link to="/admin" className="btn btn-primary">
          Zu meinen Events
        </Link>
      </Shell>
    );
  }

  if (state.phase === 'error') {
    return (
      <Shell>
        <h1 className="event-claim-page-title">Das hat nicht geklappt</h1>
        <p className="event-claim-text" role="alert" data-testid="claim-error">
          {state.message}
        </p>
        {readPendingClaimToken() && (
          <button type="button" className="btn btn-secondary" onClick={claim}>
            Erneut versuchen
          </button>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="loading-spinner" />
      <p className="event-claim-text">Deine Events werden übernommen…</p>
    </Shell>
  );
}
