import { useMemo } from 'react';
import { useEventsWithMessages } from './useEventsWithMessages';

export function useUnreadMessageCount() {
  const { unreadCountByEvent, loading } = useEventsWithMessages();
  const count = useMemo(
    () => Object.values(unreadCountByEvent).reduce((sum, n) => sum + n, 0),
    [unreadCountByEvent]
  );
  return { count, loading };
}

export function useHasMessages() {
  const { events, loading } = useEventsWithMessages();
  return { hasMessages: events.length > 0, loading };
}
