import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getStaffAccess } from '../utils/staffRoles';
import { staffEventQuerySpecs, subscribeEventQueries } from '../lib/staffEventQueries';

// Same scope as useTrashedEvents (role decides: all / own regions + own / own).
export function useTrashedEventsCount() {
  const { user, role, staffRegionIds } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const regionKey = Array.isArray(staffRegionIds) ? staffRegionIds.join(',') : '';

  useEffect(() => {
    if (!user) {
      setCount(0);
      setLoading(false);
      return undefined;
    }

    const access = getStaffAccess(role, regionKey ? regionKey.split(',') : []);
    return subscribeEventQueries(
      staffEventQuerySpecs({ access, uid: user.uid, status: 'trashed' }),
      (list) => {
        setCount(list.length);
        setLoading(false);
      },
      (err) => {
        console.error('useTrashedEventsCount error:', err);
        setLoading(false);
      }
    );
  }, [user, role, regionKey]);

  return { count, loading };
}
