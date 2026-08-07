import { useEffect, useState } from 'react';
import { Check, Trash2, Archive, Inbox, MessageSquare } from 'lucide-react';
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

const STATUS_LABELS = {
  new: 'Neu',
  read: 'Gelesen',
  archived: 'Archiviert',
};

export default function FeedbackTab() {
  const { items, loading, error, counts, markAsRead, archive, remove } = useFeedbackList();
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    items
      .filter((item) => (item.status || 'new') === 'new')
      .forEach((item) => {
        markAsRead(item.id);
      });
  }, [items, markAsRead]);

  const handleDelete = async (id) => {
    if (!window.confirm('Feedback wirklich löschen?')) return;
    setDeletingId(id);
    try {
      await remove(id);
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
                        {item.pageTitle || item.pageUrl}
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

              {item.screenshotUrl && (
                <a
                  href={item.screenshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="feedback-item-screenshot-link"
                  data-testid="feedback-screenshot-link"
                >
                  Screenshot ansehen
                </a>
              )}
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
    </div>
  );
}
