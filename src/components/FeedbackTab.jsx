import { useEffect, useState, useCallback } from 'react';
import { Check, Trash2, Archive, Inbox, X, Download } from 'lucide-react';
import { useFeedbackList } from '../hooks/useFeedbackList';
import './FeedbackTab.css';

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cleanUrlForDisplay(url) {
  if (!url) return '';
  return url.replace(/[?#].*$/, '');
}

function fileNameFromUrl(url) {
  if (!url) return 'screenshot.jpg';
  try {
    const withoutQuery = url.split('?')[0].split('#')[0];
    const lastSlash = withoutQuery.lastIndexOf('/');
    const name = lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery;
    return name || 'screenshot.jpg';
  } catch {
    return 'screenshot.jpg';
  }
}

const STATUS_LABELS = {
  new: 'Neu',
  read: 'Gelesen',
  archived: 'Archiviert',
};

export default function FeedbackTab() {
  const { items, loading, error, counts, markAsRead, archive, remove } = useFeedbackList();
  const [deletingId, setDeletingId] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    items
      .filter((item) => (item.status || 'new') === 'new')
      .forEach((item) => {
        markAsRead(item.id);
      });
  }, [items, markAsRead]);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (!lightbox) return undefined;
    const handleEscape = (e) => {
      if (e.key === 'Escape') closeLightbox();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [lightbox, closeLightbox]);

  const handleDelete = async (id) => {
    if (!window.confirm('Feedback wirklich löschen?')) return;
    setDeletingId(id);
    try {
      await remove(id);
      if (lightbox?.itemId === id) closeLightbox();
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="loading-spinner" data-testid="feedback-tab-loading"></div>;
  }

  if (error) {
    return (
      <div className="feedback-tab-error" role="alert" data-testid="feedback-tab-error">
        Feedback konnte nicht geladen werden: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="feedback-tab-empty" data-testid="feedback-tab-empty">
        <Inbox size={32} aria-hidden="true" />
        <h2>Noch kein Feedback</h2>
        <p>Sobald uns jemand Feedback schickt, erscheint es hier.</p>
      </div>
    );
  }

  return (
    <div className="feedback-tab" data-testid="feedback-tab">
      <ul className="feedback-tab-list">
        {items.map((item) => {
          const status = item.status || 'new';
          return (
            <li
              key={item.id}
              className={`feedback-item feedback-item--${status}`}
              data-testid="feedback-item"
              data-feedback-status={status}
            >
              <header className="feedback-item-header">
                <div className="feedback-item-meta">
                  <span className="feedback-item-status" data-testid="feedback-item-status">
                    {STATUS_LABELS[status] || status}
                  </span>
                  <time className="feedback-item-time">{formatDate(item.createdAt)}</time>
                </div>
                <div className="feedback-item-actions">
                  {status !== 'archived' && (
                    <button
                      type="button"
                      className="feedback-item-action"
                      onClick={() => archive(item.id)}
                      aria-label="Feedback archivieren"
                      data-testid="feedback-archive"
                    >
                      <Archive size={16} aria-hidden="true" />
                      <span>Archivieren</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="feedback-item-action feedback-item-action--danger"
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    aria-label="Feedback löschen"
                    data-testid="feedback-delete"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    <span>Löschen</span>
                  </button>
                </div>
              </header>

              <p className="feedback-item-description" data-testid="feedback-item-description">
                {item.description}
              </p>

              <dl className="feedback-item-details">
                {item.name && (
                  <div>
                    <dt>Name</dt>
                    <dd>{item.name}</dd>
                  </div>
                )}
                {item.email && (
                  <div>
                    <dt>E-Mail</dt>
                    <dd>
                      <a href={`mailto:${item.email}`}>{item.email}</a>
                    </dd>
                  </div>
                )}
                {item.pageUrl && (
                  <div>
                    <dt>Seite</dt>
                    <dd>
                      <a href={item.pageUrl} target="_blank" rel="noopener noreferrer">
                        {item.pageTitle || cleanUrlForDisplay(item.pageUrl)}
                      </a>
                    </dd>
                  </div>
                )}
                {item.userAgent && (
                  <div>
                    <dt>Browser</dt>
                    <dd className="feedback-item-useragent">{item.userAgent}</dd>
                  </div>
                )}
              </dl>

              {item.screenshotUrl ? (
                <button
                  type="button"
                  className="feedback-item-screenshot-thumb"
                  onClick={() => setLightbox({ itemId: item.id, url: item.screenshotUrl })}
                  aria-label="Screenshot vergrößern"
                  data-testid="feedback-screenshot-thumb"
                >
                  <img src={item.screenshotUrl} alt="Screenshot Vorschau" />
                  <span className="feedback-item-screenshot-hint">Screenshot ansehen</span>
                </button>
              ) : item.screenshotFailed ? (
                <div
                  className="feedback-item-screenshot-missing"
                  data-testid="feedback-screenshot-missing"
                >
                  Screenshot konnte nicht hochgeladen werden.
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <footer className="feedback-tab-summary" data-testid="feedback-tab-summary">
        <Check size={14} aria-hidden="true" />
        <span>
          {counts.total} Feedback · {counts.new} neu · {counts.read} gelesen · {counts.archived}{' '}
          archiviert
        </span>
      </footer>

      {lightbox && (
        <div
          className="modal-overlay fade-enter"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot vergrößert"
          data-testid="feedback-screenshot-lightbox"
        >
          <div
            className="modal-content feedback-lightbox"
            onClick={(e) => e.stopPropagation()}
            data-testid="feedback-screenshot-lightbox-content"
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeLightbox}
              aria-label="Schließen"
              data-testid="feedback-screenshot-close"
            >
              <X size={24} />
            </button>
            <img
              src={lightbox.url}
              alt="Screenshot in voller Größe"
              className="feedback-lightbox-image"
              data-testid="feedback-screenshot-lightbox-image"
            />
            <a
              href={lightbox.url}
              download={fileNameFromUrl(lightbox.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary feedback-lightbox-download"
              data-testid="feedback-screenshot-download"
            >
              <Download size={16} aria-hidden="true" />
              <span>Herunterladen</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
