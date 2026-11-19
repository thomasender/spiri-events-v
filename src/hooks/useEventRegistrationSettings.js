import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Live view of the admin switch app_settings/eventRegistration { enabled }.
// A missing doc, a read error or anything but `true` means off (and while
// loading it is off too, so the button never flashes up).
export function useEventRegistrationEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'app_settings', 'eventRegistration'),
      (snap) => setEnabled(snap.exists() && snap.data().enabled === true),
      () => setEnabled(false)
    );
  }, []);

  return enabled;
}
