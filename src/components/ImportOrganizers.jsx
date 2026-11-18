import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLastOutreach, useRegionCandidates } from '../hooks/useImportData';
import {
  addToBlocklist,
  createPreviewLink,
  isOnBlocklist,
  removeFromBlocklist,
  sendOutreachMail,
} from '../utils/importAdminApi';
import { CONSENT_LABELS, LEGAL_FORM_LABELS, normalizeBlocklistValue } from '../utils/eventImport';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatTime(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('de-AT') : '–';
}

function errorText(err) {
  return err?.message ? `Das hat nicht geklappt: ${err.message}` : 'Das hat nicht geklappt.';
}

// One blocklist entry (e-mail address or domain): only the hash is stored.
function BlockRow({ label, value, uid }) {
  const [blocked, setBlocked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const normalized = normalizeBlocklistValue(value);

  useEffect(() => {
    let cancelled = false;
    if (!normalized) return undefined;
    isOnBlocklist(normalized)
      .then((v) => !cancelled && setBlocked(v))
      .catch(() => !cancelled && setError('Sperrliste nicht lesbar.'));
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  if (!normalized) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (blocked) await removeFromBlocklist(normalized);
      else await addToBlocklist(normalized, uid);
      setBlocked(!blocked);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="import-block-row" data-testid={`block-row-${label}`}>
      <span className="import-block-value">
        {label === 'email' ? 'E-Mail' : 'Domain'}: {normalized}
        {blocked && <span className="import-badge import-badge--bad"> gesperrt</span>}
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy || blocked === null}
        onClick={toggle}
        data-testid={`block-toggle-${label}`}
      >
        {blocked ? 'Sperre aufheben' : 'Sperren'}
      </button>
      {error && (
        <span className="moderation-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function OrganizerCard({ organizer, candidateCount, eventCount, uid }) {
  const lastOutreach = useLastOutreach(organizer.id);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [preview, setPreview] = useState(null);
  const validRecipient = EMAIL_RE.test(recipient.trim());
  const hasLink = Boolean(organizer.previewTokenHash);

  const makeLink = async (regenerate) => {
    setBusy(true);
    setNotice(null);
    try {
      const { url, expiresAt } = await createPreviewLink({ organizerId: organizer.id, regenerate });
      setPreview({ url, expiresAt });
      try {
        await navigator.clipboard.writeText(url);
        setNotice({ kind: 'success', text: 'Link kopiert.' });
      } catch {
        setNotice({ kind: 'success', text: 'Link erstellt (Kopieren nicht möglich).' });
      }
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await sendOutreachMail({
        organizerId: organizer.id,
        testRecipient: recipient.trim(),
      });
      setNotice({
        kind: 'success',
        text: `Testmail an ${recipient.trim()}: ${result?.status ?? 'gesendet'}.`,
      });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className="moderation-card import-card import-card--organizer"
      data-testid={`import-organizer-${organizer.id}`}
    >
      <div className="import-card-main">
        <div className="import-card-title">
          <span className="moderation-card-name">{organizer.name}</span>
          <span className="import-badge" data-testid="badge-legal-form">
            {LEGAL_FORM_LABELS[organizer.legalForm] ?? organizer.legalForm}
          </span>
          <span
            className={`import-badge import-consent import-consent--${organizer.consent}`}
            data-testid="badge-consent"
          >
            {CONSENT_LABELS[organizer.consent] ?? organizer.consent}
          </span>
        </div>
        <dl className="import-facts">
          <div>
            <dt>Website</dt>
            <dd>
              {organizer.website ? (
                <a href={organizer.website} target="_blank" rel="noopener noreferrer">
                  {normalizeBlocklistValue(organizer.website)}
                </a>
              ) : (
                '–'
              )}
            </dd>
          </div>
          <div>
            <dt>Kontakt</dt>
            <dd>{organizer.contactEmail || '–'}</dd>
          </div>
          <div>
            <dt>Kandidaten / Events</dt>
            <dd data-testid="organizer-counts">
              {candidateCount} / {eventCount}
            </dd>
          </div>
          <div>
            <dt>Letzte Mail</dt>
            <dd data-testid="organizer-outreach">
              {lastOutreach
                ? `${formatTime(lastOutreach.sentAt)} (${lastOutreach.status})`
                : 'noch keine'}
            </dd>
          </div>
        </dl>

        {preview && (
          <p className="import-preview" data-testid="preview-result">
            <a href={preview.url} target="_blank" rel="noopener noreferrer">
              {preview.url}
            </a>{' '}
            (gültig bis {formatTime(preview.expiresAt)})
          </p>
        )}

        <div className="import-mail">
          <label className="import-mail-label">
            Testmail an:
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="adresse@beispiel.at"
              data-testid="testmail-input"
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || !validRecipient}
            onClick={sendTest}
            data-testid="testmail-send"
          >
            Testmail senden
          </button>
        </div>

        <div className="import-block">
          <BlockRow label="email" value={organizer.contactEmail} uid={uid} />
          <BlockRow label="domain" value={organizer.website} uid={uid} />
        </div>

        {notice && (
          <p
            className={notice.kind === 'error' ? 'moderation-error' : 'moderation-notice'}
            role={notice.kind === 'error' ? 'alert' : 'status'}
          >
            {notice.text}
          </p>
        )}
      </div>
      <div className="moderation-card-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => makeLink(false)}
          data-testid="preview-link"
        >
          Vorschau-Link kopieren
        </button>
        {hasLink && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => makeLink(true)}
          >
            Link neu erzeugen
          </button>
        )}
      </div>
    </li>
  );
}

/** CRM view: organizers of one region with consent, outreach and blocklist. */
export default function ImportOrganizers({ organizers, loading, error, regionId }) {
  const { user } = useAuth();
  const { items: candidates } = useRegionCandidates(regionId);
  const stats = useMemo(() => {
    const byOrganizer = {};
    for (const c of candidates) {
      const s = (byOrganizer[c.organizerRef] ??= { candidates: 0, events: 0 });
      s.candidates += 1;
      if (c.eventId) s.events += 1;
    }
    return byOrganizer;
  }, [candidates]);

  return (
    <div data-testid="import-organizers">
      <p className="import-staging-banner" data-testid="staging-banner" role="note">
        Staging: echte Veranstalter-Adressen werden nie angeschrieben. Mails gehen nur als Testmail
        an eine Adresse, die du selbst einträgst.
      </p>
      {error && (
        <p className="moderation-error" role="alert">
          Veranstalter konnten nicht geladen werden.
        </p>
      )}
      {!loading && !error && organizers.length === 0 && (
        <p className="moderation-empty">Noch keine Veranstalter in dieser Region.</p>
      )}
      <ul className="moderation-list">
        {organizers.map((o) => (
          <OrganizerCard
            key={o.id}
            organizer={o}
            candidateCount={stats[o.id]?.candidates ?? 0}
            eventCount={stats[o.id]?.events ?? 0}
            uid={user?.uid}
          />
        ))}
      </ul>
    </div>
  );
}
