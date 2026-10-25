import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ChevronDown } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import ChatMessage from './ChatMessage';
import ChatRules from './ChatRules';
import MessageComposer from './MessageComposer';
import MemberCard from '../messenger/MemberCard';
import ConfirmDialog from '../ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';
import { useChatSettings } from '../../hooks/useChatSettings';
import { useCandleRoom, useCandleRoomActivity } from '../../hooks/useCandleRoom';
import { useMessageJump } from '../../hooks/useMessageJump';
import { CHAT_RETENTION_DAYS, describeChatBan, isChatBanActive } from '../../utils/chat';
import { REACTION_FAILED } from '../../utils/reactions';
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
const NEAR_BOTTOM_PX = 120;

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
  const {
    messages,
    loading,
    error,
    sending,
    ban,
    canLoadMore,
    loadOlder,
    send,
    remove,
    report,
    react,
  } = useCandleRoom(eventId, true);
  // What counts as "new" is fixed when the room is opened, so the candle
  // keeps flickering for what arrived since the last visit.
  const [seenAtOpen] = useState(() => readCandleRoomSeen(eventId));
  const [rulesAccepted, setRulesAccepted] = useState(readRulesAccepted);
  const [toDelete, setToDelete] = useState(null);
  const [toReport, setToReport] = useState(null);
  const [memberCard, setMemberCard] = useState(null);
  const [unseen, setUnseen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const lastId = useRef(null);
  const lastCount = useRef(0);
  const prependFrom = useRef(null);
  const jumpTarget = useMessageJump(messages, {
    onJump: () => {
      stickToBottom.current = false;
    },
  });

  const hasNew = hasNewForeignMessages(messages, user?.uid ?? null, seenAtOpen);
  const banned = isChatBanActive(ban);
  const canInteract = Boolean(user?.emailVerified) && !banned;

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stickToBottom.current = true;
    setUnseen(0);
  }, []);

  const loadOlderKeepingPosition = () => {
    prependFrom.current = listRef.current?.scrollHeight ?? null;
    loadOlder();
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickToBottom.current = near;
    if (near) setUnseen(0);
  };

  // Remember the newest confirmed message as seen (the calendar candle goes out).
  useEffect(() => {
    const newest = [...messages].reverse().find((m) => !m.pending && m.createdAt);
    if (newest) markCandleRoomSeen(eventId, newest.createdAt);
  }, [messages, eventId]);

  // Keep the view at the newest message unless the reader scrolled up.
  // Loading older messages grows the list at the top and must not scroll.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (prependFrom.current !== null && el) {
      el.scrollTop += el.scrollHeight - prependFrom.current;
      prependFrom.current = null;
    }
    const newest = messages.length ? messages[messages.length - 1].id : null;
    const appended = newest !== lastId.current && lastCount.current > 0;
    if (stickToBottom.current) {
      scrollToBottom();
    } else if (appended) {
      setUnseen((n) => n + 1);
    }
    lastCount.current = messages.length;
    lastId.current = newest;
  }, [messages, scrollToBottom]);

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

  const confirmReport = async () => {
    if (!toReport) return;
    setBusy(true);
    try {
      await report(toReport);
      setNotice('Danke! Wir schauen uns die Nachricht an.');
    } catch (err) {
      setNotice(
        err?.code === 'permission-denied'
          ? 'Du hast diese Nachricht bereits gemeldet.'
          : 'Die Meldung konnte nicht gesendet werden.'
      );
    } finally {
      setToReport(null);
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
        canReport
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
        onSent={() => {
          stickToBottom.current = true;
        }}
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
          onScroll={onScroll}
          data-testid="candle-room-list"
        >
          {canLoadMore && (
            <li className="chat-older">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={loadOlderKeepingPosition}
                data-testid="candle-room-older"
              >
                Ältere Nachrichten laden
              </button>
            </li>
          )}
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
              canReport={Boolean(user?.emailVerified) && m.authorUid !== user.uid}
              onDelete={setToDelete}
              onReport={setToReport}
              me={user?.uid}
              isTarget={jumpTarget === m.id}
              canReact={canInteract}
              onReact={(msg, emoji) => react(msg.id, emoji)}
              onReactError={() => setNotice(REACTION_FAILED)}
              onOpenMember={(msg) =>
                setMemberCard({
                  uid: msg.authorUid,
                  name: msg.authorName,
                  photoURL: msg.authorPhotoURL,
                })
              }
            />
          ))}
        </ul>
        {unseen > 0 && (
          <button
            type="button"
            className="chat-jump"
            onClick={scrollToBottom}
            data-testid="candle-room-jump"
          >
            <ArrowDown size={16} aria-hidden="true" />{' '}
            {unseen === 1 ? 'Neue Nachricht' : `${unseen} neue Nachrichten`}
          </button>
        )}
      </div>

      {notice && (
        <p className="chat-notice" role="status">
          {notice}
        </p>
      )}

      {writeArea}

      {memberCard && (
        <MemberCard
          uid={memberCard.uid}
          fallbackName={memberCard.name}
          fallbackPhotoURL={memberCard.photoURL}
          onClose={() => setMemberCard(null)}
        />
      )}

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
      <ConfirmDialog
        isOpen={Boolean(toReport)}
        title="Nachricht melden?"
        message="Unser Team schaut sich die Nachricht an und entscheidet, ob sie gelöscht wird."
        confirmLabel="Melden"
        loading={busy}
        onConfirm={confirmReport}
        onCancel={() => setToReport(null)}
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
