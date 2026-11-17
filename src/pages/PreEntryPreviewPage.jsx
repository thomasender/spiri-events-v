import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Calendar, MapPin, User } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import RichTextView from '../components/RichTextView';
import PreEntryBanner from '../components/PreEntryBanner';
import { useAuth } from '../hooks/useAuth';
import { preEntryOrganizer } from '../hooks/usePreEntries';
import { formatEventDateLabel, getEventLocationLabel } from '../utils/eventFormat';
import { COMMENT_MAX, PRE_ENTRY_PRIVACY_PATH, preEntryErrorMessage } from '../utils/preEntries';
import './PreEntryPreviewPage.css';

const CONTACT_EMAIL = 'admin@thetribe.at';

// Secret preview of a pre-entered event (Trello 6afb1116, docs/pre-entries.md):
// /vorschau/<token>. No account needed to look, publish (under "Dein Tribe") or
// decline; editing goes through a profile: the event is taken over first and
// then edited in the normal form. noindex via meta, X-Robots-Tag and robots.txt.
export default function PreEntryPreviewPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [panel, setPanel] = useState(null); // null | 'publish' | 'reject'
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [done, setDone] = useState(null); // { kind, publicUrl?, takeoverUrl? }

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setPreview(await preEntryOrganizer('view', token));
    } catch (err) {
      console.error('Loading the preview failed:', err);
      setLoadError(preEntryErrorMessage(err));
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const returnState = { from: `/vorschau/${token}` };
  const goToLogin = (authMode) => navigate('/login', { state: { ...returnState, authMode } });

  const run = async (fn) => {
    setBusy(true);
    setActionError('');
    try {
      await fn();
    } catch (err) {
      console.error('Pre-entry action failed:', err);
      setActionError(preEntryErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const publishWithoutProfile = () =>
    run(async () => {
      const result = await preEntryOrganizer('publish', token, { rightsConfirmed: true });
      setDone({ kind: 'published', ...result });
    });

  const claim = (publish) =>
    run(async () => {
      const result = await preEntryOrganizer('claim', token, {
        publish,
        ...(publish ? { rightsConfirmed: true } : {}),
      });
      if (!publish && result.eventStatus !== 'approved') {
        navigate(`/admin/edit/${result.eventId}`, { state: { from: '/admin?tab=drafts' } });
        return;
      }
      setDone({ kind: 'claimed', publicUrl: result.slug ? `/event/${result.slug}` : null });
    });

  const reject = () =>
    run(async () => {
      await preEntryOrganizer('reject', token, { comment });
      setDone({ kind: 'rejected' });
    });

  const meta = (
    <>
      <SeoMeta title="Vorschau" path="/vorschau" robots="noindex, nofollow, noarchive" noindex />
      <Helmet>
        <meta name="referrer" content="no-referrer" />
      </Helmet>
    </>
  );

  if (loadError) {
    return (
      <div className="pre-entry-page">
        {meta}
        <p className="pre-entry-error" role="alert">
          {loadError}
        </p>
        <button type="button" className="btn btn-secondary" onClick={load}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="pre-entry-page">
        {meta}
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="pre-entry-page" data-testid="pre-entry-done">
        {meta}
        <DoneMessage done={done} />
      </div>
    );
  }

  const { state, event } = preview;
  if (state !== 'open' && state !== 'published') {
    return (
      <div className="pre-entry-page" data-testid={`pre-entry-state-${state}`}>
        {meta}
        <ClosedMessage state={state} />
      </div>
    );
  }

  const canPublish = preview.canPublish;
  const signedIn = Boolean(user) && !authLoading;

  return (
    <div className="pre-entry-page" data-testid="pre-entry-preview">
      {meta}
      <header className="pre-entry-header">
        <p className="pre-entry-kicker">
          {state === 'published' ? 'Dein Event ist online' : 'Vorschau deines Events'}
        </p>
        <h1>{event?.title}</h1>
        {state === 'open' && preview.kind === 'preview' && (
          <p className="pre-entry-intro">
            Wir haben dein Event für den Tribe-Kalender vorbereitet. Schau es dir in Ruhe an: Du
            kannst es veröffentlichen, nach dem Anmelden selbst bearbeiten oder uns sagen, dass du
            es nicht im Kalender haben möchtest.
          </p>
        )}
      </header>

      {state === 'open' && preview.kind === 'preview' && (
        <PreEntryBanner expiresAtMs={preview.expiresAtMs} />
      )}

      <EventPreview event={event} />

      {actionError && (
        <p className="pre-entry-error" role="alert">
          {actionError}
        </p>
      )}

      {state === 'published' && preview.canClaim && (
        <section className="pre-entry-box" data-testid="pre-entry-claim-box">
          <h2>Event in dein Profil übernehmen</h2>
          <p>
            Im Moment steht dein Event unter „Dein Tribe“. Mit einem kostenlosen Profil erscheint es
            bei dir und du kannst es jederzeit selbst bearbeiten.
          </p>
          {signedIn ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => claim(false)}
              data-testid="pre-entry-claim"
            >
              In mein Profil übernehmen
            </button>
          ) : (
            <AuthButtons onAuth={goToLogin} />
          )}
        </section>
      )}

      {state === 'open' && (
        <div className="pre-entry-actions" role="group" aria-label="Was möchtest du tun?">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => (signedIn ? claim(false) : goToLogin('register'))}
            data-testid="pre-entry-edit"
          >
            Bearbeiten
          </button>
          {canPublish && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setPanel('publish')}
              data-testid="pre-entry-open-publish"
            >
              Veröffentlichen
            </button>
          )}
          {preview.canReject && (
            <button
              type="button"
              className="btn btn-subtle-danger"
              onClick={() => setPanel('reject')}
              data-testid="pre-entry-open-reject"
            >
              Ablehnen
            </button>
          )}
        </div>
      )}
      {state === 'open' && !signedIn && (
        <p className="pre-entry-hint">
          Zum Bearbeiten legst du dir ein kostenloses Profil an oder meldest dich an. Danach gehört
          das Event dir.
        </p>
      )}

      {panel === 'publish' && canPublish && (
        <section className="pre-entry-box" data-testid="pre-entry-publish-panel">
          <h2>Profil anlegen</h2>
          <p>
            Leg dir jetzt ein kostenloses Profil an. So erscheint das Event in deinem Profil und du
            kannst es jederzeit selbst bearbeiten.
          </p>
          <label className="pre-entry-check">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(e) => setRightsConfirmed(e.target.checked)}
              data-testid="pre-entry-rights"
            />
            <span>Ich bin berechtigt, dieses Event zu veröffentlichen.</span>
          </label>
          {signedIn ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !rightsConfirmed}
              onClick={() => claim(true)}
              data-testid="pre-entry-claim-publish"
            >
              Übernehmen und veröffentlichen
            </button>
          ) : (
            <AuthButtons onAuth={goToLogin} />
          )}
          <button
            type="button"
            className="pre-entry-link-button"
            disabled={busy || !rightsConfirmed}
            onClick={publishWithoutProfile}
            data-testid="pre-entry-publish-without-profile"
          >
            Ohne Profil veröffentlichen
          </button>
          {!rightsConfirmed && (
            <p className="pre-entry-hint">Bitte bestätige zuerst das Kästchen oben.</p>
          )}
        </section>
      )}

      {panel === 'reject' && preview.canReject && (
        <section className="pre-entry-box" data-testid="pre-entry-reject-panel">
          <h2>Nicht veröffentlichen</h2>
          <p>Schade! Magst du uns kurz sagen, warum? (freiwillig)</p>
          <textarea
            value={comment}
            maxLength={COMMENT_MAX}
            rows={3}
            onChange={(e) => setComment(e.target.value)}
            placeholder="z. B. Bitte nicht veröffentlichen"
            aria-label="Kommentar"
            data-testid="pre-entry-reject-comment"
          />
          <div className="pre-entry-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setPanel(null)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-subtle-danger"
              disabled={busy}
              onClick={reject}
              data-testid="pre-entry-reject"
            >
              Ablehnen
            </button>
          </div>
        </section>
      )}

      <p className="pre-entry-privacy">
        Wie wir mit deinen Daten umgehen, steht in unserer{' '}
        <Link to={PRE_ENTRY_PRIVACY_PATH}>Datenschutzerklärung</Link>.
      </p>
    </div>
  );
}

