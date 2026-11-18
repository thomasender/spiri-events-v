import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { claimCuratedEvents, listMyClaimableEvents } from '../lib/eventClaim';
import {
  claimErrorMessage,
  claimResultMessage,
  dismissClaimBanner,
  isClaimBannerDismissed,
} from '../utils/eventClaim';
import './EventClaim.css';

const SHOWN_EVENTS = 5;

export function formatClaimDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// "Veranstalter-Übernahme" (docs/event-import.md, "Claim"): the curation team
// already entered events whose contact address is this account's confirmed
// e-mail. Shown in "Meine Events" until the person takes them over or says
// "Später" (once per account and browser). Titles and dates only.
export default function ClaimableEventsBanner() {
  const { user, emailVerified } = useAuth();
  const uid = user?.uid ?? null;
  const verified = Boolean(emailVerified);
  const [listing, setListing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!uid || !verified || isClaimBannerDismissed(uid)) return undefined;
    let cancelled = false;
    listMyClaimableEvents()
      .then((result) => {
        if (!cancelled) setListing(result);
      })
      // The banner is a nice-to-have: no message when the lookup fails.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid, verified]);

  if (hidden || !uid || (!done && !(listing?.total > 0))) return null;

  const claim = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await claimCuratedEvents({});
      setDone(claimResultMessage(result));
      dismissClaimBanner(uid);
    } catch (err) {
      setError(claimErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    dismissClaimBanner(uid);
    setHidden(true);
  };

  if (done) {
    return (
      <div className="event-claim-banner" role="status" data-testid="claim-banner">
        <p className="event-claim-title">Events übernommen</p>
        <p className="event-claim-text" data-testid="claim-banner-success">
          {done}
        </p>
      </div>
    );
  }

  const shown = listing.events.slice(0, SHOWN_EVENTS);
  const more = listing.total - shown.length;

  return (
    <div
      className="event-claim-banner"
      role="region"
      aria-label="Veranstalter-Übernahme"
      data-testid="claim-banner"
    >
      <p className="event-claim-title">Wir haben schon Events für dich eingetragen</p>
      <p className="event-claim-text">
        Unser Team hat {listing.total === 1 ? 'ein Event' : `${listing.total} Events`} von deiner
        Website bei uns eingetragen. Übernimm {listing.total === 1 ? 'es' : 'sie'} in dein Konto,
        dann kannst du {listing.total === 1 ? 'es' : 'sie'} selbst bearbeiten.
      </p>
      <ul className="event-claim-list">
        {shown.map((ev, i) => (
          <li key={`${ev.date}-${ev.title}-${i}`}>
            {ev.title}
            {ev.date && ` (${formatClaimDate(ev.date)})`}
          </li>
        ))}
        {more > 0 && <li>und {more === 1 ? 'ein weiteres' : `${more} weitere`}</li>}
      </ul>
      {error && (
        <p className="event-claim-feedback event-claim-feedback--error" role="alert">
          {error}
        </p>
      )}
      <div className="event-claim-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={claim}
          disabled={busy}
          data-testid="claim-banner-claim"
        >
          {busy ? 'Wird übernommen…' : 'Events übernehmen'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={later} disabled={busy}>
          Später
        </button>
      </div>
    </div>
  );
}
