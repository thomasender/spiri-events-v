import { Hourglass, Wifi, WifiOff, X } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import './NetworkBanner.css';

const MESSAGES = {
  offline: 'Du bist gerade offline. Manche Inhalte sind vielleicht nicht aktuell.',
  slow: 'Deine Internetverbindung ist gerade langsam, das Laden kann etwas dauern.',
  reconnected: 'Wieder verbunden.',
};

const ICONS = { offline: WifiOff, slow: Hourglass, reconnected: Wifi };

// A slim strip under the header that tells visitors when they are offline or on
// a very slow connection, so a page that loads slowly does not look broken.
// Renders nothing otherwise (and never in the prerendered HTML).
export default function NetworkBanner() {
  const { notice, slow, dismissSlow } = useNetworkStatus();
  const kind = notice !== 'hidden' ? notice : slow ? 'slow' : null;
  if (!kind) return null;
  const Icon = ICONS[kind];

  return (
    <div
      className={`network-banner network-banner--${kind}`}
      role="status"
      aria-live="polite"
      data-testid="network-banner"
    >
      <Icon size={18} aria-hidden="true" />
      <p>{MESSAGES[kind]}</p>
      {kind === 'slow' && (
        <button
          type="button"
          className="network-banner-close"
          aria-label="Hinweis schließen"
          onClick={dismissSlow}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
