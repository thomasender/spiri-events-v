import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FieldPath,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { CHAT_COOLDOWN_MS, cooldownRemainingMs, validateChatText } from '../utils/chat';
import {
  DM_MAX_LENGTH,
  DM_MAX_LOADED,
  DM_PAGE_SIZE,
  buildReportExcerpt,
  countUnreadThreads,
  dmSnippet,
  isThreadUnread,
  threadIdFor,
} from '../utils/messenger';
import { sanitizeReactions } from '../utils/reactions';

function toMillis(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis() : null;
}

function mapThread(d) {
  const data = d.data({ serverTimestamps: 'estimate' });
  const readAt = {};
  Object.entries(data.readAt ?? {}).forEach(([uid, ts]) => {
    readAt[uid] = toMillis(ts) ?? 0;
  });
  return {
    id: d.id,
    participants: Array.isArray(data.participants) ? data.participants : [],
    lastMessageText: data.lastMessageText ?? '',
    lastMessageAt: toMillis(data.lastMessageAt),
    lastMessageBy: data.lastMessageBy ?? '',
    readAt,
  };
}

// All my conversations, newest first, plus the number of unread ones. One
// listener serves both the inbox list and the bubble in the menu.
export function useThreads(enabled) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));

  useEffect(() => {
    if (!enabled || !uid) {
      setThreads([]);
      setLoading(false);
      return undefined;
    }
    // No orderBy: that would need a composite index. A person has few threads.
    const q = query(
      collection(db, 'dm_threads'),
      where('participants', 'array-contains', uid),
      limit(200)
    );
    return onSnapshot(
      q,
      (snap) => {
        setThreads(
          snap.docs.map(mapThread).sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
        );
        setLoading(false);
      },
      () => {
        setThreads([]);
        setLoading(false);
      }
    );
  }, [enabled, uid]);

  const unreadCount = useMemo(() => countUnreadThreads(threads, uid), [threads, uid]);
  return { threads, loading, unreadCount };
}

