import { useState } from 'react';
import { Clock } from 'lucide-react';
import { previewBanner } from '../utils/preEntries';

// Countdown on the preview page of a pre-entered event (Trello 6afb1116): gentle
// pressure to react. From EXPIRING_SOON_DAYS days left on it is highlighted.
export default function PreEntryBanner({ expiresAtMs, now }) {
  const [mountedAt] = useState(() => Date.now());
  const banner = previewBanner(expiresAtMs, now ?? mountedAt);
  if (!banner) return null;
  return (
    <div
      className={`pre-entry-banner${banner.urgent ? ' pre-entry-banner--urgent' : ''}`}
      role="status"
      data-testid="pre-entry-banner"
      data-urgent={banner.urgent ? 'true' : 'false'}
    >
      <Clock size={18} aria-hidden="true" />
      <span>{banner.urgent && !banner.expired ? <strong>{banner.text}</strong> : banner.text}</span>
    </div>
  );
}
