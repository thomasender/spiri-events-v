import { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AlertTriangle, ExternalLink, RefreshCw, SkipForward } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import {
  useInstagramSettings,
  useInstagramPosts,
  useUnpostedConsentEvents,
} from '../hooks/useInstagramAdmin';
import './InstagramTab.css';

export const TOKEN_WARNING_DAYS = 14;

const STATUS_LABELS = {
  publishing: 'Wird veröffentlicht',
  published: 'Veröffentlicht',
  failed: 'Fehlgeschlagen',
  skipped: 'Übersprungen',
};

const OUTCOME_MESSAGES = {
  published: 'Der Beitrag wurde veröffentlicht.',
  failed: 'Der Versuch ist erneut fehlgeschlagen. Details stehen in der Liste.',
  skipped: 'Das Event liegt in der Vergangenheit und wurde übersprungen.',
  disabled: 'Die Automatik ist ausgeschaltet. Bitte zuerst einschalten.',
  'no-consent': 'Der Veranstalter hat der Veröffentlichung auf Instagram nicht zugestimmt.',
  duplicate: 'Es existiert bereits ein Eintrag für dieses Event.',
};

function formatDate(date) {
  return date ? date.toLocaleDateString('de-AT') : '–';
}

function formatDateTime(date) {
  return date ? date.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' }) : '–';
}

export function daysUntil(date, now = new Date()) {
  return Math.floor((date.getTime() - now.getTime()) / 86400000);
}

