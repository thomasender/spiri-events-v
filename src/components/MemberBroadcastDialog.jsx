import { useState } from 'react';
import { callable } from '../lib/firebase';
import { chatTextLength, validateChatText } from '../utils/chat';
import { DM_MAX_LENGTH } from '../utils/messenger';
import { broadcastSkipLines } from '../utils/members';

function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function errorText(err) {
  // The callable's own messages are written for the admin (German, plain).
  const own = [
    'functions/invalid-argument',
    'functions/failed-precondition',
    'functions/resource-exhausted',
  ];
  if (own.includes(err?.code) && typeof err?.message === 'string' && err.message) {
    return err.message;
  }
  return 'Das hat nicht geklappt. Bitte versuche es später noch einmal.';
}

function members(n) {
  return `${n} ${n === 1 ? 'Mitglied' : 'Mitglieder'}`;
}

// Super-Admin only: one text to many members, each as a private message from
// the admin's own account (adminSendBroadcastDm). Steps: write -> check
// (dryRun counts) -> send -> result. One request id per dialog, so a double
// click or a retry never sends twice.
export default function MemberBroadcastDialog({ recipientUids, sourceLabel, onClose }) {
  const [text, setText] = useState('');
  const [step, setStep] = useState('compose');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [requestId] = useState(newRequestId);
  const length = chatTextLength(text);

  const call = (dryRun) =>
    callable('adminSendBroadcastDm')({ recipientUids, text, dryRun, requestId }).then(
      (r) => r.data
    );

  const check = async () => {
    setError(null);
    const checked = validateChatText(text, DM_MAX_LENGTH);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    try {
      setPreview(await call(true));
      setStep('confirm');
    } catch (err) {
      console.error('Broadcast check failed:', err?.code, err);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      setResult(await call(false));
      setStep('done');
    } catch (err) {
      console.error('Broadcast send failed:', err?.code, err);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const skipLines = broadcastSkipLines((step === 'done' ? result : preview)?.skipReasons);
  const waitMinutes = preview?.waitMs > 0 ? Math.ceil(preview.waitMs / 60000) : 0;

  return (
    <div className="members-dialog-backdrop" role="presentation">
      <div
        className="members-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Nachricht an Mitglieder"
        data-testid="member-broadcast-dialog"
      >
        <h2>Nachricht an {members(recipientUids.length)}</h2>
        <p className="members-dialog-hint">
          {sourceLabel} Die Nachricht kommt von deinem Konto ins Postfach der Mitglieder, ohne
          E-Mail. Antworten landen in deinem Postfach.
        </p>

        {step === 'compose' && (
          <>
            <label>
              Nachricht
              <textarea
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                data-testid="member-broadcast-text"
              />
            </label>
            <p
              className={`members-broadcast-counter${length > DM_MAX_LENGTH ? ' is-over' : ''}`}
              data-testid="member-broadcast-counter"
            >
              {length} / {DM_MAX_LENGTH} Zeichen
            </p>
            {text.trim() && (
              <div className="members-broadcast-preview" aria-label="Vorschau">
                <span className="members-broadcast-preview-label">Vorschau</span>
                <p>{text.trim()}</p>
              </div>
            )}
          </>
        )}

        {step === 'confirm' && preview && (
          <>
            <div className="members-broadcast-preview" aria-label="Vorschau">
              <span className="members-broadcast-preview-label">Vorschau</span>
              <p>{text.trim()}</p>
            </div>
            <p data-testid="member-broadcast-summary">
              Wird an <strong>{members(preview.sent)}</strong> gesendet
              {preview.skipped > 0 ? `, ${preview.skipped} übersprungen.` : '.'}
            </p>
            {skipLines.length > 0 && (
              <ul className="members-broadcast-reasons">
                {skipLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {waitMinutes > 0 && (
              <p className="members-error" role="alert">
                Du kannst nur alle 10 Minuten eine Sammelnachricht senden. Bitte warte noch{' '}
                {waitMinutes} {waitMinutes === 1 ? 'Minute' : 'Minuten'}.
              </p>
            )}
          </>
        )}

        {step === 'done' && result && (
          <p data-testid="member-broadcast-result" role="status">
            {result.alreadyProcessed
              ? 'Diese Nachricht wurde bereits gesendet.'
              : `Gesendet an ${members(result.sent)}.`}
            {result.skipped > 0 ? ` ${result.skipped} übersprungen.` : ''}
            {result.failed > 0 ? ` Bei ${members(result.failed)} hat es nicht geklappt.` : ''}
          </p>
        )}

        {error && (
          <p className="members-error" role="alert">
            {error}
          </p>
        )}

        <div className="members-dialog-actions">
          {step === 'compose' && (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={check}
                disabled={busy || !text.trim() || length > DM_MAX_LENGTH}
              >
                Weiter
              </button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep('compose')}
                disabled={busy}
              >
                Text ändern
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={send}
                disabled={busy || !preview || preview.sent === 0 || waitMinutes > 0}
              >
                Jetzt an {members(preview?.sent ?? 0)} senden
              </button>
            </>
          )}
          {step === 'done' && (
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Schließen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
