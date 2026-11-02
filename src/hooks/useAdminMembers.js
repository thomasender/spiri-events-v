import { useCallback, useEffect, useState } from 'react';
import { callable } from '../lib/firebase';

// Admin-only member list. E-Mail addresses live in Firebase Auth, so the data
// comes from a callable Cloud Function that re-checks the admin role itself.
export function useAdminMembers(enabled) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await callable('adminListMembers')();
      setMembers(result.data?.members ?? []);
    } catch (err) {
      console.error('Loading members failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const updateMember = useCallback(async (uid, changes) => {
    await callable('adminUpdateMember')({ uid, changes });
    setMembers((prev) => prev.map((m) => (m.uid === uid ? { ...m, ...changes } : m)));
  }, []);

  return { members, loading, error, reload: load, updateMember };
}
