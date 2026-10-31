import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

/**
 * Super-Admin only: open moderator invitations (functions/src/moderatorInvites.ts).
 * `invite(email, regionIds, { sendEmail })` creates a new link (and revokes older open
 * ones for the same address); it resolves to { inviteId, inviteUrl, expiresAt, emailSent }.
 */
export function useModeratorInvites(enabled) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await httpsCallable(functions, 'adminListModeratorInvites')();
      setInvites(result.data?.invites ?? []);
    } catch (err) {
      console.error('Loading moderator invitations failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const invite = useCallback(
    async (email, regionIds, { sendEmail = true } = {}) => {
      const result = await httpsCallable(
        functions,
        'adminCreateModeratorInvite'
      )({ email, regionIds, sendEmail });
      await load();
      return result.data;
    },
    [load]
  );

  const revoke = useCallback(
    async (inviteId) => {
      await httpsCallable(functions, 'adminRevokeModeratorInvite')({ inviteId });
      await load();
    },
    [load]
  );

  return { invites, loading, error, reload: load, invite, revoke };
}
