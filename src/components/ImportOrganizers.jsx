import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLastOutreach, useOutreachControl, useRegionCandidates } from '../hooks/useImportData';
import {
  addToBlocklist,
  createPreviewLink,
  importDeclineOrganizer,
  importRecordMailConsent,
  isOnBlocklist,
  isProductionProject,
  removeFromBlocklist,
  saveOutreachSettings,
  sendOutreachMail,
} from '../utils/importAdminApi';
import { outreachErrorText } from '../utils/outreachErrors';
import ConfirmDialog from './ConfirmDialog';
import {
  CONSENT_LABELS,
  LEGAL_FORM_LABELS,
  declineNote,
  normalizeBlocklistValue,
} from '../utils/eventImport';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DELIVERY_LABELS = {
  delivered: 'zugestellt',
  bounced: 'nicht zugestellt (Bounce)',
  complained: 'als Spam gemeldet',
};

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

function OrganizerCard({ organizer, candidateCount, eventCount, uid, control }) {
  const lastOutreach = useLastOutreach(organizer.id);
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [confirmMailConsent, setConfirmMailConsent] = useState(false);
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

  const canSendReal =
    isProductionProject() &&
    control.productionEnabled &&
    organizer.consent === 'none' &&
    Boolean(organizer.contactEmail) &&
    eventCount > 0 &&
    control.sentToday < control.dailyLimit;

  const sendReal = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await sendOutreachMail({ organizerId: organizer.id });
      setNotice({ kind: 'success', text: `Mail an ${organizer.contactEmail} gesendet.` });
    } catch (err) {
      setNotice({ kind: 'error', text: outreachErrorText(err) });
    } finally {
      setConfirmSend(false);
      setBusy(false);
    }
  };

  // "Nein" per Mail: the same as the decline link (data deleted, blocklist, no further mail).
  const canMarkDeclined = organizer.consent === 'none' || organizer.consent === 'asked';
  const markDeclined = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await importDeclineOrganizer({ organizerId: organizer.id });
      setNotice({ kind: 'success', text: 'Als abgelehnt markiert. Die Angaben wurden gelöscht.' });
    } catch {
      setNotice({ kind: 'error', text: 'Das hat nicht geklappt. Bitte versuche es noch einmal.' });
    } finally {
      setConfirmDecline(false);
      setBusy(false);
    }
  };

  // "Ja" per Mail: the organizer agreed by e-mail instead of clicking through the preview page.
  const canRecordMailConsent = organizer.consent === 'none' || organizer.consent === 'asked';
  const recordMailConsent = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await importRecordMailConsent({ organizerId: organizer.id });
      setNotice({
        kind: 'success',
        text: 'Einwilligung erfasst. Die Events sind veröffentlicht.',
      });
    } catch {
      setNotice({ kind: 'error', text: 'Das hat nicht geklappt. Bitte versuche es noch einmal.' });
    } finally {
      setConfirmMailConsent(false);
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
      setNotice({ kind: 'error', text: outreachErrorText(err) });
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
          {organizer.consent === 'declined' && (
            <div>
              <dt>Ablehnung</dt>
              <dd data-testid="organizer-declined">{declineNote(organizer)}</dd>
            </div>
          )}
          <div>
            <dt>Letzte Mail</dt>
            <dd data-testid="organizer-outreach">
              {lastOutreach
                ? `${formatTime(lastOutreach.sentAt)} (${lastOutreach.status}${
                    lastOutreach.delivery ? `, ${DELIVERY_LABELS[lastOutreach.delivery]}` : ''
                  })`
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
        {canSendReal && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => setConfirmSend(true)}
            data-testid="real-send"
          >
            Mail an Veranstalter senden
          </button>
        )}
        {canRecordMailConsent && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => setConfirmMailConsent(true)}
            data-testid="record-mail-consent"
          >
            Einwilligung per Mail erfasst
          </button>
        )}
        {canMarkDeclined && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => setConfirmDecline(true)}
            data-testid="mark-declined"
          >
            Als abgelehnt markieren
          </button>
        )}
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
      <ConfirmDialog
        isOpen={confirmMailConsent}
        title="Einwilligung per Mail erfassen?"
        confirmLabel="Einwilligung erfassen"
        cancelLabel="Abbrechen"
        onConfirm={recordMailConsent}
        onCancel={() => setConfirmMailConsent(false)}
        loading={busy}
      >
        <p>
          {organizer.name} hat per Mail zugestimmt. Ab jetzt werden die Events veröffentlicht (mit
          Bildern) und künftige Events von der Webseite übernommen. Bitte nur erfassen, wenn die
          Zustimmung schriftlich vorliegt.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={confirmDecline}
        danger
        title="Als abgelehnt markieren?"
        confirmLabel="Als abgelehnt markieren"
        cancelLabel="Abbrechen"
        onConfirm={markDeclined}
        onCancel={() => setConfirmDecline(false)}
        loading={busy}
      >
        <p>
          {organizer.name} bekommt nichts mehr von uns. Die Events und Angaben werden gelöscht, die
          Adresse und die Domain kommen auf die Sperrliste. Das lässt sich nicht rückgängig machen.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={confirmSend}
        title="Mail an den Veranstalter senden?"
        confirmLabel="Jetzt senden"
        cancelLabel="Abbrechen"
        onConfirm={sendReal}
        onCancel={() => setConfirmSend(false)}
        loading={busy}
      >
        <p>
          Die Mail geht an <strong>{organizer.contactEmail}</strong> ({organizer.name}), mit{' '}
          {eventCount} {eventCount === 1 ? 'Event' : 'Events'} und dem privaten Vorschau-Link. Es
          gibt nur diese eine Mail, sie kann nicht zurückgeholt werden. Heute noch möglich:{' '}
          {Math.max(0, control.dailyLimit - control.sentToday)} von {control.dailyLimit}.
        </p>
      </ConfirmDialog>
    </li>
  );
}

