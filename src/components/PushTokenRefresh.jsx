import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { pushFeatureEnabled, refreshPushOnStart } from '../lib/pushMessaging';

/**
 * Renders nothing. On app start (and sign-in) refreshes this device's push token
 * (`lastSeenAt`, rotated tokens), only where push was switched on before. Inert
 * while no VAPID key is configured (docs/push-notifications.md).
 */
export default function PushTokenRefresh() {
  useEffect(() => {
    if (!pushFeatureEnabled()) return undefined;
    return onAuthStateChanged(auth, (user) => {
      if (user) refreshPushOnStart(user.uid);
    });
  }, []);
  return null;
}
