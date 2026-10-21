import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { CHAT_MODES, canEnterChat } from '../utils/chat';

// Live view of the chat feature flag app_settings/chat { mode }. A missing doc
// or an unknown value means "off".
export function useChatSettings() {
  const [mode, setMode] = useState('off');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'app_settings', 'chat'),
      (snap) => {
        const value = snap.exists() ? snap.data().mode : 'off';
        setMode(CHAT_MODES.includes(value) ? value : 'off');
        setLoading(false);
      },
      () => {
        setMode('off');
        setLoading(false);
      }
    );
  }, []);

  return { mode, loading };
}

// Whether the signed-in person may see the chat under the current flag.
export function useChatAccess() {
  const { user, role } = useAuth();
  const { mode, loading } = useChatSettings();
  const available = Boolean(user) && canEnterChat({ mode, isAdmin: role === 'Admin' });
  return { available, mode, loading };
}

// Same flag pattern for the private messenger: app_settings/messenger { mode }.
function useFeatureMode(docId) {
  const [mode, setMode] = useState('off');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'app_settings', docId),
      (snap) => {
        const value = snap.exists() ? snap.data().mode : 'off';
        setMode(CHAT_MODES.includes(value) ? value : 'off');
        setLoading(false);
      },
      () => {
        setMode('off');
        setLoading(false);
      }
    );
  }, [docId]);

  return { mode, loading };
}

export function useMessengerSettings() {
  return useFeatureMode('messenger');
}

export function useMessengerAccess() {
  const { user, role } = useAuth();
  const { mode, loading } = useMessengerSettings();
  const available = Boolean(user) && canEnterChat({ mode, isAdmin: role === 'Admin' });
  return { available, mode, loading };
}
