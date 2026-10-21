import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, Flame, Send, Smile } from 'lucide-react';
import SeoMeta from '../components/SeoMeta';
import ChatMessage from '../components/chat/ChatMessage';
import EmojiPicker from '../components/chat/EmojiPicker';
import ConfirmDialog from '../components/ConfirmDialog';
import EmailVerificationModal from '../components/EmailVerificationModal';
import ErrorPage from './ErrorPage';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useChatAccess } from '../hooks/useChatSettings';
import { useChatHeartbeat, useChatPresence } from '../hooks/useChatPresence';
import {
  CHAT_MAX_LENGTH,
  CHAT_RETENTION_DAYS,
  chatTextLength,
  describeOnline,
  describeChatBan,
  isChatBanActive,
} from '../utils/chat';
import {
  MAX_EMOJI_SUGGESTIONS,
  exactShortcode,
  findShortcodeToken,
  loadEmojiIndex,
  replaceToken,
  searchEmojis,
} from '../utils/emojiSearch';
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

function ChatRules({ onAccept }) {
  return (
    <section className="chat-rules" data-testid="chat-rules" aria-labelledby="chat-rules-title">
      <h2 id="chat-rules-title">Chat-Regeln</h2>
      <ul>
        <li>Sei freundlich und respektvoll. Keine Beleidigungen, Hetze oder Diskriminierung.</li>
        <li>Kein Spam, keine Werbung, keine Kettennachrichten.</li>
        <li>Keine persönlichen Daten anderer, keine Gesundheits- oder Heilversprechen.</li>
        <li>
          Alle angemeldeten Mitglieder können deine Nachrichten mit Namen und Foto sehen. Sie werden
          nach {CHAT_RETENTION_DAYS} Tagen automatisch gelöscht.
        </li>
        <li>
          Verstöße kannst du melden. Die Moderation kann Nachrichten löschen und Mitglieder
          ausschließen.
        </li>
      </ul>
      <p>
        Mehr dazu in der <Link to="/datenschutz">Datenschutzerklärung</Link> (Abschnitt
        Community-Chat).
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onAccept}
        data-testid="chat-rules-accept"
      >
        Verstanden, los geht&apos;s
      </button>
    </section>
  );
}

const PRESENCE_AVATARS = 10;

