import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Heart, Loader2, PenLine } from 'lucide-react';
import {
  SIGNATURE_MAX,
  SIGNATURE_MIN,
  moderatorOnboardingSteps,
} from '../utils/moderatorOnboardingText';
import './ModeratorOnboardingWizard.css';

function StepBody({ step }) {
  return (
    <>
      {step.paragraphs?.map((p) => (
        <p key={p} className="mod-onb-text">
          {p}
        </p>
      ))}
      {step.items && (
        <ul className="mod-onb-cards">
          {step.items.map((item) => (
            <li key={item.label} className="mod-onb-card">
              <strong>{item.label}</strong>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      )}
      {step.groups?.map((group) => (
        <section key={group.title} className={`mod-onb-group mod-onb-group--${group.tone}`}>
          <h3>{group.title}</h3>
          <ul>
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      {step.checklist && (
        <ul className="mod-onb-checklist">
          {step.checklist.map((item) => (
            <li key={item}>
              <Check size={16} aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {step.tips?.map((tip) => (
        <p key={tip.label} className="mod-onb-text">
          <strong>{tip.label}:</strong> {tip.text}
        </p>
      ))}
      {step.highlight && <p className="mod-onb-highlight">{step.highlight}</p>}
      {step.closing && <p className="mod-onb-text">{step.closing}</p>}
      {step.signoff && <p className="mod-onb-signoff">{step.signoff}</p>}
    </>
  );
}

// The onboarding of an invited Regions-Moderator:in in small steps: welcome, attitude,
// what is OK, the review checklist, a reminder, then the signature (typed name). Steps
// with a tick box only go on once it is ticked. `onSubmit({ consents, signatureName })`
// is the accept call; it may throw, the message comes from `errorMessage(err)`.
export default function ModeratorOnboardingWizard({ tribe, onSubmit, errorMessage }) {
  const steps = useMemo(() => moderatorOnboardingSteps(tribe), [tribe]);
  const [index, setIndex] = useState(0);
  const [consents, setConsents] = useState(() => new Set());
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);
  const mounted = useRef(false);

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const trimmedName = name.trim();
  const nameOk = trimmedName.length >= SIGNATURE_MIN && trimmedName.length <= SIGNATURE_MAX;
  const canGoOn = isLast ? nameOk && !submitting : !step.consent || consents.has(step.consent);

  // Screen readers should hear the new step.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    titleRef.current?.focus();
  }, [index]);

  const toggleConsent = (id) =>
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
      const ids = steps.map((s) => s.consent).filter(Boolean);
      await onSubmit({ consents: ids, signatureName: trimmedName });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const progress = Math.round(((index + 1) / steps.length) * 100);

  return (
    <form className="mod-onb" onSubmit={submit} data-testid="moderator-onboarding-wizard">
      <div className="mod-onb-progress" aria-hidden="true">
        <div className="mod-onb-progress-bar" style={{ width: `${progress}%` }} />
      </div>
      <ol className="mod-onb-steps" aria-label="Schritte">
        {steps.map((s, i) => (
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
        Schritt {index + 1} von {steps.length}
      </p>

      <h2 ref={titleRef} tabIndex={-1} className="mod-onb-title">
        {step.title}
      </h2>
      <div className="mod-onb-body" data-testid={`mod-onb-step-${step.id}`}>
        <StepBody step={step} />

        {step.consent && (
          <label className="mod-onb-consent">
            <input
              type="checkbox"
              checked={consents.has(step.consent)}
              onChange={() => toggleConsent(step.consent)}
            />
            <span>{step.consentLabel}</span>
          </label>
        )}

        {isLast && (
          <label className="mod-onb-signature">
            <span>
              <PenLine size={16} aria-hidden="true" /> Dein Name als Unterschrift
            </span>
            <input
              type="text"
              value={name}
              maxLength={SIGNATURE_MAX}
              autoComplete="name"
              placeholder="Vorname Nachname"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
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
                <Heart size={16} aria-hidden="true" />
              )}
              <span>{submitting ? 'Wird gespeichert …' : 'Unterschreiben und loslegen'}</span>
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
