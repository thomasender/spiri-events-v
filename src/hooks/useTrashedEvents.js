import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getStaffAccess } from '../utils/staffRoles';
import { staffEventQuerySpecs, subscribeEventQueries } from '../lib/staffEventQueries';

/**
 * Trashed events: Super-Admin all, a Regions-Moderator:in those of her regions
 * plus her own, everyone else their own.
 */
export function useTrashedEvents() {
  const { user, role, staffRegionIds } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const regionKey = Array.isArray(staffRegionIds) ? staffRegionIds.join(',') : '';

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return undefined;
    }

    const access = getStaffAccess(role, regionKey ? regionKey.split(',') : []);
    return subscribeEventQueries(
      staffEventQuerySpecs({ access, uid: user.uid, status: 'trashed' }),
      (list) => {
        list.sort((a, b) => {
          const aTime = a.trashedAt?.toMillis ? a.trashedAt.toMillis() : 0;
          const bTime = b.trashedAt?.toMillis ? b.trashedAt.toMillis() : 0;
          return bTime - aTime;
        });
        setEvents(list);
        setLoading(false);
      },
      (err) => {
        console.error('useTrashedEvents error:', err);
        setLoading(false);
      }
    );
  }, [user, role, regionKey]);

  return { events, loading };
}
