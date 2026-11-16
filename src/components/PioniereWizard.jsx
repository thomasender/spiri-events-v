import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CreditCard, Loader2 } from 'lucide-react';
import {
  MEMBERSHIP_AMOUNT_PRESETS,
  MEMBERSHIP_BENEFITS,
  MEMBERSHIP_PRIVACY_PATH,
  MEMBERSHIP_REQUIRED_CONSENTS,
  MEMBER_NAME_MAX,
  MIN_MEMBERSHIP_AMOUNT,
  canPayMembership,
  formatEuro,
  isValidMemberName,
  isValidMembershipAmount,
  parseMembershipAmount,
} from '../utils/clubMembership';
import './ModeratorOnboardingWizard.css';

const STEPS = [
  { id: 'vorteile', short: 'Vorteile', title: 'Werde Pionier:in' },
  { id: 'angaben', short: 'Deine Angaben', title: 'Name, E-Mail und Beitrag' },
  { id: 'abschluss', short: 'Abschluss', title: 'Fast geschafft' },
];

const CUSTOM = 'custom';

// The Pioniere sign-up in three steps (Trello 6af620c0): benefits, name / e-mail /
// monthly amount, the two required ticks and payment. Name and e-mail come from the
// account (the e-mail is fixed to it). `onSubmit({ amount, name, consents })` starts
// the Mollie checkout; it may throw, the message comes from `errorMessage(err)`.
export default function PioniereWizard({
  initialName = '',
  email = '',
  statutesUrl = '',
  isAdmin = false,
  onSubmit,
  errorMessage,
}) {
  const [index, setIndex] = useState(0);
  const [name, setName] = useState(initialName);
  const [choice, setChoice] = useState(String(MEMBERSHIP_AMOUNT_PRESETS[1]));
  const [customAmount, setCustomAmount] = useState('');
  const [consents, setConsents] = useState(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);
  const mounted = useRef(false);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const amount = choice === CUSTOM ? parseMembershipAmount(customAmount) : Number(choice);
  const amountOk = isValidMembershipAmount(amount);
  const nameOk = isValidMemberName(name);
  const allTicked = MEMBERSHIP_REQUIRED_CONSENTS.every((c) => consents.has(c));
  const payable = canPayMembership({ statutesUrl, isAdmin });

  let canGoOn = true;
  if (step.id === 'angaben') canGoOn = nameOk && amountOk;
  if (isLast) canGoOn = allTicked && payable && !submitting;

  // Screen readers should hear the new step.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    titleRef.current?.focus();
  }, [index]);

  const toggle = (id) =>
    setConsents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (e) => {
    e.preventDefault();
    if (!canGoOn) return;
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        amount,
        name: name.trim(),
        consents: [...MEMBERSHIP_REQUIRED_CONSENTS],
      });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const progress = Math.round(((index + 1) / STEPS.length) * 100);

  return (
    <form className="mod-onb" onSubmit={submit} data-testid="pioniere-wizard">
      <div className="mod-onb-progress" aria-hidden="true">
        <div className="mod-onb-progress-bar" style={{ width: `${progress}%` }} />
      </div>
      <ol className="mod-onb-steps" aria-label="Schritte">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={`mod-onb-step${i === index ? ' mod-onb-step--current' : ''}${i < index ? ' mod-onb-step--done' : ''}`}
            aria-current={i === index ? 'step' : undefined}
          >
            <span className="mod-onb-step-dot">
              {i < index ? <Check size={12} aria-hidden="true" /> : i + 1}
            </span>
            <span className="mod-onb-step-label">{s.short}</span>
          </li>
        ))}
      </ol>
      <p className="mod-onb-count">
        Schritt {index + 1} von {STEPS.length}
      </p>

      <h2 ref={titleRef} tabIndex={-1} className="mod-onb-title">
        {step.title}
      </h2>

      <div className="mod-onb-body" data-testid={`pioniere-step-${step.id}`}>
        {step.id === 'vorteile' && (
          <>
            <p className="mod-onb-text">
              Als Pionier:in wirst du Mitglied in unserem Verein und trägst den Tribe mit. Den
              monatlichen Beitrag wählst du selbst, ab {formatEuro(MIN_MEMBERSHIP_AMOUNT)}.
            </p>
            <ul className="mod-onb-checklist" data-testid="pioniere-benefits">
              {MEMBERSHIP_BENEFITS.map((b) => (
                <li key={b}>
                  <Check size={16} aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mod-onb-text">Du kannst jederzeit selbst in deinem Profil kündigen.</p>
          </>
        )}

        {step.id === 'angaben' && (
          <>
            <label className="mod-onb-signature">
              <span>Dein Name</span>
              <input
                type="text"
                value={name}
                maxLength={MEMBER_NAME_MAX}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
                data-testid="pioniere-name"
              />
            </label>
            <label className="mod-onb-signature">
              <span>Deine E-Mail-Adresse</span>
              <input type="email" value={email} readOnly data-testid="pioniere-email" />
            </label>
            <p className="pioniere-hint">
              Die E-Mail-Adresse kommt aus deinem Konto. Ändern kannst du sie in deinem{' '}
              <Link to="/profil">Profil</Link>.
            </p>

            <fieldset className="pioniere-amounts">
              <legend>Dein monatlicher Beitrag</legend>
              {MEMBERSHIP_AMOUNT_PRESETS.map((value) => (
                <label
                  key={value}
                  className={`pioniere-amount${choice === String(value) ? ' pioniere-amount--on' : ''}`}
                >
                  <input
                    type="radio"
                    name="pioniere-amount"
                    value={String(value)}
                    checked={choice === String(value)}
                    onChange={() => setChoice(String(value))}
                  />
                  <span>{formatEuro(value)}</span>
                </label>
              ))}
              <label
                className={`pioniere-amount${choice === CUSTOM ? ' pioniere-amount--on' : ''}`}
              >
                <input
                  type="radio"
                  name="pioniere-amount"
                  value={CUSTOM}
                  checked={choice === CUSTOM}
                  onChange={() => setChoice(CUSTOM)}
                />
                <span>Eigener Betrag</span>
              </label>
              {choice === CUSTOM && (
                <label className="pioniere-custom">
                  <span>Betrag in Euro (mindestens {formatEuro(MIN_MEMBERSHIP_AMOUNT)})</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customAmount}
                    placeholder="z. B. 7,50"
                    onChange={(e) => setCustomAmount(e.target.value)}
                    data-testid="pioniere-custom-amount"
                  />
                </label>
              )}
              {choice === CUSTOM && customAmount.trim() && !amountOk && (
                <p className="mod-onb-error" role="alert">
                  Bitte gib einen Betrag ab {formatEuro(MIN_MEMBERSHIP_AMOUNT)} ein.
                </p>
              )}
            </fieldset>
          </>
        )}

        {isLast && (
          <>
            <p className="mod-onb-text" data-testid="pioniere-summary">
              <strong>{name.trim()}</strong>, du wirst Pionier:in mit{' '}
              <strong>{formatEuro(amount)}</strong> im Monat. Die Zahlung läuft über Mollie, danach
              jeden Monat automatisch.
            </p>
            {!statutesUrl && (
              <p className="pioniere-placeholder" role="note" data-testid="pioniere-no-statutes">
                Platzhalter: Die Statuten sind noch nicht hinterlegt.{' '}
                {isAdmin
                  ? 'Als Admin kannst du die Anmeldung trotzdem testen.'
                  : 'Die Anmeldung ist bald möglich.'}
              </p>
            )}
            <label className="mod-onb-consent">
              <input
                type="checkbox"
                checked={consents.has('statuten')}
                onChange={() => toggle('statuten')}
                data-testid="pioniere-consent-statuten"
              />
              <span>
                Ich habe die{' '}
                {statutesUrl ? (
                  <a href={statutesUrl} target="_blank" rel="noopener noreferrer">
                    Statuten
                  </a>
                ) : (
                  'Statuten'
                )}{' '}
                gelesen und erkenne sie an.
              </span>
            </label>
            <label className="mod-onb-consent">
              <input
                type="checkbox"
                checked={consents.has('datenschutz')}
                onChange={() => toggle('datenschutz')}
                data-testid="pioniere-consent-datenschutz"
              />
              <span>
                Ich habe die{' '}
                <a href={MEMBERSHIP_PRIVACY_PATH} target="_blank" rel="noopener noreferrer">
                  Datenschutzinformation für Vereinsmitglieder
                </a>{' '}
                gelesen.
              </span>
            </label>
          </>
        )}
      </div>

      {error && (
        <p className="mod-onb-error" role="alert">
          {error}
        </p>
      )}

      <div className="mod-onb-actions">
        {index > 0 ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIndex((i) => i - 1)}
            disabled={submitting}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Zurück</span>
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="btn btn-primary" disabled={!canGoOn}>
          {isLast ? (
            <>
              {submitting ? (
                <Loader2 size={16} className="mod-onb-spin" aria-hidden="true" />
              ) : (
                <CreditCard size={16} aria-hidden="true" />
              )}
              <span>{submitting ? 'Einen Moment …' : 'Mitglied werden und bezahlen'}</span>
            </>
          ) : (
            <>
              <span>{index === 0 ? "Los geht's" : 'Weiter'}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
