import { Link, useLocation } from 'react-router-dom';
import { useChristmasPage } from '../hooks/useChristmasPage';
import { CHRISTMAS_PATH } from '../lib/christmasPage';
import { isWinterSeason } from './WinterTheme';
import './ChristmasFab.css';

// Kleiner Tannenbaum mit goldenem Stern und ein paar Kugeln, reines SVG.
function TreeIcon() {
  return (
    <svg
      className="christmas-fab-tree"
      width="26"
      height="28"
      viewBox="0 0 26 28"
      aria-hidden="true"
    >
      <path
        className="christmas-fab-star"
        d="M13 0l1.6 3.4 3.7.4-2.8 2.5.8 3.7L13 8.1 9.7 10l.8-3.7L7.7 3.8l3.7-.4z"
      />
      <path d="M13 6l7 8h-3.5l6 7H3.5l6-7H6z" fill="#e9f3ea" />
      <rect x="11" y="21" width="4" height="5" rx="1" fill="#c9a98a" />
      <circle cx="11" cy="13" r="1.1" fill="#b5473f" />
      <circle cx="16" cy="17" r="1.1" fill="#e5a72e" />
      <circle cx="9" cy="19" r="1.1" fill="#6b8fb5" />
    </svg>
  );
}

// Schwebender Button zur Weihnachtsfeier-Seite, über dem Feedback-Button.
// Nur in der Wintersaison und nur, solange die Seite veröffentlicht ist.
export default function ChristmasFab() {
  const { pathname } = useLocation();
  const { published } = useChristmasPage();
  const season = isWinterSeason(
    new Date(),
    typeof window === 'undefined' ? '' : window.location.search
  );

  if (!season || !published || pathname === CHRISTMAS_PATH) return null;

  return (
    <Link
      to={CHRISTMAS_PATH}
      className="christmas-fab"
      aria-label="Zur Tribe-Weihnachtsfeier"
      data-testid="christmas-fab"
    >
      <TreeIcon />
    </Link>
  );
}
