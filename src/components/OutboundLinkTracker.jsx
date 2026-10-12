import { useEffect } from 'react';
import { EVENTS, trackEvent } from '../lib/analytics';
import { externalDomain } from '../lib/analyticsEvents';

// Mount once (e.g. in App.jsx). One delegated click listener reports every
// link that leaves the site, with the target domain only (no path or query).
export default function OutboundLinkTracker() {
  useEffect(() => {
    const onClick = (e) => {
      const anchor = e.target instanceof Element ? e.target.closest('a') : null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      const domain = href ? externalDomain(href) : null;
      if (domain) trackEvent(EVENTS.OUTBOUND_CLICK, { link_domain: domain });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
