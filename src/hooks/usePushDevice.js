import { useCallback, useState } from 'react';
import {
  PUSH_VAPID_KEY,
  detectPushEnvironment,
  devicePushMarker,
  disablePushOnDevice,
  enablePushOnDevice,
  pushSupportState,
} from '../lib/pushMessaging';

/**
 * Push on THIS device for the profile (docs/push-notifications.md): its state
 * (see pushSupportState) and the two actions. `enable` must run from a click.
 */
export function usePushDevice(uid) {
  // Bumped after every action so the state is read from the browser again.
  const [, setVersion] = useState(0);
  const state = pushSupportState({
    vapidKey: PUSH_VAPID_KEY,
    env: detectPushEnvironment(),
    enabledOnDevice: Boolean(devicePushMarker(uid)),
  });

  const enable = useCallback(async () => {
    try {
      return await enablePushOnDevice(uid);
    } finally {
      setVersion((v) => v + 1);
    }
  }, [uid]);

  const disable = useCallback(async () => {
    try {
      await disablePushOnDevice(uid);
    } finally {
      setVersion((v) => v + 1);
    }
  }, [uid]);

  return { state, enable, disable };
}
