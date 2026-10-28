import { useState } from 'react';
import { useDonors } from '../hooks/useDonors';
import { DEFAULT_REGION_ID } from '../utils/regions';
import './DonorsList.css';

function formatAmount(value) {
  if (value == null) return '';
  return value.toFixed(2).replace('.', ',');
}

function donorDisplayName(donor) {
  if (donor.name && donor.name.trim()) return donor.name;
  return 'Anonyme:r Spender:in';
}

// The public list shows newest donations first, a few at a time.
const PAGE_SIZE = 7;

// Firestore Timestamp, or nothing for old/hand-made entries (sorted last).
function createdAtMillis(donor) {
  const createdAt = donor.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  if (typeof createdAt.seconds === 'number') return createdAt.seconds * 1000;
  return 0;
}

function sortNewestFirst(donors) {
  return [...donors].sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
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
// (donor.amount === null → verborgen). The optional public comment is
// rendered as plain text. Shows the donors of one region (`regionId`).
export default function DonorsList({ regionId = DEFAULT_REGION_ID }) {
  const { donors, loading, error } = useDonors(regionId);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  const sorted = sortNewestFirst(donors);
  const visible = sorted.slice(0, visibleCount);
  const hasMore = sorted.length > visible.length;

  return (
    <div className="donors-list-wrapper">
      <ul className="donors-list" data-testid="donors-list">
        {visible.map((donor) => {
          const isAnonymous = !donor.name;
          const freq = frequencyLabel(donor.frequency);
          const amountText = donor.amount != null ? `${formatAmount(donor.amount)} €` : null;
          const showAmount = amountText != null;
          const comment = typeof donor.comment === 'string' ? donor.comment.trim() : '';
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
              {comment && (
                <p className="donors-list-comment" data-testid="donors-list-comment">
                  {comment}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <button
          type="button"
          className="btn btn-secondary donors-list-more"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          data-testid="donors-list-more"
        >
          Mehr laden
        </button>
      )}
    </div>
  );
}
