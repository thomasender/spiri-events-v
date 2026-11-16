import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { canSeeMembership, parseMembershipSettings } from '../utils/clubMembership';

// Live view of app_settings/membership { mode, statutesUrl, statutesVersion }.
// A missing doc means off (Trello 6af620c0).
export function useMembershipSettings() {
  const [settings, setSettings] = useState(() => parseMembershipSettings(null));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'app_settings', 'membership'),
      (snap) => {
        setSettings(parseMembershipSettings(snap.exists() ? snap.data() : null));
        setLoading(false);
      },
      () => {
        setSettings(parseMembershipSettings(null));
        setLoading(false);
      }
    );
  }, []);

  return { ...settings, loading };
}

// Whether this visitor sees the Pioniere sign-up at all (`visible`, also guests
// with mode 'all', who are sent to log in), plus the settings.
export function useMembershipAccess() {
  const { role } = useAuth();
  const settings = useMembershipSettings();
  const isAdmin = role === 'Admin';
  return { ...settings, isAdmin, visible: canSeeMembership({ mode: settings.mode, isAdmin }) };
}

// The signed-in person's own club_memberships/{uid} doc (null when there is none).
export function useOwnMembership(uid) {
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(Boolean(uid));

  useEffect(() => {
    if (!uid) {
      setMembership(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, 'club_memberships', uid),
      (snap) => {
        setMembership(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('club_memberships listener failed:', err);
        setMembership(null);
        setLoading(false);
      }
    );
  }, [uid]);

  return { membership, loading };
}
