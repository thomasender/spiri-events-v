import { useState } from 'react';
import {
  DONATION_AMOUNT_PRESETS,
  MIN_DONATION_AMOUNT,
  isValidDonationAmount,
  parseDonationAmount,
  startMonthlyDonation,
  startOneTimeDonation,
} from '../lib/mollieClient';
import './DonationBlock.css';

const FREQUENCIES = [
  { id: 'one-time', label: 'Einmalig' },
  { id: 'monthly', label: 'Monatlich' },
];

function formatAmount(value) {
  return value.toFixed(2).replace('.', ',');
}

function formatPreset(amount) {
  return Number.isInteger(amount) ? `${amount}` : formatAmount(amount);
}

export default function DonationBlock() {
  const [frequency, setFrequency] = useState('monthly');
  const [name, setName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const parsedAmount = parseDonationAmount(amountInput);
  const isAmountValid = isValidDonationAmount(parsedAmount);
  const isMonthly = frequency === 'monthly';

  function handlePresetClick(preset) {
    setAmountInput(formatPreset(preset));
    setError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isAmountValid) {
      setError(
        `Bitte einen Betrag von mindestens ${formatAmount(MIN_DONATION_AMOUNT)} € eingeben.`
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const start = isMonthly ? startMonthlyDonation : startOneTimeDonation;
      const { checkoutUrl } = await start(parsedAmount, name.trim() || null);
      window.location.assign(checkoutUrl);
    } catch (err) {
      setSubmitting(false);
      const message =
        err?.message ??
        'Die Spende konnte gerade nicht gestartet werden. Bitte versuche es erneut.';
      setError(message);
    }
  }

  return (
    <form className="donation-block" onSubmit={handleSubmit}>
      <p className="donation-intro">
        Unterstütze unsere ehrenamtliche Arbeit — Webhosting, Technik und Flyer — mit einer
        monatlichen oder einmaligen Spende in selbstgewählter Höhe.
      </p>

      <div className="donation-frequency-tabs" role="tablist" aria-label="Spendenfrequenz">
        {FREQUENCIES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            id={`donation-tab-${option.id}`}
            aria-selected={frequency === option.id}
            aria-controls="donation-tab-panel"
            className={`donation-frequency-tab ${frequency === option.id ? 'is-active' : ''}`}
            onClick={() => setFrequency(option.id)}
            disabled={submitting}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div id="donation-tab-panel" role="tabpanel" aria-labelledby={`donation-tab-${frequency}`}>
        <label className="donation-name-field">
          <span className="donation-name-label">Dein Name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Anna Musterfrau"
            maxLength={80}
            autoComplete="name"
            disabled={submitting}
          />
        </label>

        <label className="donation-amount-field">
          <span className="donation-amount-label">Betrag in Euro</span>
          <div className="donation-amount-input-wrapper">
            <input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setError(null);
              }}
              placeholder={formatAmount(MIN_DONATION_AMOUNT)}
              disabled={submitting}
              aria-invalid={amountInput.length > 0 && !isAmountValid}
              required
            />
            <span className="donation-amount-suffix">€</span>
          </div>
          <span className="donation-amount-hint">
            Mindestens {formatAmount(MIN_DONATION_AMOUNT)} €.
          </span>
        </label>

        <div className="donation-presets" aria-label="Vorschläge">
          {DONATION_AMOUNT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="donation-preset-chip"
              onClick={() => handlePresetClick(preset)}
              disabled={submitting}
            >
              {formatPreset(preset)} €
            </button>
          ))}
        </div>

        <button
          type="submit"
          className="btn btn-primary donation-submit"
          disabled={submitting || !isAmountValid}
        >
          {submitting
            ? 'Weiterleitung …'
            : isMonthly
              ? `${isAmountValid ? formatAmount(parsedAmount) : ''} € monatlich spenden`.trim()
              : `${isAmountValid ? formatAmount(parsedAmount) : ''} € spenden`.trim()}
        </button>
      </div>

      {error && (
        <p className="donation-error" role="alert">
          {error}
        </p>
      )}

      <p className="donation-disclaimer">
        {isMonthly
          ? 'Die Spende wird monatlich per SEPA-Lastschrift oder Kreditkarte abgebucht. Du kannst sie jederzeit über dein Mollie-Konto oder per E-Mail an '
          : 'Die Spende wird einmalig per SEPA-Lastschrift oder Kreditkarte abgebucht. Für Rückfragen schreibe an '}
        <a href="mailto:office@tribevorarlberg.at">office@tribevorarlberg.at</a>. Für eine
        offizielle Spendenquittung wende dich ebenfalls an{' '}
        <a href="mailto:office@tribevorarlberg.at">office@tribevorarlberg.at</a>.
      </p>
    </form>
  );
}
