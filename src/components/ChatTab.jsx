import { useState } from 'react';
import { Flame } from 'lucide-react';
import { useChatAdmin } from '../hooks/useChatAdmin';
import ConfirmDialog from './ConfirmDialog';
import {
  CHAT_BAN_DURATIONS,
  CHAT_PERMANENT_UNTIL_MS,
  CHAT_RETENTION_DAYS,
  formatChatTime,
} from '../utils/chat';
import './ChatTab.css';

const MODES = [
  { id: 'off', label: 'Aus', help: 'Der Chat ist für niemanden sichtbar.' },
  {
    id: 'admins',
    label: 'Nur Admins (Test)',
    help: 'Nur Admins sehen den Chat und können schreiben.',
  },
  { id: 'all', label: 'Für alle', help: 'Alle angemeldeten Mitglieder mit bestätigter E-Mail.' },
];

function describeUntil(untilMs) {
  if (untilMs >= CHAT_PERMANENT_UNTIL_MS - 24 * 60 * 60 * 1000) return 'dauerhaft';
  return `bis ${formatChatTime(untilMs)}`;
}

export default function ChatTab() {
  const { mode, loading, error, reports, bans, setMode, resolveReport, deleteMessage, ban, unban } =
    useChatAdmin(true);
  const [pending, setPending] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn, okText) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      if (okText) setMessage(okText);
    } catch (err) {
      console.error('ChatTab action failed:', err);
      setMessage('Das hat nicht geklappt. Bitte versuche es noch einmal.');
    } finally {
      setBusy(false);
    }
  };

  const activeBans = bans.filter((b) => b.active);

  return (
    <div className="chat-tab" data-testid="chat-tab">
      <h2 className="chat-tab-title">
        <Flame size={22} aria-hidden="true" /> Chat „Lagerfeuer“
      </h2>

      <section className="chat-tab-section" aria-labelledby="chat-tab-flag">
        <h3 id="chat-tab-flag">Sichtbarkeit</h3>
        <div className="chat-tab-modes" role="radiogroup" aria-label="Sichtbarkeit des Chats">
          {MODES.map((m) => (
            <label
              key={m.id}
              className={`chat-tab-mode${mode === m.id ? ' chat-tab-mode--on' : ''}`}
            >
              <input
                type="radio"
                name="chat-mode"
                value={m.id}
                checked={mode === m.id}
                disabled={busy || loading}
                onChange={() => run(() => setMode(m.id), 'Gespeichert.')}
              />
              <span className="chat-tab-mode-label">{m.label}</span>
              <span className="chat-tab-mode-help">{m.help}</span>
            </label>
          ))}
        </div>
        <p className="chat-tab-hint">
          Nachrichten werden nach {CHAT_RETENTION_DAYS} Tagen automatisch gelöscht. Gelöschte
          Nachrichten kannst du im Chat selbst über „Löschen“ entfernen.
        </p>
      </section>

      {message && (
        <p className="chat-tab-message" role="status">
          {message}
        </p>
      )}
      {error && <p className="chat-tab-message">Meldungen konnten nicht geladen werden.</p>}

      <section className="chat-tab-section" aria-labelledby="chat-tab-reports">
        <h3 id="chat-tab-reports">Offene Meldungen ({reports.length})</h3>
        {loading ? (
          <p>Lade…</p>
        ) : reports.length === 0 ? (
          <p className="chat-tab-empty" data-testid="chat-tab-no-reports">
            Keine offenen Meldungen.
          </p>
        ) : (
          <ul className="chat-tab-list">
            {reports.map((r) => (
              <li key={r.id} className="chat-tab-item" data-testid="chat-report">
                <div className="chat-tab-item-head">
                  <strong>{r.messageAuthorName}</strong>
                  <span>{formatChatTime(r.createdAtMs)}</span>
                </div>
                <blockquote className="chat-tab-quote">{r.messageText}</blockquote>
                <div className="chat-tab-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => run(() => resolveReport(r.id), 'Meldung erledigt.')}
                  >
                    Erledigt, nichts tun
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => setPending({ type: 'delete', report: r })}
                  >
                    Nachricht löschen
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => setPending({ type: 'ban', report: r })}
                  >
                    Mitglied stumm schalten…
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="chat-tab-section" aria-labelledby="chat-tab-bans">
        <h3 id="chat-tab-bans">Stumm geschaltet / ausgeschlossen ({activeBans.length})</h3>
        {activeBans.length === 0 ? (
          <p className="chat-tab-empty">Niemand.</p>
        ) : (
          <ul className="chat-tab-list">
            {activeBans.map((b) => (
              <li key={b.uid} className="chat-tab-item chat-tab-item--row">
                <span>
                  <strong>{b.userName || b.uid}</strong> · {describeUntil(b.untilMs)}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => run(() => unban(b.uid), 'Sperre aufgehoben.')}
                >
                  Aufheben
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        isOpen={pending?.type === 'delete'}
        title="Nachricht löschen?"
        message="Die Nachricht wird im Chat entfernt und die Meldung als erledigt markiert."
        confirmLabel="Löschen"
        danger
        loading={busy}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          const report = pending.report;
          await run(async () => {
            await deleteMessage(report.messageId);
            await resolveReport(report.id);
          }, 'Nachricht gelöscht.');
          setPending(null);
        }}
      />

      <ConfirmDialog
        isOpen={pending?.type === 'ban'}
        title={`${pending?.report?.messageAuthorName ?? ''} stumm schalten`}
        confirmLabel="Stumm schalten"
        danger
        loading={busy}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          const report = pending.report;
          const duration =
            CHAT_BAN_DURATIONS.find((d) => d.id === pending.durationId) ?? CHAT_BAN_DURATIONS[0];
          await run(async () => {
            await ban({
              uid: report.messageAuthorUid,
              userName: report.messageAuthorName,
              durationMs: duration.ms,
              reason: `Meldung ${report.id}`,
            });
            await deleteMessage(report.messageId);
            await resolveReport(report.id);
          }, 'Mitglied stumm geschaltet, Nachricht gelöscht.');
          setPending(null);
        }}
      >
        <fieldset className="chat-tab-durations">
          <legend>Dauer</legend>
          {CHAT_BAN_DURATIONS.map((d) => (
            <label key={d.id}>
              <input
                type="radio"
                name="chat-ban-duration"
                checked={(pending?.durationId ?? CHAT_BAN_DURATIONS[0].id) === d.id}
                onChange={() => setPending((p) => ({ ...p, durationId: d.id }))}
              />{' '}
              {d.label}
            </label>
          ))}
        </fieldset>
        <p>Die gemeldete Nachricht wird dabei gelöscht.</p>
      </ConfirmDialog>
    </div>
  );
}