// One conversation with `other`: thread summary, messages, send, read mark, delete, report.
export function useConversation(other, nameOf) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const tid = uid && other ? threadIdFor(uid, other) : null;
  const [thread, setThread] = useState(null);
  const [threadLoaded, setThreadLoaded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [windowSize, setWindowSize] = useState(DM_PAGE_SIZE);
  const [sending, setSending] = useState(false);
  const lastSentAt = useRef(0);

  useEffect(() => {
    setThread(null);
    setThreadLoaded(false);
    setMessages([]);
    setLoading(Boolean(tid));
    setWindowSize(DM_PAGE_SIZE);
    if (!tid) return undefined;
    return onSnapshot(
      doc(db, 'dm_threads', tid),
      (snap) => {
        setThread(snap.exists() ? mapThread(snap) : null);
        setThreadLoaded(true);
      },
      () => {
        setThread(null);
        setThreadLoaded(true);
      }
    );
  }, [tid]);

  useEffect(() => {
    if (!tid) return undefined;
    const q = query(
      collection(db, 'dm_threads', tid, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(windowSize)
    );
    return onSnapshot(
      q,
      (snap) => {
        setMessages(
          snap.docs
            .map((d) => {
              const data = d.data({ serverTimestamps: 'estimate' });
              return {
                id: d.id,
                text: data.text ?? '',
                authorUid: data.authorUid ?? '',
                createdAt: toMillis(data.createdAt),
                reactions: sanitizeReactions(data.reactions),
                pending: d.metadata.hasPendingWrites,
              };
            })
            .reverse()
        );
        setLoading(false);
      },
      () => {
        setMessages([]);
        setLoading(false);
      }
    );
  }, [tid, windowSize]);

  const canLoadMore = messages.length >= windowSize && windowSize < DM_MAX_LOADED;
  const loadOlder = useCallback(
    () => setWindowSize((size) => Math.min(DM_MAX_LOADED, size + DM_PAGE_SIZE)),
    []
  );

  const unread = isThreadUnread(thread, uid);
  const markRead = useCallback(async () => {
    if (!tid || !uid) return;
    try {
      await updateDoc(doc(db, 'dm_threads', tid), { [`readAt.${uid}`]: serverTimestamp() });
    } catch {
      // Marking read is a nicety; the next visit tries again.
    }
  }, [tid, uid]);

  const send = useCallback(
    async (raw) => {
      if (!user || !tid) throw new Error('Bitte melde dich an.');
      if (!threadLoaded) throw new Error('Einen Moment, die Unterhaltung lädt noch.');
      const checked = validateChatText(raw, DM_MAX_LENGTH);
      if (!checked.ok) throw new Error(checked.error);
      const wait = cooldownRemainingMs(lastSentAt.current);
      if (wait > 0) {
        throw new Error(`Bitte warte kurz (${Math.ceil(wait / 1000)} s), bevor du erneut sendest.`);
      }

      const attempt = async () => {
        const batch = writeBatch(db);
        const threadRef = doc(db, 'dm_threads', tid);
        const summary = {
          lastMessageText: dmSnippet(checked.text),
          lastMessageAt: serverTimestamp(),
          lastMessageBy: user.uid,
        };
        if (thread) {
          batch.update(threadRef, summary);
        } else {
          batch.set(threadRef, {
            participants: [user.uid, other].sort(),
            ...summary,
            readAt: { [user.uid]: serverTimestamp() },
            createdAt: serverTimestamp(),
          });
          // Starting conversations is rate-limited (20 s apart, 30 per day).
          const starterRef = doc(db, 'dm_starters', user.uid);
          const day = Math.floor(Date.now() / 86400000);
          const prev = await getDoc(starterRef).catch(() => null);
          const prevData = prev?.exists() ? prev.data() : null;
          const count = prevData && prevData.day === day ? (prevData.count ?? 0) + 1 : 1;
          batch.set(starterRef, { lastThreadAt: serverTimestamp(), day, count });
        }
        batch.set(doc(collection(db, 'dm_threads', tid, 'messages')), {
          text: checked.text,
          authorUid: user.uid,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      };

      setSending(true);
      try {
        try {
          await attempt();
        } catch (err) {
          if (err?.code !== 'permission-denied') throw err;
          await user.getIdToken(true);
          await attempt();
        }
        lastSentAt.current = Date.now();
      } catch (err) {
        if (err?.code === 'permission-denied') {
          // Deliberately vague: a block or "no private messages" must not be revealed.
          throw new Error(
            'Die Nachricht konnte nicht zugestellt werden. Versuche es später noch einmal.'
          );
        }
        throw err;
      } finally {
        setSending(false);
      }
    },
    [user, tid, other, thread, threadLoaded]
  );

  const remove = useCallback(
    async (messageId) => {
      await deleteDoc(doc(db, 'dm_threads', tid, 'messages', messageId));
    },
    [tid]
  );

  // One reaction per person: `emoji` replaces mine, null removes it.
  const react = useCallback(
    async (messageId, emoji) => {
      if (!uid || !tid) throw new Error('Bitte melde dich an.');
      await updateDoc(
        doc(db, 'dm_threads', tid, 'messages', messageId),
        new FieldPath('reactions', uid),
        emoji ?? deleteField()
      );
    },
    [uid, tid]
  );

  const report = useCallback(
    async (reportedName) => {
      if (!user || !tid) throw new Error('Bitte melde dich an.');
      await setDoc(doc(db, 'dm_reports', `${tid}_${user.uid}`), {
        threadId: tid,
        reportedBy: user.uid,
        reportedUid: other,
        reportedName: String(reportedName || 'Mitglied').slice(0, 80),
        excerpt: buildReportExcerpt(messages, (u) =>
          u === user.uid ? 'Melder:in' : (nameOf?.(u) ?? 'Mitglied')
        ),
        status: 'open',
        createdAt: serverTimestamp(),
      });
    },
    [user, tid, other, messages, nameOf]
  );

  return {
    tid,
    thread,
    threadLoaded,
    messages,
    loading,
    sending,
    unread,
    canLoadMore,
    loadOlder,
    markRead,
    send,
    remove,
    report,
    react,
  };
}

// People I blocked, with block / unblock.
export function useDmBlocks(enabled = true) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [blocked, setBlocked] = useState([]);

  useEffect(() => {
    if (!enabled || !uid) {
      setBlocked([]);
      return undefined;
    }
    return onSnapshot(
      query(collection(db, 'dm_blocks'), where('blocker', '==', uid)),
      (snap) => setBlocked(snap.docs.map((d) => d.data().blocked).filter(Boolean)),
      () => setBlocked([])
    );
  }, [enabled, uid]);

  const block = useCallback(
    async (target) => {
      await setDoc(doc(db, 'dm_blocks', `${uid}_${target}`), {
        blocker: uid,
        blocked: target,
        createdAt: serverTimestamp(),
      });
    },
    [uid]
  );
  const unblock = useCallback(
    async (target) => {
      await deleteDoc(doc(db, 'dm_blocks', `${uid}_${target}`));
    },
    [uid]
  );

  return { blocked, block, unblock };
}

// "Keine Privatnachrichten": my own switch.
export function useMyDmSetting(enabled = true) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [allow, setAllow] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || !uid) return undefined;
    return onSnapshot(
      doc(db, 'dm_settings', uid),
      (snap) => {
        setAllow(!snap.exists() || snap.data().allowDirectMessages !== false);
        setLoaded(true);
      },
      () => setLoaded(true)
    );
  }, [enabled, uid]);

  const update = useCallback(
    async (next) => {
      await setDoc(doc(db, 'dm_settings', uid), {
        allowDirectMessages: next,
        updatedAt: serverTimestamp(),
      });
    },
    [uid]
  );

  return { allow, loaded, update };
}

// Whether someone else takes private messages (false = they switched them off).
export function useAcceptsDirectMessages(uid) {
  const [accepts, setAccepts] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setAccepts(true);
    if (!uid) return undefined;
    getDoc(doc(db, 'dm_settings', uid))
      .then((snap) => {
        if (!cancelled) setAccepts(!snap.exists() || snap.data().allowDirectMessages !== false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid]);
  return accepts;
}

// My own mute/ban entry (it also blocks private messages).
export function useOwnChatBan() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [ban, setBan] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(
      doc(db, 'chat_bans', uid),
      (snap) => setBan(snap.exists() ? snap.data() : null),
      () => setBan(null)
    );
  }, [uid]);
  return ban;
}
