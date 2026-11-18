import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ImageOff } from 'lucide-react';
import { callable } from '../lib/firebase';
import {
  CONSENT_TEXTS,
  CONSENT_WORDING_VERSION,
  DECLINE_PARAM,
  claimPathFor,
  DECLINE_VALUE,
  IMPORT_PRIVACY_PATH,
  PREVIEW_TOKEN_PATTERN,
  applyPrivatePageMeta,
  formatPreviewPlace,
  formatPreviewPrice,
  formatPreviewWhen,
  previewErrorMessage,
} from '../utils/importConsent';
import './ImportPreviewPage.css';

const DESCRIPTION_PREVIEW_CHARS = 320;

// The organizer's own picture, loaded by their browser straight from their
// site (no copy, no proxy), without a referrer; a placeholder if it fails.
function PreviewImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className="import-preview-image import-preview-image--placeholder"
        data-testid="preview-image-placeholder"
      >
        <ImageOff size={28} aria-hidden="true" />
        <span>Kein Bild</span>
      </div>
    );
  }
  return (
    <img
      className="import-preview-image"
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function PreviewEventCard({ event }) {
  const [open, setOpen] = useState(false);
  const long = event.description.length > DESCRIPTION_PREVIEW_CHARS;
  const text =
    long && !open ? `${event.description.slice(0, DESCRIPTION_PREVIEW_CHARS)}…` : event.description;
  const place = formatPreviewPlace(event);
  return (
    <article className="import-preview-event" data-testid="preview-event">
      <PreviewImage src={event.imageUrl} alt={event.title} />
      <div className="import-preview-event-body">
        {event.category && <p className="import-preview-category">{event.category}</p>}
        <h3 className="import-preview-event-title">{event.title}</h3>
        <p className="import-preview-meta">{formatPreviewWhen(event)}</p>
        {place && <p className="import-preview-meta">{place}</p>}
        <p className="import-preview-meta">{formatPreviewPrice(event)}</p>
        {text && <p className="import-preview-description">{text}</p>}
        {long && (
          <button type="button" className="import-preview-more" onClick={() => setOpen(!open)}>
            {open ? 'Weniger anzeigen' : 'Mehr anzeigen'}
          </button>
        )}
        {event.link && (
          <a
            className="import-preview-link"
            href={event.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Zur Veranstaltung auf deiner Website
          </a>
        )}
        {event.published && <p className="import-preview-published">Auf tribe sichtbar</p>}
      </div>
    </article>
  );
}

function StatusNotice({ consent }) {
  if (consent === 'manual_ok' || consent === 'sync_ok') {
    return (
      <div className="import-preview-notice import-preview-notice--ok" role="status">
        <strong>Danke, du hast zugestimmt.</strong> Deine Veranstaltungen sind auf tribe sichtbar.{' '}
        {CONSENT_TEXTS.revoke} Schreib uns dafür an admin@thetribe.at.
      </div>
    );
  }
  if (consent === 'claimed') {
    return (
      <div className="import-preview-notice" role="status">
        <strong>Du hast deine Veranstaltungen in dein Konto übernommen.</strong> Damit wir sie
        zeigen dürfen, stimme bitte unten zu.
      </div>
    );
  }
  if (consent === 'declined') {
    return (
      <div className="import-preview-notice" role="status">
        <strong>Du hast abgelehnt.</strong> Wir haben deine Angaben gelöscht und schreiben dir nicht
        noch einmal.
      </div>
    );
  }
  return (
    <div className="import-preview-notice" data-testid="preview-notice">
      <strong>Das ist eine Vorschau. Nichts davon ist öffentlich.</strong> So würden deine
      Veranstaltungen auf tribe aussehen. Wir zeigen sie nur, wenn du unten zustimmst.
    </div>
  );
}

function Decision({ preview, declinePreselected, onSubmit, busy, error }) {
  const [scopes, setScopes] = useState({
    event: preview.scopes?.event ?? false,
    images: preview.scopes?.images ?? false,
    persons: preview.scopes?.persons ?? false,
  });
  const toggle = (key) => setScopes((s) => ({ ...s, [key]: !s[key] }));
  const submit = (action) => onSubmit(action, scopes);
  const approved = preview.consent === 'manual_ok' || preview.consent === 'sync_ok';
  const claimed = preview.consent === 'claimed';

  return (
    <section className="import-preview-decision" aria-labelledby="import-decision-title">
      {declinePreselected && !approved && !claimed && (
        <div className="import-preview-decline-box" data-testid="decline-preselected">
          <p>Du möchtest nicht, dass wir deine Veranstaltungen zeigen?</p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => submit('decline')}
          >
            Ja, ablehnen und Angaben löschen
          </button>
        </div>
      )}
      <h2 id="import-decision-title" className="import-preview-heading">
        Deine Entscheidung
      </h2>
      <label className="import-preview-check">
        <input
          type="checkbox"
          checked={scopes.event}
          onChange={() => toggle('event')}
          data-testid="scope-event"
        />
        <span>
          <strong>Veranstaltung und Texte (erforderlich für eine Zustimmung).</strong>{' '}
          {CONSENT_TEXTS.event}
        </span>
      </label>
      <label className="import-preview-check">
        <input
          type="checkbox"
          checked={scopes.images}
          onChange={() => toggle('images')}
          data-testid="scope-images"
        />
        <span>
          <strong>Bilder (freiwillig).</strong> {CONSENT_TEXTS.images}
        </span>
      </label>
      <label className="import-preview-check">
        <input
          type="checkbox"
          checked={scopes.persons}
          onChange={() => toggle('persons')}
          data-testid="scope-persons"
        />
        <span>
          <strong>Abgebildete Personen (freiwillig).</strong> {CONSENT_TEXTS.persons}
        </span>
      </label>
      <p className="import-preview-small">{CONSENT_TEXTS.revoke}</p>

      {error && (
        <p className="import-preview-error" role="alert">
          {error}
        </p>
      )}

      <div className="import-preview-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !scopes.event}
          onClick={() => submit('approve_once')}
          data-testid="action-approve-once"
        >
          Zustimmen: diese Veranstaltungen zeigen
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !scopes.event}
          onClick={() => submit('approve_sync')}
          data-testid="action-approve-sync"
        >
          Zustimmen und neue Veranstaltungen von meiner Website regelmäßig übernehmen
        </button>
        {!claimed && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => submit('self_manage')}
            data-testid="action-self-manage"
          >
            Ich verwalte meine Veranstaltungen selbst (Konto anlegen und übernehmen)
          </button>
        )}
        {!claimed && (
          <button
            type="button"
            className="btn btn-secondary import-preview-decline"
            disabled={busy}
            onClick={() => submit('decline')}
            data-testid="action-decline"
          >
            Ablehnen und Angaben löschen
          </button>
        )}
      </div>
    </section>
  );
}