function AuthButtons({ onAuth }) {
  return (
    <div className="pre-entry-actions">
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => onAuth('register')}
        data-testid="pre-entry-register"
      >
        Kostenloses Profil anlegen
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => onAuth('login')}
        data-testid="pre-entry-login"
      >
        Ich habe schon ein Konto
      </button>
    </div>
  );
}

function EventPreview({ event }) {
  if (!event) return null;
  const date = event.date ? formatEventDateLabel(event.date) : '';
  const time = [event.time, event.endTime].filter(Boolean).join(' – ');
  const place = getEventLocationLabel(event);
  return (
    <article className="pre-entry-event" data-testid="pre-entry-event">
      {event.imageUrl && (
        <img
          className="pre-entry-event-image"
          src={event.imageUrl}
          alt=""
          style={
            event.imageFocalPoint
              ? {
                  objectPosition: `${event.imageFocalPoint.x * 100}% ${event.imageFocalPoint.y * 100}%`,
                }
              : undefined
          }
        />
      )}
      <ul className="pre-entry-facts">
        {(date || time) && (
          <li>
            <Calendar size={16} aria-hidden="true" />
            <span>{[date, time && `${time} Uhr`].filter(Boolean).join(', ')}</span>
          </li>
        )}
        {place && (
          <li>
            <MapPin size={16} aria-hidden="true" />
            <span>{[event.place, place].filter(Boolean).join(', ')}</span>
          </li>
        )}
        {event.organizerName && (
          <li>
            <User size={16} aria-hidden="true" />
            <span>{event.organizerName}</span>
          </li>
        )}
      </ul>
      {event.description && <RichTextView html={event.description} />}
    </article>
  );
}

