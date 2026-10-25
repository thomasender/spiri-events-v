import { useCallback, useEffect, useState } from 'react';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import {
  useChatSettings,
  useMessengerSettings,
  useOnboardingSettings,
  useOnlineStatusSettings,
} from './useChatSettings';
import { CHAT_PERMANENT_UNTIL_MS, CHAT_ROOM_ID } from '../utils/chat';
import { CANDLE_ROOM_COLLECTION } from '../utils/candleRoom';

// Where a reported message lives: the Lagerfeuer, or an event's Kerzenraum.
export function reportedMessageRef(messageId, eventId) {
  return eventId
    ? doc(db, CANDLE_ROOM_COLLECTION, eventId, 'messages', messageId)
    : doc(db, 'chat_rooms', CHAT_ROOM_ID, 'messages', messageId);
}

function toMillis(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis() : 0;
}

// Admin side of the chat: flag, open reports, mutes/bans and the actions on them.
export function useChatAdmin(enabled) {
  const { user } = useAuth();
  const { mode, loading: modeLoading } = useChatSettings();
  const { mode: messengerMode } = useMessengerSettings();
  const { mode: onlineStatusMode } = useOnlineStatusSettings();
  const { mode: onboardingMode } = useOnboardingSettings();
  const [dmReports, setDmReports] = useState([]);
  const [reports, setReports] = useState([]);
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    // No orderBy next to the where: that would need a composite index, and
    // the list of open reports stays short.
    const unsubReports = onSnapshot(
      query(collection(db, 'chat_reports'), where('status', '==', 'open')),
      (snap) => {
        setReports(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data(), createdAtMs: toMillis(d.data().createdAt) }))
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
        setLoading(false);
      },
      (err) => {
        console.error('useChatAdmin reports error:', err);
        setError(err);
        setLoading(false);
      }
    );
    const unsubDmReports = onSnapshot(
      query(collection(db, 'dm_reports'), where('status', '==', 'open')),
      (snap) => {
        setDmReports(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data(), createdAtMs: toMillis(d.data().createdAt) }))
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
      },
      (err) => console.error('useChatAdmin dm reports error:', err)
    );
    const unsubBans = onSnapshot(
      collection(db, 'chat_bans'),
      (snap) => {
        setBans(
          snap.docs
            .map((d) => {
              const untilMs = toMillis(d.data().until);
              return { uid: d.id, ...d.data(), untilMs, active: untilMs > Date.now() };
            })
            .sort((a, b) => b.untilMs - a.untilMs)
        );
      },
      (err) => console.error('useChatAdmin bans error:', err)
    );
    return () => {
      unsubReports();
      unsubDmReports();
      unsubBans();
    };
  }, [enabled]);

  const setMode = useCallback(
    async (next) => {
      await setDoc(
        doc(db, 'app_settings', 'chat'),
        { mode: next, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null },
        { merge: true }
      );
    },
    [user]
  );

  const setMessengerMode = useCallback(
    async (next) => {
      await setDoc(
        doc(db, 'app_settings', 'messenger'),
        { mode: next, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null },
        { merge: true }
      );
    },
    [user]
  );

  const setOnlineStatusMode = useCallback(
    async (next) => {
      await setDoc(
        doc(db, 'app_settings', 'onlineStatus'),
        { mode: next, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null },
        { merge: true }
      );
    },
    [user]
  );

  const setOnboardingMode = useCallback(
    async (next) => {
      await setDoc(
        doc(db, 'app_settings', 'onboarding'),
        { mode: next, updatedAt: serverTimestamp(), updatedBy: user?.uid ?? null },
        { merge: true }
      );
    },
    [user]
  );

  const resolveDmReport = useCallback(
    async (reportId) => {
      await updateDoc(doc(db, 'dm_reports', reportId), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.uid ?? null,
      });
    },
    [user]
  );

  const resolveReport = useCallback(
    async (reportId) => {
      await updateDoc(doc(db, 'chat_reports', reportId), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.uid ?? null,
      });
    },
    [user]
  );

  // `eventId` set = message of that event's Kerzenraum, otherwise the Lagerfeuer.
  const deleteMessage = useCallback(async (messageId, eventId) => {
    await deleteDoc(reportedMessageRef(messageId, eventId));
  }, []);

  // durationMs null = permanent.
  const ban = useCallback(
    async ({ uid, userName, durationMs, reason }) => {
      const untilMs = durationMs == null ? CHAT_PERMANENT_UNTIL_MS : Date.now() + durationMs;
      await setDoc(doc(db, 'chat_bans', uid), {
        until: Timestamp.fromMillis(untilMs),
        reason: String(reason || '').slice(0, 200),
        bannedBy: user?.uid ?? '',
        userName: String(userName || '').slice(0, 80),
        createdAt: serverTimestamp(),
      });
    },
    [user]
  );

  const unban = useCallback(async (uid) => {
    await deleteDoc(doc(db, 'chat_bans', uid));
  }, []);

  return {
    mode,
    messengerMode,
    onlineStatusMode,
    setOnlineStatusMode,
    onboardingMode,
    setOnboardingMode,
    dmReports,
    setMessengerMode,
    resolveDmReport,
    loading: loading || modeLoading,
    error,
    reports,
    bans,
    setMode,
    resolveReport,
    deleteMessage,
    ban,
    unban,
  };
}
