import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, SmilePlus } from 'lucide-react';
import {
  QUICK_REACTION,
  REACTIONS,
  nextReaction,
  reactionLabel,
  summarizeReactions,
} from '../../utils/reactions';
import './MessageReactions.css';

const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP_PX = 30;
const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

function pillLabel({ emoji, count, mine }) {
  const base = `${reactionLabel(emoji)}, ${count} ${count === 1 ? 'Reaktion' : 'Reaktionen'}`;
  return mine ? `${base}, deine Reaktion. Antippen entfernt sie` : base;
}

// Wraps a message bubble: double-tap / double-click reacts with a heart,
// long-press (touch) or the smiley button opens the five-emoji bar, and the
// pills below show the counts. Writing is the parent's job (`onReact`, which
// gets the new emoji or null to remove); the live listener brings the result.
export default function MessageReactions({
  reactions,
  me,
  canReact,
  onReact,
  onError,
  text,
  align = 'start',
  children,
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const pickerRef = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const press = useRef({ timer: null, x: 0, y: 0, fired: false });
  const busy = useRef(false);

  const mine = me ? (reactions?.[me] ?? null) : null;
  const pills = summarizeReactions(reactions, me);

  const react = useCallback(
    async (emoji) => {
      if (!canReact || busy.current) return;
      busy.current = true;
      try {
        await onReact(nextReaction(mine, emoji));
      } catch (err) {
        onError?.(err);
      } finally {
        busy.current = false;
      }
    },
    [canReact, mine, onReact, onError]
  );

  const close = useCallback((returnFocus) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    pickerRef.current?.querySelector('button')?.focus({ preventScroll: true });
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => () => clearTimeout(press.current.timer), []);

  const onBubbleClick = (e) => {
    if (press.current.fired) {
      press.current.fired = false;
      return;
    }
    if (!canReact || e.target.closest?.('a')) return;
    const now = Date.now();
    const prev = lastTap.current;
    const near =
      Math.abs(e.clientX - prev.x) < DOUBLE_TAP_SLOP_PX &&
      Math.abs(e.clientY - prev.y) < DOUBLE_TAP_SLOP_PX;
    if (now - prev.t < DOUBLE_TAP_MS && near) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      react(QUICK_REACTION);
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  // A double-click would otherwise select a word.
  const onBubbleMouseDown = (e) => {
    if (canReact && e.detail > 1) e.preventDefault();
  };

  const cancelPress = () => {
    clearTimeout(press.current.timer);
    press.current.timer = null;
  };

  const onTouchStart = (e) => {
    if (!canReact || e.touches.length !== 1) return;
    const t = e.touches[0];
    cancelPress();
    press.current = {
      x: t.clientX,
      y: t.clientY,
      fired: false,
      timer: setTimeout(() => {
        press.current.fired = true;
        press.current.timer = null;
        setOpen(true);
      }, LONG_PRESS_MS),
    };
  };

  const onTouchMove = (e) => {
    const t = e.touches[0];
    if (
      t &&
      (Math.abs(t.clientX - press.current.x) > MOVE_CANCEL_PX ||
        Math.abs(t.clientY - press.current.y) > MOVE_CANCEL_PX)
    ) {
      cancelPress();
    }
  };

  const onContextMenu = (e) => {
    if (press.current.fired || press.current.timer) e.preventDefault();
  };

  const canCopy = Boolean(text) && typeof navigator !== 'undefined' && navigator.clipboard;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard refused (permissions): nothing to do.
    }
  };

  return (
    <div className={`reactable reactable--${align}`} ref={rootRef}>
      <div className="reactable-row">
        <div
          className="reactable-bubble"
          onClick={onBubbleClick}
          onMouseDown={onBubbleMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={cancelPress}
          onTouchCancel={cancelPress}
          onContextMenu={onContextMenu}
          data-testid="reactable-bubble"
        >
          {children}
        </div>
        {canReact && (
          <button
            type="button"
            ref={triggerRef}
            className="reaction-trigger"
            aria-label="Mit Emoji reagieren"
            aria-expanded={open}
            title="Reagieren"
            onClick={() => setOpen((v) => !v)}
            data-testid="reaction-trigger"
          >
            <SmilePlus size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && canReact && (
        <div
          ref={pickerRef}
          className="reaction-picker"
          role="toolbar"
          aria-label="Reaktion wählen"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close(true);
            }
          }}
          data-testid="reaction-picker"
        >
          {REACTIONS.map(({ emoji, label }) => (
            <button
              key={emoji}
              type="button"
              className={`reaction-option${mine === emoji ? ' reaction-option--mine' : ''}`}
              aria-label={mine === emoji ? `${label} entfernen` : `Mit ${label} reagieren`}
              aria-pressed={mine === emoji}
              onClick={() => {
                close(false);
                react(emoji);
              }}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
          {canCopy && (
            <button
              type="button"
              className="reaction-option reaction-option--copy"
              aria-label={copied ? 'Text kopiert' : 'Text kopieren'}
              title="Text kopieren"
              onClick={copy}
            >
              {copied ? (
                <span className="reaction-copied">Kopiert</span>
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      )}

      {pills.length > 0 && (
        <div className="reaction-pills" data-testid="reaction-pills">
          {pills.map((p) => (
            <button
              key={p.emoji}
              type="button"
              className={`reaction-pill${p.mine ? ' reaction-pill--mine' : ''}`}
              aria-pressed={p.mine}
              aria-label={pillLabel(p)}
              disabled={!canReact}
              onClick={() => react(p.emoji)}
            >
              <span aria-hidden="true">{p.emoji}</span>
              <span className="reaction-count" aria-hidden="true">
                {p.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
