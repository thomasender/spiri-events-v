import { useCallback, useEffect, useState } from 'react';
import { callable } from '../lib/firebase';

/**
 * Super-Admin only: open moderator invitations (functions/src/moderatorInvites.ts).
 * `invite(email, regionIds, { sendEmail })` creates a new link (and revokes older open
 * ones for the same address); it resolves to { inviteId, inviteUrl, expiresAt, emailSent }.
 * `inviteMember(uid, regionIds)` does the same for an existing member ("Moderator:in
 * hinzufügen"): the server takes the account's own address.
 */
export function useModeratorInvites(enabled) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await callable('adminListModeratorInvites')();
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
      const result = await callable('adminCreateModeratorInvite')({ email, regionIds, sendEmail });
      await load();
      return result.data;
    },
    [load]
  );

  const inviteMember = useCallback(
    async (uid, regionIds) => {
      const result = await callable('adminCreateModeratorInvite')({ uid, regionIds });
      await load();
      return result.data;
    },
    [load]
  );

  const revoke = useCallback(
    async (inviteId) => {
      await callable('adminRevokeModeratorInvite')({ inviteId });
      await load();
    },
    [load]
  );

  return { invites, loading, error, reload: load, invite, inviteMember, revoke };
}