function WhoIsHere({ online, selfUid }) {
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
            {m.photoURL ? (
              <img className="chat-presence-avatar" src={m.photoURL} alt={m.name} loading="lazy" />
            ) : (
              <span
                className="chat-presence-avatar chat-presence-avatar--fallback"
                role="img"
                aria-label={m.name}
              >
                {m.name.trim().charAt(0).toUpperCase()}
              </span>
            )}
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
  const { messages, loading, error, sending, ban, canLoadMore, loadOlder, send, remove, report } =
    useChat();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [notice, setNotice] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(readRulesAccepted);
  const [toDelete, setToDelete] = useState(null);
  const [toReport, setToReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);
  const lastCount = useRef(0);
  const lastId = useRef(null);
  const prependFrom = useRef(null);
  useChatHeartbeat(true);
  const { online } = useChatPresence(true);
  const [emojiIndex, setEmojiIndex] = useState(null);
  const [caret, setCaret] = useState(0);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(-1);

  const banned = isChatBanActive(ban);
  const length = chatTextLength(draft);
  const tooLong = length > CHAT_MAX_LENGTH;

  // ":fire" before the caret offers matching emoji (German names and English
  // shortcodes); the index loads when the first colon is typed.
  const token = findShortcodeToken(draft, caret);
  const suggestions =
    token && emojiIndex && token.start !== dismissedAt
      ? searchEmojis(emojiIndex, token.query, MAX_EMOJI_SUGGESTIONS)
      : [];
  const suggestionsOpen = suggestions.length > 0;

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

  const submit = async (e) => {
    e?.preventDefault();
    if (sending || banned || !draft.trim()) return;
    setSendError('');
    try {
      await send(draft);
      setDraft('');
      setEmojiOpen(false);
      stickToBottom.current = true;
      inputRef.current?.focus();
    } catch (err) {
      setSendError(err?.message || 'Die Nachricht konnte nicht gesendet werden.');
    }
  };

  const setCaretFrom = (el) => setCaret(el.selectionStart ?? el.value.length);

  const onDraftChange = (e) => {
    const el = e.target;
    let value = el.value;
    let pos = el.selectionStart ?? value.length;
    if (value.includes(':') && !emojiIndex)
      loadEmojiIndex()
        .then(setEmojiIndex)
        .catch(() => {});
    // ":fire:" with the closing colon turns into the emoji right away.
    const typed = findShortcodeToken(value, pos);
    if (typed?.closed && emojiIndex) {
      const exact = exactShortcode(emojiIndex, typed.query);
      if (exact) {
        value = replaceToken(value, typed, exact.emoji);
        pos = typed.start + exact.emoji.length;
        requestAnimationFrame(() => el.setSelectionRange(pos, pos));
      }
    }
    setDraft(value);
    setCaret(pos);
    setActiveSuggestion(0);
  };

  const pickSuggestion = (emoji) => {
    if (!token) return;
    const next = replaceToken(draft, token, emoji);
    const pos = token.start + emoji.length;
    setDraft(next);
    setCaret(pos);
    setActiveSuggestion(0);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e) => {
    if (suggestionsOpen && !e.nativeEvent.isComposing) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActiveSuggestion((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickSuggestion(suggestions[Math.min(activeSuggestion, suggestions.length - 1)].emoji);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissedAt(token.start);
        return;
      }
    }
    // Enter sends, Shift+Enter makes a new line. Never while an IME is composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const insertEmoji = (emoji) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
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
      <WhoIsHere online={online} selfUid={user?.uid} />
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
        <form className="chat-form" onSubmit={submit}>
          {suggestionsOpen && (
            <ul
              className="chat-suggestions"
              id="chat-emoji-suggestions"
              role="listbox"
              aria-label="Emoji-Vorschläge"
              data-testid="chat-suggestions"
            >
              {suggestions.map((entry, i) => (
                <li
                  key={entry.emoji}
                  id={`chat-emoji-suggestion-${i}`}
                  role="option"
                  aria-selected={i === activeSuggestion}
                  className={`chat-suggestion${i === activeSuggestion ? ' chat-suggestion--active' : ''}`}
                  // mousedown keeps the focus in the text field
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickSuggestion(entry.emoji);
                  }}
                >
                  <span className="chat-suggestion-emoji">{entry.emoji}</span>
                  <span className="chat-suggestion-code">:{entry.codes[0] ?? entry.label}</span>
                  <span className="chat-suggestion-label">{entry.label}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="chat-input-row">
            <div className="chat-emoji-wrap">
              <button
                type="button"
                className="chat-icon-button"
                aria-label="Emoji einfügen"
                aria-expanded={emojiOpen}
                onClick={() => setEmojiOpen((o) => !o)}
                data-testid="chat-emoji-toggle"
              >
                <Smile size={22} aria-hidden="true" />
              </button>
              {emojiOpen && (
                <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />
              )}
            </div>
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              value={draft}
              onChange={onDraftChange}
              onKeyDown={onKeyDown}
              onKeyUp={(e) => setCaretFrom(e.target)}
              onClick={(e) => setCaretFrom(e.target)}
              role="combobox"
              aria-expanded={suggestionsOpen}
              aria-controls="chat-emoji-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={
                suggestionsOpen ? `chat-emoji-suggestion-${activeSuggestion}` : undefined
              }
              placeholder="Schreib etwas Nettes…"
              aria-label="Nachricht"
              enterKeyHint="send"
              autoComplete="off"
              data-testid="chat-input"
            />
            <button
              type="submit"
              className="btn btn-primary chat-send"
              disabled={sending || tooLong || !draft.trim()}
              aria-label="Senden"
              data-testid="chat-send"
            >
              <Send size={18} aria-hidden="true" />
              <span className="chat-send-label">Senden</span>
            </button>
          </div>
          <div className="chat-form-foot">
            <span className={`chat-counter${tooLong ? ' chat-counter--over' : ''}`}>
              {length}/{CHAT_MAX_LENGTH}
            </span>
            {sendError && (
              <span className="chat-send-error" role="alert" data-testid="chat-send-error">
                {sendError}
              </span>
            )}
          </div>
        </form>
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
