import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDown, Flame } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import ChatMessage from '../components/chat/ChatMessage';
import ChatRules from '../components/chat/ChatRules';
import MessageComposer from '../components/chat/MessageComposer';
import MemberCard from '../components/messenger/MemberCard';
import ConfirmDialog from '../components/ConfirmDialog';
import { MemberBadgeFrame } from '../components/MemberBadge';
import EmailVerificationModal from '../components/EmailVerificationModal';
import ErrorPage from './ErrorPage';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useChatAccess } from '../hooks/useChatSettings';
import { useChatRoom } from '../hooks/useChatRoom';
import { useRegion } from '../hooks/useRegion';
import { useProfile } from '../hooks/useProfile';
import { useChatHeartbeat, useChatPresence } from '../hooks/useChatPresence';
import { useMessageJump } from '../hooks/useMessageJump';
import {
  CHAT_RETENTION_DAYS,
  chatRoomRegionId,
  describeOnline,
  describeChatBan,
  isChatBanActive,
} from '../utils/chat';
import { REACTION_FAILED } from '../utils/reactions';
import { getStaffAccess } from '../utils/staffRoles';
import './ChatPage.css';

// Renamed when guests could start reading along (Trello 6af1955f): everyone sees the
// rules, with the new audience, once more before writing.
const RULES_KEY = 'chatRulesAccepted2';
const NEAR_BOTTOM_PX = 120;

function readRulesAccepted() {
  try {
    return window.localStorage.getItem(RULES_KEY) === '1';
  } catch {
    return false;
  }
}

const PRESENCE_AVATARS = 10;

