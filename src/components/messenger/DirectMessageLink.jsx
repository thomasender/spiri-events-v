import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';

// "Nachricht senden" to a member, wherever a person is shown (directory card,
// public profile). Presentational: the page decides whether the messenger is
// open for the viewer and whether the person takes messages.
export default function DirectMessageLink({ uid, name, variant = 'card', accepts = true }) {
  if (!accepts) {
    return (
      <p className="dm-link-note" data-testid="dm-link-no-dm">
        {name} nimmt aktuell keine Privatnachrichten an.
      </p>
    );
  }
  return (
    <Link
      to={`/postfach/${uid}`}
      className={`btn btn-secondary dm-link dm-link--${variant}`}
      data-testid="dm-link"
      aria-label={`Nachricht an ${name} senden`}
    >
      <MessageCircle size={16} aria-hidden="true" />
      <span>{variant === 'card' ? 'Nachricht' : 'Nachricht senden'}</span>
    </Link>
  );
}
