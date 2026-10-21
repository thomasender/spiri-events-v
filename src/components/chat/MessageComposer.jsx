import { useEffect, useRef, useState } from 'react';
import { Send, Smile } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import { CHAT_MAX_LENGTH, chatTextLength } from '../../utils/chat';
import {
  MAX_EMOJI_SUGGESTIONS,
  exactShortcode,
  findShortcodeToken,
  loadEmojiIndex,
  replaceToken,
  searchEmojis,
} from '../../utils/emojiSearch';
import { replaceEmoticonBeforeCaret, replaceTrailingEmoticon } from '../../utils/emoticons';

// Message field shared by the Lagerfeuer chat and the private messenger:
// emoji finder, :shortcode suggestions, text emoticons, Enter to send,
// focus on desktop. `onSend(text)` rejects with an Error whose message is shown.
export default function MessageComposer({
  onSend,
  sending = false,
  placeholder = 'Schreib etwas Nettes…',
  ariaLabel = 'Nachricht',
  maxLength = CHAT_MAX_LENGTH,
  testIdPrefix = 'chat',
  onSent,
}) {
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiIndex, setEmojiIndex] = useState(null);
  const [caret, setCaret] = useState(0);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(-1);
  const inputRef = useRef(null);
  const emojiWrapRef = useRef(null);
  const autoReplaced = useRef(null);

  const length = chatTextLength(draft);
  const tooLong = length > maxLength;

  // ":fire" before the caret offers matching emoji (German names and English
  // shortcodes); the index loads when the first colon is typed.
  const token = findShortcodeToken(draft, caret);
  const suggestions =
    token && emojiIndex && token.start !== dismissedAt
      ? searchEmojis(emojiIndex, token.query, MAX_EMOJI_SUGGESTIONS)
      : [];
  const suggestionsOpen = suggestions.length > 0;
  const listId = `${testIdPrefix}-emoji-suggestions`;

  // Desktop: the cursor is in the message field as soon as it exists. Not on
  // phones, where it would open the keyboard and cover the conversation.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, []);

  // The emoji finder closes on Escape and on a click or tap outside of it.
  useEffect(() => {
    if (!emojiOpen) return undefined;
    const close = () => setEmojiOpen(false);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      close();
      inputRef.current?.focus({ preventScroll: true });
    };
    const onPointer = (e) => {
      if (!emojiWrapRef.current?.contains(e.target)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [emojiOpen]);

  const submit = async (e) => {
    e?.preventDefault();
    if (sending || !draft.trim() || tooLong) return;
    setSendError('');
    try {
      await onSend(replaceTrailingEmoticon(draft));
      setDraft('');
      setEmojiOpen(false);
      onSent?.();
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
    // ":)" followed by a space becomes the emoji (only while typing, never
    // when deleting). Backspace right after undoes it.
    autoReplaced.current = null;
    if (value.length > draft.length && /\s/.test(value[pos - 1] ?? '')) {
      const swapped = replaceEmoticonBeforeCaret(value, pos);
      if (swapped) {
        autoReplaced.current = {
          at: swapped.caret,
          original: swapped.original,
          replacedLength: swapped.replacedLength,
        };
        value = swapped.text;
        pos = swapped.caret;
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
    const undo = autoReplaced.current;
    if (
      e.key === 'Backspace' &&
      undo &&
      e.target.selectionStart === undo.at &&
      e.target.selectionEnd === undo.at
    ) {
      e.preventDefault();
      const from = undo.at - undo.replacedLength;
      const pos = from + undo.original.length;
      setDraft(draft.slice(0, from) + undo.original + draft.slice(undo.at));
      setCaret(pos);
      autoReplaced.current = null;
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(pos, pos));
      return;
    }
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

  return (
    <form className="chat-form" onSubmit={submit}>
      {suggestionsOpen && (
        <ul
          className="chat-suggestions"
          id={listId}
          role="listbox"
          aria-label="Emoji-Vorschläge"
          data-testid={`${testIdPrefix}-suggestions`}
        >
          {suggestions.map((entry, i) => (
            <li
              key={entry.emoji}
              id={`${listId}-${i}`}
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
        <div className="chat-emoji-wrap" ref={emojiWrapRef}>
          <button
            type="button"
            className="chat-icon-button"
            aria-label="Emoji einfügen"
            aria-expanded={emojiOpen}
            onClick={() => setEmojiOpen((o) => !o)}
            data-testid={`${testIdPrefix}-emoji-toggle`}
          >
            <Smile size={22} aria-hidden="true" />
          </button>
          {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
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
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={suggestionsOpen ? `${listId}-${activeSuggestion}` : undefined}
          placeholder={placeholder}
          aria-label={ariaLabel}
          enterKeyHint="send"
          autoComplete="off"
          data-testid={`${testIdPrefix}-input`}
        />
        <button
          type="submit"
          className="btn btn-primary chat-send"
          disabled={sending || tooLong || !draft.trim()}
          aria-label="Senden"
          data-testid={`${testIdPrefix}-send`}
        >
          <Send size={18} aria-hidden="true" />
          <span className="chat-send-label">Senden</span>
        </button>
      </div>
      <div className="chat-form-foot">
        <span className={`chat-counter${tooLong ? ' chat-counter--over' : ''}`}>
          {length}/{maxLength}
        </span>
        {sendError && (
          <span className="chat-send-error" role="alert" data-testid={`${testIdPrefix}-send-error`}>
            {sendError}
          </span>
        )}
      </div>
    </form>
  );
}