/** Switch and daily limit of the real outreach mail (backend enforces both). */
function OutreachControl({ control }) {
  const [limit, setLimit] = useState(String(control.dailyLimit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setLimit(String(control.dailyLimit)), [control.dailyLimit]);
  const production = isProductionProject();

  const save = async (patch) => {
    setBusy(true);
    setError(null);
    try {
      await saveOutreachSettings({
        productionEnabled: control.productionEnabled,
        dailyLimit: control.dailyLimit,
        ...patch,
      });
    } catch {
      setError('Das hat nicht geklappt. Die Einstellung wurde nicht gespeichert.');
    } finally {
      setBusy(false);
    }
  };
  const limitNumber = Number(limit);
  const limitValid = Number.isInteger(limitNumber) && limitNumber >= 1 && limitNumber <= 50;

  return (
    <fieldset className="import-outreach-control" data-testid="outreach-control">
      <legend>Versand an echte Veranstalter</legend>
      <label>
        <input
          type="checkbox"
          checked={control.productionEnabled}
          disabled={busy || control.loading}
          onChange={(e) => save({ productionEnabled: e.target.checked })}
          data-testid="outreach-switch"
        />{' '}
        eingeschaltet
      </label>
      <label>
        Tageslimit (1 bis 50){' '}
        <input
          type="number"
          min="1"
          max="50"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          data-testid="outreach-limit"
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy || !limitValid || limitNumber === control.dailyLimit}
        onClick={() => save({ dailyLimit: limitNumber })}
        data-testid="outreach-limit-save"
      >
        Limit speichern
      </button>
      {control.pausedReason && (
        <span className="moderation-error" role="alert" data-testid="outreach-paused">
          Versand automatisch pausiert: {control.pausedReason}
        </span>
      )}
      <span data-testid="outreach-stats">
        Gesendet insgesamt: {control.stats.sent}, zugestellt: {control.stats.delivered}, nicht
        zugestellt: {control.stats.bounced}, als Spam gemeldet: {control.stats.complained}
      </span>
      <span data-testid="outreach-today">
        Heute gesendet: {control.sentToday} von {control.dailyLimit}
      </span>
      {!production && (
        <span className="import-hint">
          Auf Staging wirkt das nicht: dort geht nie eine Mail an echte Adressen.
        </span>
      )}
      {error && (
        <span className="moderation-error" role="alert">
          {error}
        </span>
      )}
    </fieldset>
  );
}

/** CRM view: organizers of one region with consent, outreach and blocklist. */
export default function ImportOrganizers({ organizers, loading, error, regionId }) {
  const { user } = useAuth();
  const { items: candidates } = useRegionCandidates(regionId);
  const control = useOutreachControl();
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
      {isProductionProject() ? (
        <p className="import-staging-banner" data-testid="production-banner" role="note">
          Production: Mails an echte Veranstalter gehen nur bei eingeschaltetem Versand, höchstens
          bis zum Tageslimit, und nur eine Mail pro Veranstalter. Testmails gehen an eine Adresse,
          die du selbst einträgst.
        </p>
      ) : (
        <p className="import-staging-banner" data-testid="staging-banner" role="note">
          Staging: echte Veranstalter-Adressen werden nie angeschrieben. Mails gehen nur als
          Testmail an eine Adresse, die du selbst einträgst.
        </p>
      )}
      <OutreachControl control={control} />
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
            control={control}
          />
        ))}
      </ul>
    </div>
  );
}
