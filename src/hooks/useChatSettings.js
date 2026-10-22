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
function useFeatureMode(docId, defaultMode = 'off') {
  const [mode, setMode] = useState(defaultMode);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'app_settings', docId),
      (snap) => {
        const value = snap.exists() ? snap.data().mode : defaultMode;
        setMode(CHAT_MODES.includes(value) ? value : defaultMode);
        setLoading(false);
      },
      () => {
        setMode('off');
        setLoading(false);
      }
    );
  }, [docId, defaultMode]);

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

// Online status flag. A missing doc means "admins" (test mode), see firestore.rules.
export function useOnlineStatusSettings() {
  return useFeatureMode('onlineStatus', 'admins');
}

export function useOnlineStatusAccess() {
  const { user, role } = useAuth();
  const { mode, loading } = useOnlineStatusSettings();
  const available = Boolean(user) && canEnterChat({ mode, isAdmin: role === 'Admin' });
  return { available, mode, loading };
}

// Profile onboarding wizard flag: app_settings/onboarding { mode }. A missing doc means off.
export function useOnboardingSettings() {
  return useFeatureMode('onboarding');
}

export function useOnboardingAccess() {
  const { user, role } = useAuth();
  const { mode, loading } = useOnboardingSettings();
  const available = Boolean(user) && canEnterChat({ mode, isAdmin: role === 'Admin' });
  return { available, mode, loading };
}