function ClosedMessage({ state }) {
  const contact = (
    <a href={`mailto:${CONTACT_EMAIL}`} className="detail-link">
      {CONTACT_EMAIL}
    </a>
  );
  const texts = {
    expired: (
      <>
        <h1>Dieser Link ist abgelaufen</h1>
        <p>Bitte melde dich bei uns: {contact}. Wir schicken dir gern einen neuen Link.</p>
      </>
    ),
    revoked: (
      <>
        <h1>Dieser Link gilt nicht mehr</h1>
        <p>Bitte melde dich bei uns: {contact}.</p>
      </>
    ),
    rejected: (
      <>
        <h1>Danke für deine Rückmeldung</h1>
        <p>Du hast dieses Event abgelehnt. Es wird nicht veröffentlicht.</p>
      </>
    ),
    claimed: (
      <>
        <h1>Dieses Event wurde bereits übernommen</h1>
        <p>
          Es gehört jetzt zu einem Profil. Du findest es in der <Link to="/admin">Verwaltung</Link>.
        </p>
      </>
    ),
    used: (
      <>
        <h1>Dieser Link wurde schon benutzt</h1>
        <p>Bei Fragen melde dich bei uns: {contact}.</p>
      </>
    ),
  };
  return (
    texts[state] ?? (
      <>
        <h1>Diesen Link gibt es nicht</h1>
        <p>Bitte prüfe, ob du ihn vollständig kopiert hast, oder melde dich bei uns: {contact}.</p>
      </>
    )
  );
}

function DoneMessage({ done }) {
  if (done.kind === 'rejected') {
    return (
      <>
        <h1>Danke für deine Rückmeldung</h1>
        <p>Wir veröffentlichen das Event nicht. Deine Daten löschen wir bald.</p>
      </>
    );
  }
  if (done.kind === 'claimed') {
    return (
      <>
        <h1>Geschafft!</h1>
        <p>Das Event gehört jetzt zu deinem Profil.</p>
        {done.publicUrl && (
          <p>
            <Link to={done.publicUrl} className="btn btn-primary">
              Zum Event
            </Link>
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <h1>Dein Event ist online!</h1>
      {done.publicUrl && (
        <p>
          Hier findest du es: <a href={done.publicUrl}>{done.publicUrl}</a>
        </p>
      )}
      <div className="pre-entry-box">
        <h2>Später übernehmen</h2>
        <p>
          Dein Event steht jetzt unter „Dein Tribe“. Mit diesem Link kannst du jederzeit ein
          kostenloses Profil anlegen und das Event übernehmen. Bitte heb ihn gut auf, er
          funktioniert einmal:
        </p>
        <p className="pre-entry-takeover-link" data-testid="pre-entry-takeover-link">
          <a href={done.takeoverUrl}>{done.takeoverUrl}</a>
        </p>
      </div>
    </>
  );
}
