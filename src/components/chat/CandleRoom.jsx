import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import ChatMessage from './ChatMessage';
import ChatRules from './ChatRules';
import MessageComposer from './MessageComposer';
import ConfirmDialog from '../ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';
import { useChatSettings } from '../../hooks/useChatSettings';
import { useCandleRoom, useCandleRoomActivity } from '../../hooks/useCandleRoom';
import { useMessageJump } from '../../hooks/useMessageJump';
import { CHAT_RETENTION_DAYS, describeChatBan, isChatBanActive } from '../../utils/chat';
import {
  CANDLE_ROOM_NAME,
  canReadCandleRoom,
  hasNewCandleMessages,
  hasNewForeignMessages,
  markCandleRoomSeen,
  readCandleRoomSeen,
} from '../../utils/candleRoom';
import '../../pages/ChatPage.css';
import './CandleRoom.css';

const RULES_KEY = 'candleRoomRulesAccepted';

function readRulesAccepted() {
  try {
    return window.localStorage.getItem(RULES_KEY) === '1';
  } catch {
    return false;
  }
}

function CandleRoomInner({ eventId, mode }) {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
  const location = useLocation();
  const { messages, loading, error, sending, ban, send, remove } = useCandleRoom(eventId, true);
  // What counts as "new" is fixed when the room is opened, so the candle
  // keeps flickering for what arrived since the last visit.
  const [seenAtOpen] = useState(() => readCandleRoomSeen(eventId));
  const [rulesAccepted, setRulesAccepted] = useState(readRulesAccepted);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const jumpTarget = useMessageJump(messages, {
    onJump: () => {
      stickToBottom.current = false;
    },
  });

  const hasNew = hasNewForeignMessages(messages, user?.uid ?? null, seenAtOpen);
  const banned = isChatBanActive(ban);

  // Remember the newest confirmed message as seen (the calendar candle goes out).
  useEffect(() => {
    const newest = [...messages].reverse().find((m) => !m.pending && m.createdAt);
    if (newest) markCandleRoomSeen(eventId, newest.createdAt);
  }, [messages, eventId]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const acceptRules = () => {
    try {
      window.localStorage.setItem(RULES_KEY, '1');
    } catch {
      // Private mode: the rules simply show again next time.
    }
    setRulesAccepted(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await remove(toDelete.id);
    } catch {
      setNotice('Die Nachricht konnte nicht gelöscht werden.');
    } finally {
      setToDelete(null);
      setBusy(false);
    }
  };

  let writeArea;
  if (!user) {
    writeArea = (
      <p className="chat-state candle-room-hint" data-testid="candle-room-login">
        <Link
          to="/login"
          state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        >
          Melde dich an
        </Link>
        , um im {CANDLE_ROOM_NAME} mitzuschreiben.
      </p>
    );
  } else if (!user.emailVerified) {
    writeArea = (
      <p className="chat-state candle-room-hint" data-testid="candle-room-unverified">
        Bitte bestätige zuerst deine E-Mail-Adresse, um im {CANDLE_ROOM_NAME} mitzuschreiben.
      </p>
    );
  } else if (banned) {
    writeArea = (
      <p className="chat-banned" role="status" data-testid="candle-room-banned">
        {describeChatBan(ban)}
      </p>
    );
  } else if (!rulesAccepted) {
    writeArea = (
      <ChatRules
        onAccept={acceptRules}
        audience={
          mode === 'all' ? 'Alle Besucher:innen dieser Event-Seite' : 'Die Administrator:innen'
        }
        testIdPrefix="candle-room"
        canReport={false}
      />
    );
  } else {
    writeArea = (
      <MessageComposer
        onSend={send}
        sending={sending}
        autoFocus={false}
        mentionsEnabled
        selfUid={user.uid}
        placeholder="Frag nach einer Mitfahrgelegenheit oder sag Hallo…"
        testIdPrefix="candle-room"
      />
    );
  }

  return (
    <div
      id="candle-room-panel"
      className="candle-room-panel"
      data-testid="candle-room"
      role="region"
      aria-labelledby="candle-room-title"
    >
      <header className="candle-room-header">
        <span
          className={`candle-flame${hasNew ? ' candle-flame--lit' : ''}`}
          role="img"
          aria-label={hasNew ? 'Neue Nachrichten' : 'Kerze'}
          data-testid={hasNew ? 'candle-room-new' : undefined}
        >
          🕯️
        </span>
        <div>
          <h2 id="candle-room-title">
            {CANDLE_ROOM_NAME}
            {hasNew && <span className="candle-room-new-label">Neue Nachrichten</span>}
          </h2>
          <p>
            Tausch dich mit anderen Teilnehmenden aus, z. B. für Mitfahrgelegenheiten. Nachrichten
            verschwinden nach {CHAT_RETENTION_DAYS} Tagen.
          </p>
        </div>
      </header>

      <div className="chat-box">
        <ul
          ref={listRef}
          className="chat-list candle-room-list"
          role="log"
          aria-live="polite"
          aria-label={`Nachrichten im ${CANDLE_ROOM_NAME}`}
          data-testid="candle-room-list"
        >
          {loading && <li className="chat-state">Lade Nachrichten…</li>}
          {!loading && error && messages.length === 0 && (
            <li className="chat-state" role="alert">
              Die Nachrichten konnten nicht geladen werden.
            </li>
          )}
          {!loading && !error && messages.length === 0 && (
            <li className="chat-state" data-testid="candle-room-empty">
              Noch keine Nachrichten. Zünde die erste Kerze an! 🕯️
            </li>
          )}
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              own={Boolean(user) && m.authorUid === user.uid}
              canDelete={Boolean(user) && (m.authorUid === user.uid || isAdmin)}
              canReport={false}
              onDelete={setToDelete}
              me={user?.uid}
              isTarget={jumpTarget === m.id}
            />
          ))}
        </ul>
      </div>

      {notice && (
        <p className="chat-notice" role="status">
          {notice}
        </p>
      )}

      {writeArea}

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        title="Nachricht löschen?"
        message="Die Nachricht wird für alle entfernt."
        confirmLabel="Löschen"
        danger
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