export default function InstagramTab() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
  } = useInstagramSettings(isAdmin);
  const { posts, titles, loading: postsLoading, error: postsError } = useInstagramPosts(isAdmin);
  const { events: unposted, error: unpostedError } = useUnpostedConsentEvents(isAdmin, posts);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  if (!isAdmin) return null;

  const enabled = settings?.enabled === true;

  const toggle = async () => {
    setSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'app_settings', 'instagram'),
        { enabled: !enabled, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null },
        { merge: true }
      );
    } catch (err) {
      console.error('Instagram toggle failed:', err);
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (post, callableName) => {
    setBusyId(post.id);
    setError(null);
    setMessage(null);
    try {
      const result = await httpsCallable(functions, callableName, { timeout: 540000 })({
        eventId: post.eventId,
      });
      const outcome = result?.data?.outcome;
      setMessage(OUTCOME_MESSAGES[outcome] || 'Erledigt.');
    } catch (err) {
      console.error(`${callableName} failed:`, err?.code, err?.message);
      setError(`Aktion fehlgeschlagen (${err?.code || 'unbekannt'}). Bitte erneut versuchen.`);
    } finally {
      setBusyId(null);
    }
  };

  const expiresAt = settings?.tokenExpiresAt ?? null;
  const daysLeft = expiresAt ? daysUntil(expiresAt) : null;
  const tokenWarn = daysLeft !== null && daysLeft < TOKEN_WARNING_DAYS;

  return (
    <section className="instagram-tab" data-testid="instagram-tab">
      <p className="instagram-description">
        Genehmigte Events werden automatisch auf Instagram gepostet, solange die Automatik
        eingeschaltet ist.
      </p>

      {(settingsError || postsError || unpostedError) && (
        <p className="instagram-error" role="alert">
          Daten konnten nicht geladen werden.
        </p>
      )}
      {error && (
        <p className="instagram-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="instagram-info" role="status">
          {message}
        </p>
      )}

      <div className="instagram-card">
        <div className="instagram-switch-row">
          <div>
            <h2>Automatisches Posten</h2>
            <p
              className={`instagram-state instagram-state--${enabled ? 'on' : 'off'}`}
              data-testid="instagram-state"
            >
              {enabled ? 'Eingeschaltet' : 'Ausgeschaltet'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Automatisches Posten auf Instagram"
            className={`instagram-switch${enabled ? ' instagram-switch--on' : ''}`}
            onClick={toggle}
            disabled={saving || settingsLoading}
            data-testid="instagram-toggle"
          >
            <span className="instagram-switch-knob" />
          </button>
        </div>
      </div>

      <div className="instagram-card" data-testid="instagram-token">
        <h2>Zugangs-Token</h2>
        {tokenWarn && (
          <p className="instagram-warning" role="alert" data-testid="instagram-token-warning">
            <AlertTriangle size={16} aria-hidden="true" />
            {daysLeft < 0
              ? 'Der Token ist abgelaufen. Bitte umgehend erneuern.'
              : `Der Token läuft in ${daysLeft} Tagen ab. Bitte prüfen, ob die automatische Erneuerung funktioniert.`}
          </p>
        )}
        <dl className="instagram-facts">
          <dt>Läuft ab am</dt>
          <dd data-testid="instagram-token-expiry">
            {expiresAt ? `${formatDate(expiresAt)} (noch ${daysLeft} Tage)` : '–'}
          </dd>
          <dt>Zuletzt erneuert</dt>
          <dd>{formatDateTime(settings?.tokenRefreshedAt ?? null)}</dd>
          <dt>Letzter Fehler</dt>
          <dd data-testid="instagram-token-error">{settings?.tokenRefreshError || 'Keiner'}</dd>
        </dl>
      </div>

      {unposted.length > 0 && (
        <div className="instagram-card" data-testid="instagram-unposted">
          <h2>Genehmigt, aber noch nicht gepostet</h2>
          <p className="instagram-muted">
            Der Veranstalter hat zugestimmt und das Event liegt noch in der Zukunft, ein Beitrag
            wurde aber noch nicht veröffentlicht (nie versucht, übersprungen oder fehlgeschlagen).
          </p>
          <ul className="instagram-posts">
            {unposted.map((event) => (
              <li
                key={event.eventId}
                className="instagram-post"
                data-testid="instagram-unposted-event"
              >
                <div className="instagram-post-main">
                  <strong>{event.title}</strong>
                  <span className="instagram-muted">{event.date || ''}</span>
                  <span className="instagram-muted" data-testid="instagram-unposted-status">
                    {event.postStatus ? STATUS_LABELS[event.postStatus] : 'Noch nicht versucht'}
                  </span>
                </div>
                <div className="instagram-post-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busyId === event.eventId}
                    onClick={() =>
                      runAction(
                        { id: event.eventId, eventId: event.eventId },
                        'adminRetryInstagramPost'
                      )
                    }
                  >
                    <RefreshCw size={14} aria-hidden="true" /> Jetzt posten
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="instagram-card">
        <h2>Beiträge</h2>
        {postsLoading ? (
          <p className="instagram-muted">Lade …</p>
        ) : posts.length === 0 ? (
          <p className="instagram-muted" data-testid="instagram-empty">
            Noch keine Instagram-Beiträge.
          </p>
        ) : (
          <ul className="instagram-posts">
            {posts.map((post) => {
              const title = titles[post.eventId] || post.eventId;
              const busy = busyId === post.id;
              return (
                <li key={post.id} className="instagram-post" data-testid="instagram-post">
                  <div className="instagram-post-main">
                    <strong>{title}</strong>
                    <span
                      className={`instagram-badge instagram-badge--${post.status}`}
                      data-testid="instagram-post-status"
                    >
                      {STATUS_LABELS[post.status] || post.status}
                    </span>
                    <span className="instagram-muted">Versuche: {post.attempts}</span>
                    {post.permalink && (
                      <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                        Auf Instagram ansehen <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  {post.status === 'published' && post.inviteFallbackReason && (
                    <span className="instagram-muted" data-testid="instagram-post-no-invite">
                      ohne Einladung
                    </span>
                  )}
                  {post.error && (
                    <p className="instagram-post-error" data-testid="instagram-post-error">
                      {post.error}
                    </p>
                  )}
                  {(post.status === 'failed' || post.status === 'publishing') && (
                    <div className="instagram-post-actions">
                      {post.status === 'failed' && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => runAction(post, 'adminRetryInstagramPost')}
                        >
                          <RefreshCw size={14} aria-hidden="true" /> Erneut versuchen
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => runAction(post, 'adminSkipInstagramPost')}
                      >
                        <SkipForward size={14} aria-hidden="true" /> Überspringen
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
