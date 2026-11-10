import { useCallback, useState } from 'react';

const STORAGE_PREFIX = 'nav-hint-seen:';

function wasSeen(key) {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === '1';
  } catch {
    // Storage blocked (private mode): do not nag on every page view.
    return true;
  }
}

/**
 * One-time highlight for a navigation link. `active` stays true until `dismiss`
 * is called (on the first click), then never again on this device.
 */
export function useNavHint(key) {
  const [seen, setSeen] = useState(() => wasSeen(key));

  const dismiss = useCallback(() => {
    setSeen(true);
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, '1');
    } catch {
      // ignore: the hint is only hidden for this session then
    }
  }, [key]);

  return { active: !seen, dismiss };
}
