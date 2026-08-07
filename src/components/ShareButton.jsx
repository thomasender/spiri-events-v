import { useEffect, useRef, useState } from 'react';
import {
  Share2,
  Facebook,
  Instagram,
  Send,
  MessageCircle,
  MessageSquare,
  Copy,
  Check,
  X,
} from 'lucide-react';
import './ShareButton.css';

const SHARE_URL_BUILDERS = {
  facebook: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  whatsapp: (url) => `https://wa.me/?text=${encodeURIComponent(url)}`,
  telegram: (url, title) =>
    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
};

const CHANNELS = [
  { id: 'facebook', label: 'Facebook', Icon: Facebook },
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { id: 'telegram', label: 'Telegram', Icon: Send },
  { id: 'signal', label: 'Signal', Icon: MessageSquare },
];

function buildShareUrl(event) {
  if (typeof window === 'undefined') return '';
  const slugOrId = event.slug || event.id;
  return `${window.location.origin}/event/${slugOrId}`;
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback.
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}

export default function ShareButton({ event }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const firstButtonRef = useRef(null);

  const shareUrl = buildShareUrl(event);
  const shareTitle = event.title || '';

  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    const triggerEl = triggerRef.current;
    const focusTimer = window.setTimeout(() => {
      firstButtonRef.current?.focus();
    }, 0);
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKey);
      triggerEl?.focus();
    };
  }, [isOpen]);

  const closeOverlay = () => setIsOpen(false);

  const handleChannelClick = async (channelId) => {
    const builder = SHARE_URL_BUILDERS[channelId];
    if (builder) {
      window.open(builder(shareUrl, shareTitle), '_blank', 'noopener,noreferrer');
      setIsOpen(false);
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url: shareUrl });
        setIsOpen(false);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') {
          return;
        }
      }
    }

    const copied = await copyToClipboard(shareUrl);
    setCopyState(copied ? 'copied' : 'error');
    window.setTimeout(() => setCopyState('idle'), 2000);
  };

  const handleCopyLink = async () => {
    const copied = await copyToClipboard(shareUrl);
    setCopyState(copied ? 'copied' : 'error');
    window.setTimeout(() => setCopyState('idle'), 2000);
  };

  const copyLabel =
    copyState === 'copied'
      ? 'Kopiert!'
      : copyState === 'error'
        ? 'Kopieren fehlgeschlagen'
        : 'Link kopieren';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="share-trigger"
        onClick={() => setIsOpen(true)}
        aria-label="Event teilen"
        data-testid="share-event-button"
      >
        <Share2 size={18} />
        <span>Teilen</span>
      </button>

      {isOpen && (
        <div className="share-overlay fade-enter" onClick={closeOverlay} role="presentation">
          <div
            className="share-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="share-close"
              onClick={closeOverlay}
              aria-label="Schließen"
            >
              <X size={20} />
            </button>

            <h2 id="share-dialog-title" className="share-dialog-title">
              Event teilen
            </h2>
            {shareTitle && <p className="share-dialog-subtitle">{shareTitle}</p>}

            <div className="share-channels" role="list">
              {CHANNELS.map((channel, index) => (
                <button
                  key={channel.id}
                  ref={index === 0 ? firstButtonRef : undefined}
                  type="button"
                  className={`share-channel share-channel--${channel.id}`}
                  onClick={() => handleChannelClick(channel.id)}
                  data-testid={`share-channel-${channel.id}`}
                  aria-label={`Über ${channel.label} teilen`}
                  title={channel.label}
                >
                  <channel.Icon size={20} aria-hidden="true" />
                </button>
              ))}
            </div>

            <button
              type="button"
              className="share-copy"
              onClick={handleCopyLink}
              data-testid="share-copy-link"
              aria-label="Link kopieren"
            >
              {copyState === 'copied' ? (
                <Check size={18} aria-hidden="true" />
              ) : (
                <Copy size={18} aria-hidden="true" />
              )}
              <span>{copyLabel}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
