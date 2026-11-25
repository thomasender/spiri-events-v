import { useState } from 'react';
import { Instagram, ChevronDown, Copy, Check, ExternalLink } from 'lucide-react';
import { callable } from '../lib/firebase';
import { copyToClipboard } from '../utils/copyToClipboard';
import { FIELD_LABELS } from '../utils/eventFieldLabels';

export function describeOutdatedFields(fields) {
  return fields.map((field) => FIELD_LABELS[field] || field).join(', ');
}

function OutdatedPost({ post, regionName }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const onCopy = async () => {
    setCopied(await copyToClipboard(post.suggestedCaption));
  };

  const onDone = async () => {
    setBusy(true);
    setError(null);
    try {
      await callable('markInstagramPostUpdated')({ eventId: post.eventId });
      // The live list drops the post on its own.
    } catch (err) {
      console.error('markInstagramPostUpdated failed:', err);
      setError('Das hat leider nicht geklappt. Bitte versuche es nochmal.');
      setBusy(false);
    }
  };

  return (
    <li className="review-instagram-post" data-testid={`review-instagram-post-${post.eventId}`}>
      <div className="review-instagram-post-head">
        <strong>{post.eventTitle || post.eventId}</strong>
        {regionName && <span className="review-instagram-region">{regionName}</span>}
      </div>
      <p className="review-instagram-fields" data-testid="review-instagram-fields">
        Geändert: {describeOutdatedFields(post.outdatedFields)}
      </p>
      <label className="review-instagram-caption-label" htmlFor={`caption-${post.eventId}`}>
        Neuer Text für Instagram
      </label>
      <textarea
        id={`caption-${post.eventId}`}
        className="review-instagram-caption"
        value={post.suggestedCaption}
        readOnly
        rows={6}
        data-testid="review-instagram-caption"
      />
      <p className="review-instagram-howto">
        So geht&apos;s: Text kopieren, den Post auf Instagram öffnen, oben rechts auf „…“ tippen,
        „Bearbeiten“ wählen, den Text ersetzen und speichern. Danach hier auf „Erledigt“ klicken.
        (Instagram bietet keinen Link direkt in den Bearbeiten-Modus.)
      </p>
      <div className="review-instagram-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCopy}
          data-testid="review-instagram-copy"
        >
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? 'Kopiert' : 'Text kopieren'}
        </button>
        {post.permalink && (
          <a
            className="btn btn-secondary"
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="review-instagram-open"
          >
            Post öffnen <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={onDone}
          disabled={busy}
          data-testid="review-instagram-done"
        >
          Erledigt
        </button>
      </div>
      {error && (
        <p className="review-approve-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Published Instagram posts whose event was edited afterwards. Instagram does not let the
 * platform change a caption, so the team pastes the new text by hand (Trello 6af4ca87).
 */
export default function ReviewInstagramOutdated({ posts, open, onToggle, nameOf, showRegion }) {
  return (
    <section
      className="review-section review-section--instagram"
      data-testid="review-section-instagram-outdated"
    >
      <div className="review-section-header">
        <h2 className="review-section-title">
          <button
            type="button"
            className="review-toggle"
            aria-expanded={open}
            aria-controls="review-section-instagram-outdated-body"
            onClick={onToggle}
            data-testid="review-toggle-instagram-outdated"
          >
            <Instagram size={20} aria-hidden="true" />
            <span>Instagram-Post anpassen</span>
            <span className="review-section-count" data-testid="review-section-instagram-count">
              {posts.length}
            </span>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={`review-toggle-chevron${open ? ' is-open' : ''}`}
            />
          </button>
        </h2>
        <p className="review-section-hint">
          Diese Events wurden geändert, nachdem sie auf Instagram gepostet wurden. Bitte den Text
          des Posts von Hand anpassen. Das Bild auf Instagram bleibt unverändert.
        </p>
      </div>
      <ul
        id="review-section-instagram-outdated-body"
        className="review-instagram-posts"
        hidden={!open}
      >
        {posts.map((post) => (
          <OutdatedPost
            key={post.id}
            post={post}
            regionName={showRegion && post.regionId ? nameOf(post.regionId) : null}
          />
        ))}
      </ul>
    </section>
  );
}
