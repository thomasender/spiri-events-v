import { Link } from 'react-router-dom';
import { useAboutPath } from '../hooks/useRegion';
import './DonateLink.css';

// "Den Kalender unterstützen": leads to the #spenden section of the visitor's
// own region's Über-uns page. Shared by the footer and the Über-uns page.
export default function DonateLink({ className = '', testId }) {
  const aboutPath = useAboutPath();
  return (
    <Link
      to={`${aboutPath}#spenden`}
      className={`donate-link ${className}`.trim()}
      data-testid={testId}
    >
      Den Kalender unterstützen
    </Link>
  );
}
