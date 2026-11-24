import { useState } from 'react';
import { useImportCandidates, useCandidateCounts } from '../hooks/useImportData';
import {
  importAcceptCandidate,
  importRejectCandidate,
  setCandidateStatus,
} from '../utils/importAdminApi';
import {
  CANDIDATE_STATUSES,
  CANDIDATE_STATUS_LABELS,
  LEGAL_FORM_LABELS,
  REJECT_REASONS,
} from '../utils/eventImport';
import ConfirmDialog from './ConfirmDialog';

function priceText(extract) {
  if (extract.contribution) return String(extract.contribution);
  if (extract.fee != null) {
    const cur = extract.priceCurrency || '';
    const range =
      extract.feeMax != null && extract.feeMax !== extract.fee
        ? `${extract.fee}–${extract.feeMax}`
        : `${extract.fee}`;
    return `${range} ${cur}`.trim();
  }
  return '–';
}

function errorText(err) {
  return err?.message ? `Das hat nicht geklappt: ${err.message}` : 'Das hat nicht geklappt.';
}

/** Review queue: candidates of one region by status (Annehmen / Ablehnen). */
export default function ImportCandidates({ regionId, organizersById }) {
  const [status, setStatus] = useState('found');
  const [refreshKey, setRefreshKey] = useState(0);
  const { items, loading, error } = useImportCandidates(regionId, status);
  const counts = useCandidateCounts(regionId, refreshKey);
  const [confirm, setConfirm] = useState(null);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const done = (text) => {
    setConfirm(null);
    setNotice({ kind: 'success', text });
    setRefreshKey((k) => k + 1);
  };

  const accept = async (candidate) => {
    setBusy(true);
    setNotice(null);
    try {
      await importAcceptCandidate({ candidateId: candidate.id });
      done(
        `„${candidate.rawExtract?.title ?? 'Event'}“ wurde als Event angelegt (wartet auf Consent).`
      );
    } catch (err) {
      setConfirm(null);
      setNotice({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const reject = async (candidate) => {
    setBusy(true);
    setNotice(null);
    try {
      await importRejectCandidate({ candidateId: candidate.id, reason: rejectReason });
      done('Kandidat abgelehnt.');
    } catch (err) {
      setConfirm(null);
      setNotice({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const moveTo = async (candidate, nextStatus) => {
    setBusy(true);
    setNotice(null);
    try {
      await setCandidateStatus(candidate.id, nextStatus);
      done(nextStatus === 'reviewed' ? 'Kandidat zurückgestellt.' : 'Kandidat wieder geöffnet.');
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="import-candidates">
      <div className="import-filter" role="group" aria-label="Status">
        {CANDIDATE_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`import-filter-btn${s === status ? ' import-filter-btn--active' : ''}`}
            aria-pressed={s === status}
            data-testid={`import-status-${s}`}
            onClick={() => setStatus(s)}
          >
            {CANDIDATE_STATUS_LABELS[s]}
            <span className="import-count" data-testid={`import-count-${s}`}>
              {counts[s] ?? '–'}
            </span>
          </button>
        ))}
      </div>

      {notice && (
        <p
          className={notice.kind === 'error' ? 'moderation-error' : 'moderation-notice'}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}
      {error && (
        <p className="moderation-error" role="alert">
          Kandidaten konnten nicht geladen werden.
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="moderation-empty" data-testid="import-candidates-empty">
          Keine Kandidaten mit diesem Status.
        </p>
      )}

      <ul className="moderation-list">
        {items.map((c) => {
          const x = c.rawExtract ?? {};
          const organizer = organizersById?.[c.organizerRef];
          return (
            <li
              key={c.id}
              className="moderation-card import-card"
              data-testid={`import-candidate-${c.id}`}
            >
              <div className="import-card-main">
                <div className="import-card-title">
                  <span className="moderation-card-name">{x.title || '(ohne Titel)'}</span>
                  <span className="import-badge" data-testid="badge-confidence">
                    Konfidenz {Math.round((Number(c.confidence) || 0) * 100)} %
                  </span>
                </div>
                <dl className="import-facts">
                  <div>
                    <dt>Datum, Zeit</dt>
                    <dd>{[x.date, x.time].filter(Boolean).join(' ') || '–'}</dd>
                  </div>
                  <div>
                    <dt>Ort</dt>
                    <dd>{[x.place, x.city].filter(Boolean).join(', ') || '–'}</dd>
                  </div>
                  <div>
                    <dt>Preis</dt>
                    <dd>{priceText(x)}</dd>
                  </div>
                  <div>
                    <dt>Veranstalter:in</dt>
                    <dd>
                      {organizer?.name ?? c.organizerRef}
                      {organizer?.legalForm && (
                        <span className="import-badge" data-testid="badge-legal-form">
                          {LEGAL_FORM_LABELS[organizer.legalForm] ?? organizer.legalForm}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                {c.dateQuote && (
                  <blockquote className="import-quote" data-testid="import-date-quote">
                    {c.dateQuote}
                  </blockquote>
                )}
                <p className="import-links">
                  <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                    Quelle öffnen
                  </a>
                  {c.imageUrl && (
                    <>
                      {' · '}
                      <a href={c.imageUrl} target="_blank" rel="noopener noreferrer">
                        Bild-Adresse
                      </a>
                    </>
                  )}
                </p>
                {c.imageUrl && (
                  // The picture on the organizer's own page, loaded in the admin's browser only (no copy,
                  // no referrer), so the reviewer sees what the organizer would be asked about.
                  <img
                    className="import-candidate-image"
                    src={c.imageUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    data-testid="candidate-image"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
              {status === 'found' && (
                <div className="moderation-card-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'accept', candidate: c })}
                  >
                    Annehmen
                  </button>
                  <button
                    type="button"
                    className="btn btn-subtle-danger btn-sm"
                    disabled={busy}
                    onClick={() => {
                      setRejectReason(REJECT_REASONS[0]);
                      setConfirm({ kind: 'reject', candidate: c });
                    }}
                  >
                    Ablehnen
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    data-testid={`import-defer-${c.id}`}
                    onClick={() => moveTo(c, 'reviewed')}
                  >
                    Zurückstellen
                  </button>
                </div>
              )}
              {status === 'reviewed' && (
                <div className="moderation-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    data-testid={`import-reopen-${c.id}`}
                    onClick={() => moveTo(c, 'found')}
                  >
                    Wieder öffnen
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        isOpen={confirm?.kind === 'accept'}
        title="Kandidat annehmen?"
        confirmLabel="Annehmen"
        cancelLabel="Abbrechen"
        onConfirm={() => accept(confirm.candidate)}
        onCancel={() => setConfirm(null)}
        loading={busy}
      >
        <p>
          Es wird ein Event „{confirm?.candidate?.rawExtract?.title}“ angelegt. Es bleibt
          unsichtbar, bis der Veranstalter zugestimmt hat.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={confirm?.kind === 'reject'}
        danger
        title="Kandidat ablehnen?"
        confirmLabel="Ablehnen"
        cancelLabel="Abbrechen"
        onConfirm={() => reject(confirm.candidate)}
        onCancel={() => setConfirm(null)}
        loading={busy}
      >
        <label className="import-reason">
          Grund
          <select
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            data-testid="import-reject-reason"
          >
            {REJECT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </ConfirmDialog>
    </div>
  );
}