// The Kerzenraum of one event. Rendered only when the chat flag lets this
// person read it (all: everyone, admins: admins only). It sits as a bar between
// the event details and the description; the toggle button stays put and shows
// or hides the chat below it. The chat (and its Firestore reads) only mounts
// after the first opening. A mention link (#msg-... / #kerzenraum) opens it
// without moving focus (no pop-up keyboard on phones); a click focuses the
// message field.
function openedByHash(hash) {
  return /^#(msg-|kerzenraum)/.test(hash);
}

export default function CandleRoom({ eventId }) {
  const { role, loading: authLoading } = useAuth();
  const { mode, loading } = useChatSettings();
  const { hash } = useLocation();
  const canRead = canReadCandleRoom({ mode, isAdmin: role === 'Admin' });
  const activity = useCandleRoomActivity(canRead && !authLoading && !loading && Boolean(eventId));
  const [open, setOpen] = useState(() => openedByHash(hash));
  const [mounted, setMounted] = useState(open);
  const [focusRequest, setFocusRequest] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (openedByHash(hash)) {
      setOpen(true);
      setMounted(true);
    }
  }, [hash]);

  useEffect(() => {
    if (!open || !focusRequest) return;
    setFocusRequest(false);
    const panel = panelRef.current;
    const target =
      panel?.querySelector('[data-testid="candle-room-input"]') ??
      panel?.querySelector('[data-testid="candle-room-rules-accept"]');
    target?.focus?.();
    panel?.scrollIntoView?.({ block: 'nearest' });
  }, [open, focusRequest]);

  if (authLoading || loading || !eventId) return null;
  if (!canRead) return null;

  const hasNews = !open && hasNewCandleMessages(activity[eventId], readCandleRoomSeen(eventId));
  const toggle = () => {
    if (!open) {
      setMounted(true);
      setFocusRequest(true);
    }
    setOpen(!open);
  };

  return (
    <section id="kerzenraum" className="candle-room" aria-label={CANDLE_ROOM_NAME}>
      <button
        type="button"
        className="candle-room-toggle"
        aria-expanded={open}
        aria-controls="candle-room-panel"
        data-testid="candle-room-toggle"
        onClick={toggle}
      >
        <span className={`candle-flame${hasNews ? ' candle-flame--lit' : ''}`} aria-hidden="true">
          🕯️
        </span>
        <span className="candle-room-toggle-label">{CANDLE_ROOM_NAME}</span>
        {hasNews && (
          <span className="candle-room-new-label" data-testid="candle-room-toggle-new">
            Neue Nachrichten
          </span>
        )}
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`candle-room-chevron${open ? ' candle-room-chevron--open' : ''}`}
        />
      </button>
      <div ref={panelRef} hidden={!open}>
        {mounted && <CandleRoomInner eventId={eventId} mode={mode} />}
      </div>
    </section>
  );
}
