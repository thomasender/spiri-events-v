import { useState } from 'react';
import { DONATION_AMOUNTS, startDonation } from '../lib/mollieClient';
import './DonationBlock.css';

function formatAmount(value) {
  return value.toFixed(2).replace('.', ',');
}

export default function DonationBlock() {
  const [name, setName] = useState('');
  const [loadingAmount, setLoadingAmount] = useState(null);
  const [error, setError] = useState(null);

  async function handleDonate(amount) {
    setError(null);
    setLoadingAmount(amount);
    try {
      const { checkoutUrl } = await startDonation(amount, name.trim() || null);
      window.location.assign(checkoutUrl);
    } catch (err) {
      setLoadingAmount(null);
      const message =
        err?.message ??
        'Die Spende konnte gerade nicht gestartet werden. Bitte versuche es erneut.';
      setError(message);
    }
  }

  return (
    <div className="donation-block">
      <p className="donation-intro">
        Wähle einen monatlichen Betrag und unterstütze unsere ehrenamtliche Arbeit — Webhosting,
        Technik und Flyer.
      </p>

      <label className="donation-name-field">
        <span className="donation-name-label">Dein Name (optional)</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Anna Musterfrau"
          maxLength={80}
          autoComplete="name"
          disabled={loadingAmount !== null}
        />
      </label>

      <div className="donation-amounts" role="group" aria-label="Spendenbetrag auswählen">
        {DONATION_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            className="btn btn-primary donation-amount-button"
            onClick={() => handleDonate(amount)}
            disabled={loadingAmount !== null}
            aria-busy={loadingAmount === amount}
          >
            {loadingAmount === amount ? 'Weiterleitung …' : `${formatAmount(amount)} € / Monat`}
          </button>
        ))}
      </div>

      {error && (
        <p className="donation-error" role="alert">
          {error}
        </p>
      )}

      <p className="donation-disclaimer">
        Die Spende wird monatlich per SEPA-Lastschrift oder Kreditkarte abgebucht. Du kannst sie
        jederzeit über dein Mollie-Konto oder per E-Mail an{' '}
        <a href="mailto:office@tribevorarlberg.at">office@tribevorarlberg.at</a> beenden. Für eine
        offizielle Spendenquittung wende dich an{' '}
        <a href="mailto:office@tribevorarlberg.at">office@tribevorarlberg.at</a>.
      </p>
    </div>
  );
}
