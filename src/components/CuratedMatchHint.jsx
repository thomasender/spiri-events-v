import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { claimCuratedEvents, findCuratedMatches } from '../lib/eventClaim';
import { claimErrorMessage, claimResultMessage } from '../utils/eventClaim';
import './EventClaim.css';

export const MATCH_DEBOUNCE_MS = 800;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Event wizard (docs/event-import.md, "Claim"): when the title and date the
// person typed look like an event the curation team already entered, offer to
// take that over instead of creating a duplicate. Non-blocking, only for
// signed-in members with a confirmed e-mail, debounced; errors are ignored.
export default function CuratedMatchHint({ enabled, title, date, regionId }) {
  const [match, setMatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const ready = Boolean(enabled) && cleanTitle.length >= 3 && DATE_PATTERN.test(date || '');

  useEffect(() => {
    if (!ready || message) {
      if (!message) setMatch(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      findCuratedMatches({ title: cleanTitle, date, ...(regionId ? { regionId } : {}) })
        .then((result) => {
          if (!cancelled) setMatch(result?.matches?.[0] ?? null);
        })
        .catch(() => {
          if (!cancelled) setMatch(null);
        });
    }, MATCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, cleanTitle, date, regionId, message]);

  if (dismissed || (!match && !message)) return null;

  if (message) {
    return (
      <div className="curated-match-hint" role="status" data-testid="curated-match-hint">
        <p className="event-claim-text" data-testid="curated-match-result">
          {message}
        </p>
        <div className="event-claim-actions">
          <Link to="/admin" className="btn btn-secondary">
            Zu meinen Events
          </Link>
        </div>
      </div>
    );
  }

  const claim = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await claimCuratedEvents({ organizerId: match.organizerId });
      setMessage(claimResultMessage(result));
    } catch (err) {
      setError(claimErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="curated-match-hint" role="status" data-testid="curated-match-hint">
      <p className="event-claim-title">
        Dieses Event haben wir schon für dich eingetragen. Übernehmen statt neu anlegen?
      </p>
      <p className="event-claim-text">„{match.title}“</p>
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
          data-testid="curated-match-claim"
        >
          {busy ? 'Wird übernommen…' : 'Übernehmen'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setDismissed(true)}
          disabled={busy}
        >
          Nein, neu anlegen
        </button>
      </div>
    </div>
  );
}
