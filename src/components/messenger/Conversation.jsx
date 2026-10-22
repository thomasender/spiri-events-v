import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, MoreVertical, Trash2 } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';
import MessageComposer from '../chat/MessageComposer';
import MessageReactions from '../chat/MessageReactions';
import { MemberAvatar } from './ThreadList';
import OnlineDot from '../OnlineDot';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useAuth } from '../../hooks/useAuth';
import { useMemberInfo } from '../../hooks/useMemberInfo';
import {
  useAcceptsDirectMessages,
  useConversation,
  useDmBlocks,
  useOwnChatBan,
} from '../../hooks/useMessenger';
import { describeChatBan, formatChatTime, isChatBanActive } from '../../utils/chat';
import { DM_MAX_LENGTH, DM_RETENTION_DAYS } from '../../utils/messenger';
import { REACTION_FAILED } from '../../utils/reactions';

const NEAR_BOTTOM_PX = 120;

export default function Conversation({ other }) {
  const { user } = useAuth();
  const me = user?.uid;
  const info = useMemberInfo(other);
  const { statusOf } = useOnlineStatus();
  const name = info?.name ?? '…';
  const nameOf = useCallback((uid) => (uid === other ? name : 'Mitglied'), [other, name]);
  const conv = useConversation(other, nameOf);
  const { blocked, block, unblock } = useDmBlocks();
  const accepts = useAcceptsDirectMessages(other);
  const ownBan = useOwnChatBan();
  const [toDelete, setToDelete] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [unseen, setUnseen] = useState(0);
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const lastId = useRef(null);
  const lastCount = useRef(0);
  const menuRef = useRef(null);

  const blockedByMe = blocked.includes(other);
  const banned = isChatBanActive(ownBan);
  const gone = info?.exists === false;
  // Reactions follow the same gate as writing (the rules also check the other side).
  const canReact = !banned && !gone && !blockedByMe && accepts;

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stickToBottom.current = true;
    setUnseen(0);
  }, []);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickToBottom.current = near;
    if (near) setUnseen(0);
  };

  useLayoutEffect(() => {
    const newest = conv.messages.length ? conv.messages[conv.messages.length - 1].id : null;
    const appended = newest !== lastId.current && lastCount.current > 0;
    if (stickToBottom.current) scrollToBottom();
    else if (appended) setUnseen((n) => n + 1);
    lastCount.current = conv.messages.length;
    lastId.current = newest;
  }, [conv.messages, scrollToBottom]);

  // A new conversation starts at the bottom.
  useEffect(() => {
    stickToBottom.current = true;
    lastId.current = null;
    lastCount.current = 0;
  }, [other]);

  // Reading it (tab visible) marks the conversation as read.
  const { unread, markRead } = conv;
  const lastMessageAt = conv.thread?.lastMessageAt;
  useEffect(() => {
    if (!unread) return undefined;
    const mark = () => {
      if (document.visibilityState === 'visible') markRead();
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [unread, lastMessageAt, markRead]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const closeMenu = () => menuRef.current?.removeAttribute('open');

  const run = async (fn, okText) => {
    setBusy(true);
    try {
      await fn();
      if (okText) setNotice(okText);
    } catch (err) {
      setNotice(
        err?.code === 'permission-denied'
          ? 'Das ist gerade nicht möglich.'
          : 'Das hat nicht geklappt. Bitte versuche es noch einmal.'
      );
    } finally {
      setBusy(false);
      setConfirm(null);
      setToDelete(null);
    }
  };

  let composer;
  if (banned) {
    composer = (
      <p className="chat-banned" role="status" data-testid="dm-banned">
        {describeChatBan(ownBan)}
      </p>
    );
  } else if (gone) {
    composer = <p className="chat-banned">Dieses Mitglied gibt es nicht mehr.</p>;
  } else if (blockedByMe) {
    composer = (
      <div className="chat-banned" data-testid="dm-blocked">
        <p>Du hast {name} blockiert. Du bekommst keine Nachrichten mehr von dieser Person.</p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => run(() => unblock(other), 'Blockierung aufgehoben.')}
        >
          Blockierung aufheben
        </button>
      </div>
    );
  } else if (!accepts) {
    composer = (
      <p className="chat-banned" role="status" data-testid="dm-no-dm">
        {name} nimmt aktuell keine Privatnachrichten an.
      </p>
    );
  } else {
    composer = (
      <MessageComposer
        key={other}
        testIdPrefix="dm"
        onSend={conv.send}
        sending={conv.sending}
        maxLength={DM_MAX_LENGTH}
        placeholder={`Nachricht an ${name}`}
        ariaLabel={`Nachricht an ${name}`}
        onSent={() => {
          stickToBottom.current = true;
        }}
      />
    );
  }

  return (
    <section className="messenger-conversation" data-testid="messenger-conversation">
      <header className="messenger-conversation-head">
        <Link to="/postfach" className="messenger-back" aria-label="Zurück zum Postfach">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <span className="messenger-avatar-wrap">
          <MemberAvatar info={info} className="messenger-avatar" />
          <OnlineDot status={statusOf(other, info?.showOnlineStatus)} />
        </span>
        <div className="messenger-conversation-title">
          {info?.slug ? <Link to={`/${info.slug}`}>{name}</Link> : <span>{name}</span>}
        </div>
        {!gone && (
          <details className="messenger-menu" ref={menuRef}>
            <summary aria-label="Weitere Aktionen" data-testid="messenger-menu">
              <MoreVertical size={20} aria-hidden="true" />
            </summary>
            <div className="messenger-menu-list" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  setConfirm('report');
                }}
                data-testid="messenger-report"
              >
                Unterhaltung melden
              </button>
              {blockedByMe ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    run(() => unblock(other), 'Blockierung aufgehoben.');
                  }}
                >
                  Blockierung aufheben
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    setConfirm('block');
                  }}
                  data-testid="messenger-block"
                >
                  Blockieren
                </button>
              )}
            </div>
          </details>
        )}
      </header>

      <div className="chat-box messenger-box">
        <ul
          ref={listRef}
          className="chat-list messenger-messages"
          role="log"
          aria-live="polite"
          aria-label={`Unterhaltung mit ${name}`}
          onScroll={onScroll}
          data-testid="dm-list"
        >
          {conv.canLoadMore && (
            <li className="chat-older">
              <button type="button" className="btn btn-secondary" onClick={conv.loadOlder}>
                Ältere Nachrichten laden
              </button>
            </li>
          )}
          {conv.loading && <li className="chat-state">Lade Nachrichten…</li>}
          {!conv.loading && conv.messages.length === 0 && (
            <li className="chat-state" data-testid="dm-empty">
              Schreibe {name} die erste Nachricht. Nachrichten werden nach {DM_RETENTION_DAYS} Tagen
              automatisch gelöscht.
            </li>
          )}
          {conv.messages.map((m) => {
            const own = m.authorUid === me;
            return (
              <li
                key={m.id}
                className={`messenger-message${own ? ' messenger-message--own' : ''}${
                  m.pending ? ' messenger-message--pending' : ''
                }`}
                data-testid="dm-message"
              >
                <MessageReactions
                  reactions={m.reactions}
                  me={me}
                  canReact={canReact && !m.pending}
                  onReact={(emoji) => conv.react(m.id, emoji)}
                  onError={() => setNotice(REACTION_FAILED)}
                  text={m.text}
                  align={own ? 'end' : 'start'}
                >
                  <div className={`chat-bubble messenger-bubble${own ? ' chat-bubble--own' : ''}`}>
                    {m.text}
                  </div>
                </MessageReactions>
                <div className="messenger-message-meta">
                  <time>{formatChatTime(m.createdAt)}</time>
                  {own && !m.pending && (
                    <button
                      type="button"
                      className="chat-action chat-action--danger"
                      onClick={() => setToDelete(m)}
                      aria-label="Nachricht löschen"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      <span>Löschen</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {unseen > 0 && (
          <button type="button" className="chat-jump" onClick={scrollToBottom}>
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
      {composer}

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        title="Nachricht löschen?"
        message="Die Nachricht wird bei euch beiden entfernt."
        confirmLabel="Löschen"
        danger
        loading={busy}
        onConfirm={() => run(() => conv.remove(toDelete.id))}
        onCancel={() => setToDelete(null)}
      />
      <ConfirmDialog
        isOpen={confirm === 'block'}
        title={`${name} blockieren?`}
        message={`Du bekommst keine Nachrichten mehr von ${name}. ${name} erfährt nicht, dass du blockiert hast. Du kannst die Blockierung jederzeit aufheben.`}
        confirmLabel="Blockieren"
        danger
        loading={busy}
        onConfirm={() => run(() => block(other), `${name} ist blockiert.`)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm === 'report'}
        title="Unterhaltung melden?"
        message="Die letzten Nachrichten dieser Unterhaltung gehen an unser Team. Sonst kann niemand von uns eure Nachrichten lesen."
        confirmLabel="Melden"
        loading={busy}
        onConfirm={() =>
          run(async () => {
            try {
              await conv.report(name);
            } catch (err) {
              if (err?.code === 'permission-denied') {
                setNotice('Du hast diese Unterhaltung bereits gemeldet.');
                return;
              }
              throw err;
            }
            setNotice('Danke! Wir schauen uns die Unterhaltung an.');
          })
        }
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
