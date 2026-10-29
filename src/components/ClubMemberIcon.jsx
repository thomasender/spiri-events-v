// The Vereinsmitglied symbol. The ONLY place that draws it: when the club logo
// arrives, replace this SVG (keep the props) and every badge follows.
export const CLUB_MEMBER_LABEL = 'Vereinsmitglied: unterstützt den Tribe';

const PETALS = [0, 72, 144, 216, 288];

export default function ClubMemberIcon({ className = '' }) {
  return (
    <svg
      className={`club-member-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {PETALS.map((deg) => (
        <ellipse
          key={deg}
          className="club-member-icon-petal"
          cx="12"
          cy="6.6"
          rx="3.6"
          ry="5"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
      <circle className="club-member-icon-center" cx="12" cy="12" r="3.2" />
    </svg>
  );
}
