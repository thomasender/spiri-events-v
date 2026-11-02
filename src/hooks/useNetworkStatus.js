import { useCallback, useEffect, useState } from 'react';
import {
  NETWORK_SLOW_EVENT,
  createOfflineNotice,
  isBrowserOnline,
  isSlowConnection,
  markSlowNoticeShown,
  prefersSaveData,
  readConnection,
  wasSlowNoticeShown,
} from '../utils/networkStatus';

// Which connection hint to show. `notice` is 'hidden' | 'offline' | 'reconnected'
// (with delay and minimum time, see createOfflineNotice); `slow` is true once a
// slow network was noticed (at most once per session, until dismissed).
// `saveData` is only read, it gets no hint of its own.
export function useNetworkStatus() {
  const [notice, setNotice] = useState('hidden');
  const [slow, setSlow] = useState(false);
  const [saveData] = useState(() => prefersSaveData(readConnection()));

  useEffect(() => {
    const controller = createOfflineNotice((next) => {
      setNotice(next);
      // Offline says more than "slow"; do not bring the slow hint back afterwards.
      if (next === 'offline') setSlow(false);
    });
    const onOffline = () => controller.offline();
    const onOnline = () => controller.online();
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    if (!isBrowserOnline()) controller.offline();
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      controller.dispose();
    };
  }, []);

  useEffect(() => {
    const flagSlow = () => {
      // A load that failed because the visitor is offline is the offline hint's job,
      // and must not use up the one slow hint of the session.
      if (!isBrowserOnline() || wasSlowNoticeShown()) return;
      markSlowNoticeShown();
      setSlow(true);
    };
    const connection = readConnection();
    const onConnectionChange = () => {
      if (isSlowConnection(readConnection())) flagSlow();
    };
    if (isSlowConnection(connection)) flagSlow();
    if (typeof connection?.addEventListener === 'function') {
      connection.addEventListener('change', onConnectionChange);
    }
    window.addEventListener(NETWORK_SLOW_EVENT, flagSlow);
    return () => {
      if (typeof connection?.removeEventListener === 'function') {
        connection.removeEventListener('change', onConnectionChange);
      }
      window.removeEventListener(NETWORK_SLOW_EVENT, flagSlow);
    };
  }, []);

  const dismissSlow = useCallback(() => setSlow(false), []);

  return { notice, slow, saveData, dismissSlow };
}
