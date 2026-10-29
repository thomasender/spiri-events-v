import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { useChatHeartbeat, useChatPresence } from '../hooks/useChatPresence';
import { useMessageJump } from '../hooks/useMessageJump';
import {
  CHAT_RETENTION_DAYS,
  describeOnline,
  describeChatBan,
  isChatBanActive,
} from '../utils/chat';
import { REACTION_FAILED } from '../utils/reactions';
import './ChatPage.css';

const RULES_KEY = 'chatRulesAccepted';
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

function ChatRoom() {
  const { user, role } = useAuth();
  const isAdmin = role === 'Admin';
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
  } = useChat();
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
  useChatHeartbeat(true);
  const { online } = useChatPresence(true);

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
      <WhoIsHere online={online} selfUid={user?.uid} onOpenMember={setMemberCard} />
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
              Noch ist es still am Lagerfeuer. Sag doch einfach Hallo! 👋
            </li>
          )}
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              own={m.authorUid === user?.uid}
              canDelete={m.authorUid === user?.uid || isAdmin}
              canReport={m.authorUid !== user?.uid}
              onDelete={setToDelete}
              onReport={setToReport}
              me={user?.uid}
              isTarget={jumpTarget === m.id}
              canReact={!banned}
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

      {!rulesAccepted ? (
        <ChatRules onAccept={acceptRules} />
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
    </>
  );
}

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const { available, loading: settingsLoading } = useChatAccess();
  const [verifyOpen, setVerifyOpen] = useState(false);

  if (authLoading || settingsLoading) return <div className="loading-spinner"></div>;
  if (!available) return <ErrorPage type="not-found" redirectSeconds={5} />;

  const verified = Boolean(user?.emailVerified);

  return (
    <>
      <SeoMeta title="Lagerfeuer-Chat" path="/chat" noindex />
      <div className="page-container chat-page" data-testid="chat-page">
        <header className="chat-header">
          <Flame size={28} className="chat-header-icon" aria-hidden="true" />
          <div>
            <h1>Lagerfeuer</h1>
            <p>
              Der Chat für alle Mitglieder. Nachrichten verschwinden nach {CHAT_RETENTION_DAYS}{' '}
              Tagen.
            </p>
          </div>
        </header>
        {verified ? (
          <ChatRoom />
        ) : (
          <div className="chat-state chat-unverified" data-testid="chat-unverified">
            <p>
              Bitte bestätige zuerst deine E-Mail-Adresse, um im Chat mitzulesen und zu schreiben.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setVerifyOpen(true)}>
              E-Mail bestätigen
            </button>
            <EmailVerificationModal open={verifyOpen} onClose={() => setVerifyOpen(false)} />
          </div>
        )}
      </div>
    </>
  );
}