// /vorschau/import/:token: the private preview of the event import
// (functions/src/importConsent.ts). Not public: noindex, no referrer, no social
// image, not in the sitemap; the token never reaches analytics.
export default function ImportPreviewPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const validToken = PREVIEW_TOKEN_PATTERN.test(token);
  const declinePreselected = params.get(DECLINE_PARAM) === DECLINE_VALUE;
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => applyPrivatePageMeta(document), []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await callable('getImportPreview')({ token });
      setPreview(result.data);
    } catch (err) {
      setLoadError(previewErrorMessage(err));
    }
  }, [token]);

  useEffect(() => {
    if (validToken) load();
  }, [validToken, load]);

  const submit = async (action, scopes) => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await callable('submitImportConsent')({
        token,
        action,
        scopes,
        wordingVersion: CONSENT_WORDING_VERSION,
      });
      // "Selbst verwalten" is no consent: it continues in the claim flow (ticket 7).
      if (action === 'self_manage') {
        navigate(claimPathFor(token));
        return;
      }
      setPreview((p) => ({
        ...p,
        consent: result.data.consent,
        syncMode: result.data.syncMode,
        scopes: action === 'decline' ? p.scopes : scopes,
        events: action === 'decline' ? [] : p.events,
      }));
    } catch (err) {
      setActionError(previewErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (!validToken || loadError) {
    body = (
      <>
        <h1 className="import-preview-title">Vorschau nicht gefunden</h1>
        <p role="alert">{loadError || previewErrorMessage({ code: 'not-found' })}</p>
      </>
    );
  } else if (!preview) {
    body = <div className="loading-spinner" />;
  } else {
    const final = preview.consent === 'declined';
    body = (
      <>
        <h1 className="import-preview-title">Vorschau für {preview.organizer.name}</h1>
        <StatusNotice consent={preview.consent} />
        {preview.events.length > 0 && (
          <section aria-labelledby="import-events-title">
            <h2 id="import-events-title" className="import-preview-heading">
              Deine Veranstaltungen ({preview.events.length})
            </h2>
            <div className="import-preview-events">
              {preview.events.map((event) => (
                <PreviewEventCard key={event.key} event={event} />
              ))}
            </div>
          </section>
        )}
        {!final && (
          <Decision
            preview={preview}
            declinePreselected={declinePreselected}
            onSubmit={submit}
            busy={busy}
            error={actionError}
          />
        )}
        <section className="import-preview-privacy" aria-labelledby="import-privacy-title">
          <h2 id="import-privacy-title" className="import-preview-heading">
            Datenschutz
          </h2>
          <p>
            Wir haben die Angaben auf deiner Website {preview.organizer.website} gefunden und
            speichern nur, was wir für diese Anfrage brauchen. Bilder laden wir nicht herunter: dein
            Browser holt sie direkt von deiner Website. Antwortest du nicht, löschen wir alles nach{' '}
            {preview.retentionDays} Tagen.{' '}
            <Link to={IMPORT_PRIVACY_PATH} className="legal-link">
              Alle Informationen nach Art. 14 DSGVO
            </Link>
          </p>
        </section>
      </>
    );
  }

  return (
    <div className="page-container import-preview-page fade-enter">
      <Helmet>
        <title>Vorschau | tribe</title>
      </Helmet>
      {body}
    </div>
  );
}
