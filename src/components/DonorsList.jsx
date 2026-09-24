import { useDonors } from '../hooks/useDonors';
import './DonorsList.css';

function formatAmount(value) {
  if (value == null) return '';
  return value.toFixed(2).replace('.', ',');
}

function donorDisplayName(donor) {
  if (donor.name && donor.name.trim()) return donor.name;
  return 'Anonyme:r Spender:in';
}

function frequencyLabel(frequency) {
  if (frequency === 'monthly') return 'monatlich';
  if (frequency === 'one-time') return 'einmalig';
  return null;
}

// Public list of donors rendered on the "Über uns" page. Privacy-friendly:
// a donor only appears here once an admin has explicitly opted them in,
// and the donor record itself controls whether the name is shown
// (donor.name === null → anonym) and whether the amount is shown
// (donor.amount === null → verborgen).
export default function DonorsList() {
  const { donors, loading, error } = useDonors();

  if (loading) {
    return (
      <div className="donors-list-loading" data-testid="donors-list-loading">
        Lade Spenderliste…
      </div>
    );
  }

  if (error) {
    return (
      <div className="donors-list-error" role="status" data-testid="donors-list-error">
        Spender:innen konnten gerade nicht geladen werden.
      </div>
    );
  }

  if (!donors.length) {
    return (
      <div className="donors-list-empty" data-testid="donors-list-empty">
        <p>
          Sobald die ersten Spender:innen namentlich oder anonym zugestimmt haben, erscheinen sie
          hier.
        </p>
      </div>
    );
  }

  return (
    <ul className="donors-list" data-testid="donors-list">
      {donors.map((donor) => {
        const isAnonymous = !donor.name;
        const freq = frequencyLabel(donor.frequency);
        const amountText = donor.amount != null ? `${formatAmount(donor.amount)} €` : null;
        const showAmount = amountText != null;
        return (
          <li
            key={donor.id}
            className="donors-list-item"
            data-testid="donors-list-item"
            data-anonymous={isAnonymous || undefined}
          >
            <span className="donors-list-name">{donorDisplayName(donor)}</span>
            {(showAmount || freq) && (
              <span className="donors-list-meta">
                {showAmount && (
                  <span className="donors-list-amount" data-testid="donors-list-amount">
                    {amountText}
                  </span>
                )}
                {freq && <span className="donors-list-frequency">{freq}</span>}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
