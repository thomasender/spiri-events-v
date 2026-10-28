import { Suspense, useCallback, useEffect, useState } from 'react';
import { Paintbrush } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import lazyWithReload from '../../lib/lazyWithReload';
import './DesignModeLauncher.css';

const DesignModeApp = lazyWithReload(() => import('./DesignModeApp'));
const STORAGE_KEY = 'design-mode:on';
// Same breakpoint as the mobile header. The editor is still too buggy on phones.
const MOBILE_QUERY = '(max-width: 800px)';

const useIsMobile = () => {
  const [mobile, setMobile] = useState(() => !!window.matchMedia?.(MOBILE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia?.(MOBILE_QUERY);
    if (!mql) return undefined;
    const onChange = () => setMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return mobile;
};

const readOn = () => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

// Only admins ever render anything here. The editor itself is a lazy chunk, so
// the cost for everyone else is this one small component.
export default function DesignModeLauncher() {
  const { role, loading } = useAuth();
  const [on, setOn] = useState(readOn);
  const isMobile = useIsMobile();

  const set = useCallback((value) => {
    setOn(value);
    try {
      if (value) window.sessionStorage.setItem(STORAGE_KEY, '1');
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // sessionStorage unavailable: the mode just won't survive a reload.
    }
  }, []);

  // Losing the admin role (logout) must switch the mode off for good. Not while
  // the session is still loading: `role` is empty then, and a reload would
  // otherwise always end the mode.
  useEffect(() => {
    if (!loading && role !== 'Admin' && on) set(false);
  }, [loading, role, on, set]);

  if (loading || role !== 'Admin' || isMobile) return null;

  if (!on) {
    return (
      <button type="button" className="dm-launcher" data-design-ui onClick={() => set(true)}>
        <Paintbrush size={16} aria-hidden="true" />
        Design-Modus
      </button>
    );
  }

  return (
    <Suspense fallback={null}>
      <DesignModeApp onExit={() => set(false)} />
    </Suspense>
  );
}
