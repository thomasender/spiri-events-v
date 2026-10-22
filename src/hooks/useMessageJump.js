import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const HIGHLIGHT_MS = 2600;

// A mention notification links to "...#msg-<messageId>". Once that message is
// loaded and on the page, scroll it into view and highlight it for a moment.
// Returns the id to highlight (or null). `onJump` runs just before scrolling, so
// a chat that normally sticks to the newest message can let go of it.
export function useMessageJump(messages, { onJump } = {}) {
  const { hash } = useLocation();
  const [targetId, setTargetId] = useState(null);
  const handled = useRef(null);
  const jumpRef = useRef(onJump);
  useEffect(() => {
    jumpRef.current = onJump;
  });

  useEffect(() => {
    const id = /^#msg-(.+)$/.exec(hash)?.[1];
    if (!id || handled.current === id) return;
    if (!messages.some((m) => m.id === id)) return;
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    handled.current = id;
    jumpRef.current?.();
    el.scrollIntoView?.({ block: 'center' });
    setTargetId(id);
  }, [hash, messages]);

  useEffect(() => {
    if (!targetId) return undefined;
    const t = setTimeout(() => setTargetId(null), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [targetId]);

  return targetId;
}
