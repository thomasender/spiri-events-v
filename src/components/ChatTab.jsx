import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Flame } from 'lucide-react';
import { db } from '../lib/firebase';
import { useChatAdmin } from '../hooks/useChatAdmin';
import ConfirmDialog from './ConfirmDialog';
import {
  CHAT_BAN_DURATIONS,
  CHAT_PERMANENT_UNTIL_MS,
  CHAT_RETENTION_DAYS,
  formatChatTime,
} from '../utils/chat';
import { DM_RETENTION_DAYS } from '../utils/messenger';
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

// Where a report came from: the Lagerfeuer, or an event's Kerzenraum with a
// link to the event (title looked up once; the report itself only keeps the id).
function ReportRoom({ eventId, messageId }) {
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (!eventId) return undefined;
    let active = true;
    getDoc(doc(db, 'events', eventId))
      .then((snap) => {
        if (active && snap.exists()) setTitle(String(snap.get('title') ?? ''));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [eventId]);
  if (!eventId) {
    return (
      <span className="chat-tab-room" data-testid="chat-report-room">
        Lagerfeuer
      </span>
    );
  }
  return (
    <span className="chat-tab-room" data-testid="chat-report-room">
      Event Chat: <Link to={`/event/${eventId}#msg-${messageId}`}>{title || 'Zum Event'}</Link>
    </span>
  );
}

export default function ChatTab() {
  const {
    mode,
    messengerMode,
    onlineStatusMode,
    setOnlineStatusMode,
    onboardingMode,
    setOnboardingMode,
    dmReports,
    loading,
    error,
    reports,
    bans,
    setMode,
    setMessengerMode,
    resolveReport,
    resolveDmReport,
    deleteMessage,
    ban,
    unban,
  } = useChatAdmin(true);
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

      <section className="chat-tab-section" aria-labelledby="chat-tab-messenger">
        <h3 id="chat-tab-messenger">Privatnachrichten (Postfach)</h3>
        <div className="chat-tab-modes" role="radiogroup" aria-label="Sichtbarkeit des Postfachs">
          {MODES.map((m) => (
            <label
              key={m.id}
              className={`chat-tab-mode${messengerMode === m.id ? ' chat-tab-mode--on' : ''}`}
            >
              <input
                type="radio"
                name="messenger-mode"
                value={m.id}
                checked={messengerMode === m.id}
                disabled={busy || loading}
                onChange={() => run(() => setMessengerMode(m.id), 'Gespeichert.')}
              />
              <span className="chat-tab-mode-label">{m.label}</span>
              <span className="chat-tab-mode-help">
                {m.id === 'off'
                  ? 'Das Postfach ist für niemanden sichtbar.'
                  : m.id === 'admins'
                    ? 'Nur Admins sehen das Postfach (zum Testen).'
                    : 'Alle angemeldeten Mitglieder mit bestätigter E-Mail.'}
              </span>
            </label>
          ))}
        </div>
        <p className="chat-tab-hint">
          Privatnachrichten bleiben {DM_RETENTION_DAYS} Tage. Admins können sie nicht lesen, nur was
          Mitglieder melden. Stumm Geschaltete können auch keine Privatnachrichten schreiben.
        </p>
      </section>

      <section className="chat-tab-section" aria-labelledby="chat-tab-online">
        <h3 id="chat-tab-online">Online-Status (grüner / roter Punkt)</h3>
        <div
          className="chat-tab-modes"
          role="radiogroup"
          aria-label="Sichtbarkeit des Online-Status"
        >
          {MODES.map((m) => (
            <label
              key={m.id}
              className={`chat-tab-mode${onlineStatusMode === m.id ? ' chat-tab-mode--on' : ''}`}
            >
              <input
                type="radio"
                name="online-status-mode"
                value={m.id}
                checked={onlineStatusMode === m.id}
                disabled={busy || loading}
                onChange={() => run(() => setOnlineStatusMode(m.id), 'Gespeichert.')}
              />
              <span className="chat-tab-mode-label">{m.label}</span>
              <span className="chat-tab-mode-help">
                {m.id === 'off'
                  ? 'Die Option und die Punkte sind für niemanden da.'
                  : m.id === 'admins'
                    ? 'Nur Admins sehen die Option im Profil und die Punkte (zum Testen).'
                    : 'Alle angemeldeten Mitglieder mit bestätigter E-Mail können die Option nutzen.'}
              </span>
            </label>
          ))}
        </div>
        <p className="chat-tab-hint">
          Auch wenn der Schalter offen ist, zeigt nur einen Punkt, wer die Option in seinem Profil
          eingeschaltet hat (standardmäßig aus).
        </p>
      </section>

      <section className="chat-tab-section" aria-labelledby="chat-tab-onboarding">
        <h3 id="chat-tab-onboarding">Profil-Onboarding (Einstiegs-Assistent)</h3>
        <div
          className="chat-tab-modes"
          role="radiogroup"
          aria-label="Sichtbarkeit des Profil-Onboardings"
        >
          {MODES.map((m) => (
            <label
              key={m.id}
              className={`chat-tab-mode${onboardingMode === m.id ? ' chat-tab-mode--on' : ''}`}
            >
              <input
                type="radio"
                name="onboarding-mode"
                value={m.id}
                checked={onboardingMode === m.id}
                disabled={busy || loading}
                onChange={() => run(() => setOnboardingMode(m.id), 'Gespeichert.')}
              />
              <span className="chat-tab-mode-label">{m.label}</span>
              <span className="chat-tab-mode-help">
                {m.id === 'off'
                  ? 'Der Assistent und der Hinweis sind für niemanden da.'
                  : m.id === 'admins'
                    ? 'Nur Admins sehen den Assistenten (zum Testen).'
                    : 'Alle angemeldeten Mitglieder mit bestätigter E-Mail, denen Foto oder Beschreibung fehlt.'}
              </span>
            </label>
          ))}
        </div>
        <p className="chat-tab-hint">
          Der Assistent führt in drei Schritten zu Foto, Beschreibung und Verzeichnis-Eintrag. Jeder
          Schritt lässt sich überspringen.
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
                <ReportRoom eventId={r.eventId} messageId={r.messageId} />
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

      <section className="chat-tab-section" aria-labelledby="chat-tab-dm-reports">
        <h3 id="chat-tab-dm-reports">Gemeldete Privatnachrichten ({dmReports.length})</h3>
        {dmReports.length === 0 ? (
          <p className="chat-tab-empty" data-testid="chat-tab-no-dm-reports">
            Keine offenen Meldungen.
          </p>
        ) : (
          <ul className="chat-tab-list">
            {dmReports.map((r) => (
              <li key={r.id} className="chat-tab-item" data-testid="dm-report">
                <div className="chat-tab-item-head">
                  <strong>Gemeldet: {r.reportedName}</strong>
                  <span>{formatChatTime(r.createdAtMs)}</span>
                </div>
                <blockquote className="chat-tab-quote">{r.excerpt}</blockquote>
                <div className="chat-tab-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => run(() => resolveDmReport(r.id), 'Meldung erledigt.')}
                  >
                    Erledigt, nichts tun
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => setPending({ type: 'dm-ban', report: r })}
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
            await deleteMessage(report.messageId, report.eventId);
            await resolveReport(report.id);
          }, 'Nachricht gelöscht.');
          setPending(null);
        }}
      />

      <ConfirmDialog
        isOpen={pending?.type === 'ban' || pending?.type === 'dm-ban'}
        title={`${pending?.report?.messageAuthorName ?? pending?.report?.reportedName ?? ''} stumm schalten`}
        confirmLabel="Stumm schalten"
        danger
        loading={busy}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          const report = pending.report;
          const isDm = pending.type === 'dm-ban';
          const duration =
            CHAT_BAN_DURATIONS.find((d) => d.id === pending.durationId) ?? CHAT_BAN_DURATIONS[0];
          await run(
            async () => {
              await ban({
                uid: isDm ? report.reportedUid : report.messageAuthorUid,
                userName: isDm ? report.reportedName : report.messageAuthorName,
                durationMs: duration.ms,
                reason: `Meldung ${report.id}`,
              });
              if (isDm) {
                await resolveDmReport(report.id);
              } else {
                await deleteMessage(report.messageId, report.eventId);
                await resolveReport(report.id);
              }
            },
            isDm
              ? 'Mitglied stumm geschaltet (Chat und Privatnachrichten).'
              : 'Mitglied stumm geschaltet, Nachricht gelöscht.'
          );
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
        <p>
          {pending?.type === 'dm-ban'
            ? 'Die Person kann dann auch keine Privatnachrichten mehr schreiben.'
            : 'Die gemeldete Nachricht wird dabei gelöscht.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}