function WhoIsHere({ online, selfUid, onOpenMember }) {
  if (online.length === 0) return null;
  const others = online.filter((m) => m.uid !== selfUid);
  const label =
    others.length === 0
      ? 'Du sitzt gerade allein am Lagerfeuer.'
      : `Am Lagerfeuer: ${describeOnline(others)}`;
  return (
    <div className="chat-presence" data-testid="chat-presence" aria-live="polite">
      <ul className="chat-presence-avatars" aria-label="Gerade im Chat">
        {online.slice(0, PRESENCE_AVATARS).map((m) => (
          <li key={m.uid} title={m.name}>
            {(() => {
              const avatar = (
                <MemberBadgeFrame uid={m.uid}>
                  {m.photoURL ? (
                    <img
                      className="chat-presence-avatar"
                      src={m.photoURL}
                      alt={m.name}
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="chat-presence-avatar chat-presence-avatar--fallback"
                      role="img"
                      aria-label={m.name}
                    >
                      {m.name.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </MemberBadgeFrame>
              );
              return m.uid === selfUid ? (
                avatar
              ) : (
                <button
                  type="button"
                  className="chat-member-button"
                  onClick={() => onOpenMember({ uid: m.uid, name: m.name, photoURL: m.photoURL })}
                  aria-label={`${m.name} ansehen`}
                >
                  {avatar}
                </button>
              );
            })()}
          </li>
        ))}
        {online.length > PRESENCE_AVATARS && (
          <li className="chat-presence-more">+{online.length - PRESENCE_AVATARS}</li>
        )}
      </ul>
      <span className="chat-presence-text">
        <strong data-testid="chat-presence-count">{online.length}</strong>{' '}
        {online.length === 1 ? 'Person' : 'Personen'} online · {label}
      </span>
    </div>
  );
}

// Read-only visitors (no login, or e-mail not confirmed yet): a hint instead of the input.
function ReadOnlyHint({ user }) {
  const location = useLocation();
  const [verifyOpen, setVerifyOpen] = useState(false);
  if (!user) {
    return (
      <p className="chat-state chat-readonly" data-testid="chat-login">
        <Link
          to="/login"
          state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        >
          Melde dich an
        </Link>
        , um im Lagerfeuer mitzuschreiben.
      </p>
    );
  }
  return (
    <div className="chat-state chat-unverified" data-testid="chat-unverified">
      <p>Bitte bestätige zuerst deine E-Mail-Adresse, um im Lagerfeuer mitzuschreiben.</p>
      <button type="button" className="btn btn-primary" onClick={() => setVerifyOpen(true)}>
        E-Mail bestätigen
      </button>
      <EmailVerificationModal open={verifyOpen} onClose={() => setVerifyOpen(false)} />
    </div>
  );
}

// `readOnly`: guests and people without a verified e-mail read the messages marked for guests
// and nothing else: no presence (neither seen nor written), no member card, no reactions,
// reports or deleting (Trello 6af1955f).
function ChatRoom({ roomId, regionMode, readOnly = false, guestsRead = false }) {
  const { user, role, staffRegionIds } = useAuth();
  const isAdmin = role === 'Admin';
  // Regions-Moderator:innen delete messages in their region's Lagerfeuer (only with region rooms).
  const canModerate =
    !readOnly &&
    (isAdmin ||
      (regionMode &&
        getStaffAccess(role, staffRegionIds).canModerateRegion(chatRoomRegionId(roomId))));
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
  } = useChat(roomId, { guestView: readOnly });
  const [notice, setNotice] = useState('');
  const [rulesAccepted, setRulesAccepted] = useState(readRulesAccepted);
  const [toDelete, setToDelete] = useState(null);
  const [toReport, setToReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [memberCard, setMemberCard] = useState(null);
  const [unseen, setUnseen] = useState(0);
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const lastCount = useRef(0);
  const lastId = useRef(null);
  const prependFrom = useRef(null);
  const jumpTarget = useMessageJump(messages, {
    onJump: () => {
      stickToBottom.current = false;
    },
  });
  useChatHeartbeat(!readOnly, roomId);
  const { online } = useChatPresence(!readOnly, roomId);

  const banned = isChatBanActive(ban);
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
      setToDelete(null);
    } catch {
      setToDelete(null);
      setNotice('Die Nachricht konnte nicht gelöscht werden.');
    } finally {
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

  if (error && messages.length === 0) {
    return (
      <p className="chat-state" role="alert" data-testid="chat-error">
        Der Chat konnte nicht geladen werden. Bitte lade die Seite neu.
      </p>
    );
  }

  return (
    <>
      {!readOnly && <WhoIsHere online={online} selfUid={user?.uid} onOpenMember={setMemberCard} />}
      <div className="chat-box">
        <ul
          ref={listRef}
          className="chat-list"
          role="log"
          aria-live="polite"
          aria-label="Nachrichten im Lagerfeuer"
          onScroll={onScroll}
          data-testid="chat-list"
        >
          {canLoadMore && (
            <li className="chat-older">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={loadOlderKeepingPosition}
              >
                Ältere Nachrichten laden
              </button>
            </li>
          )}
          {loading && <li className="chat-state">Lade Nachrichten…</li>}
          {!loading && messages.length === 0 && (
            <li className="chat-state" data-testid="chat-empty">
              {readOnly
                ? 'Noch ist es still am Lagerfeuer.'
                : 'Noch ist es still am Lagerfeuer. Sag doch einfach Hallo! 👋'}
            </li>
          )}
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              own={Boolean(user) && m.authorUid === user.uid}
              canDelete={!readOnly && (m.authorUid === user?.uid || canModerate)}
              canReport={!readOnly && m.authorUid !== user?.uid}
              onDelete={setToDelete}
              onReport={setToReport}
              me={user?.uid}
              isTarget={jumpTarget === m.id}
              canReact={!readOnly && !banned}
              onReact={(msg, emoji) => react(msg.id, emoji)}
              onReactError={() => setNotice(REACTION_FAILED)}
              onOpenMember={
                readOnly
                  ? undefined
                  : (msg) =>
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
            data-testid="chat-jump"
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

      {readOnly ? (
        <ReadOnlyHint user={user} />
      ) : !rulesAccepted ? (
        <ChatRules
          onAccept={acceptRules}
          audience={
            guestsRead
              ? 'Alle angemeldeten Mitglieder und, ohne Anmeldung, auch alle Besucher:innen der Website'
              : undefined
          }
        />
      ) : banned ? (
        <p className="chat-banned" role="status" data-testid="chat-banned">
          {describeChatBan(ban)}
        </p>
      ) : (
        <MessageComposer
          onSend={send}
          sending={sending}
          mentionsEnabled
          selfUid={user?.uid}
          onSent={() => {
            stickToBottom.current = true;
          }}
        />
      )}

      {memberCard && !readOnly && (
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
    </>
  );
}

// "Anderes Feuer": every open fire (only with two or more active regions).
function FireChooser({ room }) {
  const navigate = useNavigate();
  const id = useId();
  if (room.choices.length < 2) return null;
  return (
    <div className="chat-fire-chooser" data-testid="chat-fire-chooser">
      <label htmlFor={id}>{room.roomId ? 'Anderes Feuer:' : 'Offene Feuer:'}</label>
      <select
        id={id}
        value={room.roomId ?? ''}
        onChange={(e) => {
          if (e.target.value) navigate(`/chat?raum=${encodeURIComponent(e.target.value)}`);
        }}
      >
        {!room.roomId && <option value="">Bitte wählen…</option>}
        {room.choices.map((c) => (
          <option key={c.roomId} value={c.roomId}>
            {c.roomId === room.ownRoomId ? `${c.name} (dein Feuer)` : c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile(user?.uid);
  const { readable, mode, loading: settingsLoading } = useChatAccess();
  const room = useChatRoom(profile);
  // Wait for the regions: with two active ones the room is a region's, not `lagerfeuer`.
  const { loading: regionsLoading } = useRegion();

  if (authLoading || settingsLoading || regionsLoading) {
    return <div className="loading-spinner"></div>;
  }
  if (!readable) return <ErrorPage type="not-found" redirectSeconds={5} />;

  const verified = Boolean(user?.emailVerified);
  // Guests read along only while the chat is open for everyone (mode 'all'; the rules agree).
  const guestsRead = mode === 'all';
  const readOnly = !verified;
  const regionMode = room.choices.length > 0;

  return (
    <>
      <SeoMeta title="Lagerfeuer-Chat" path="/chat" noindex />
      <div className="page-container chat-page" data-testid="chat-page">
        <header className="chat-header">
          <Flame size={28} className="chat-header-icon" aria-hidden="true" />
          <div>
            <h1>{room.title}</h1>
            <p>
              {guestsRead
                ? 'Schreiben können alle Mitglieder, mitlesen können alle.'
                : 'Der Chat für alle Mitglieder.'}{' '}
              Nachrichten verschwinden nach {CHAT_RETENTION_DAYS} Tagen.
            </p>
          </div>
        </header>
        {regionMode && <FireChooser room={room} />}
        {readOnly && !guestsRead ? (
          // Test mode 'admins' with an unconfirmed e-mail: nothing to read along.
          <ReadOnlyHint user={user} />
        ) : !room.roomId ? (
          <p className="chat-state chat-no-room" data-testid="chat-no-room" role="status">
            {room.ownRegionId
              ? 'Das Lagerfeuer deiner Region startet, sobald die Region online geht. Bis dahin kannst du dich an eines der offenen Feuer setzen.'
              : 'Wähle ein Lagerfeuer, an das du dich setzen möchtest.'}
          </p>
        ) : (
          <ChatRoom
            key={room.roomId}
            roomId={room.roomId}
            regionMode={regionMode}
            readOnly={readOnly}
            guestsRead={guestsRead}
          />
        )}
      </div>
    </>
  );
}
