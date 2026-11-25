import AvatarImage from '../AvatarImage';

// "Wer kommt": only people who opted in. Round photos (or an initial), name on hover,
// focus and tap. No numbers.
export default function Attendees({ attendees, hasMore }) {
  if (!attendees.length) return null;
  return (
    <section className="xmas-section xmas-attendees" data-testid="xmas-attendees">
      <h2>Wer kommt</h2>
      <p className="xmas-body">
        Diese Menschen freuen sich schon{hasMore ? ' – und weitere auch' : ''}.
      </p>
      <ul className="xmas-faces">
        {attendees.map((a, i) => (
          <li key={`${i}-${a.name}`}>
            <button type="button" className="xmas-face" data-name={a.name} aria-label={a.name}>
              {a.photoURL ? (
                <AvatarImage src={a.photoURL} alt="" className="xmas-face-img" />
              ) : (
                <span className="xmas-face-initial" aria-hidden="true">
                  {a.name.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
