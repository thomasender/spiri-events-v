import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Resets the window scroll position to the top on every client-side
// navigation, so users always land at the top of the new page instead of
// staying wherever the previous page happened to be scrolled to (notably
// mobile, where the viewport keeps the previous offset after a route
// change).
//
// Hash navigations (e.g. `#event-messages`) are left to the page itself
// so in-page anchors continue to work.
export default function ScrollToTop() {
  const { pathname, hash, key } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash, key]);

  return null;
}
