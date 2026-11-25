import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  setMyChristmasShowPublic,
  submitChristmasRegistration,
  withdrawChristmasRegistration,
} from '../../hooks/useChristmasPage';
import { useProfile } from '../../hooks/useProfile';
import { chatAuthorName, chatPhotoUrl } from '../../utils/chat';
import { MAX_BRING_ITEMS, MAX_PERSONS, validateRegistration } from '../../lib/christmasPage';

// Registration form of the Weihnachtsfeier: name, one contact, head count and the
// Mitbringliste (suggestions as chips plus free entries). `website` is a honeypot.
export default function ChristmasRegistrationForm({
  content,
  adminPreview,
  covered = [],
  user = null,
  myRegistration = null,
  seatsFull = false,
}) {
  const uid = user?.uid || null;
  const { profile } = useProfile(uid);
  const profileName = user ? chatAuthorName(profile, user) : '';
  const accountName =
    profileName && profileName !== 'Gast' ? profileName : user?.email?.split('@')[0] || '';
  const photoURL = user ? chatPhotoUrl(profile?.photoURL || user?.photoURL) : null;
  const coveredCount = (item) =>
    covered.find((c) => c.label.toLowerCase() === item.toLowerCase())?.count || 0;
  const [name, setName] = useState(accountName);
  const [contact, setContact] = useState(user?.email || '');
  const [persons, setPersons] = useState(1);
  const [bring, setBring] = useState([]);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState('');
  const [showPublic, setShowPublic] = useState(false);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | done | failed

  // The account may arrive after the first render: prefill, never overwrite typing.
  useEffect(() => {
    setName((n) => n || accountName);
    setContact((c) => c || user?.email || '');
  }, [accountName, user?.email]);

  const toggle = (item) =>
    setBring((prev) =>
      prev.includes(item)
        ? prev.filter((x) => x !== item)
        : prev.length < MAX_BRING_ITEMS
          ? [...prev, item]
          : prev
    );

  const addCustom = () => {
    const item = custom.trim().slice(0, 80);
    if (!item) return;
    if (
      !bring.some((x) => x.toLowerCase() === item.toLowerCase()) &&
      bring.length < MAX_BRING_ITEMS
    ) {
      setBring([...bring, item]);
    }
    setCustom('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (website) {
      setStatus('done'); // bot: pretend success, store nothing
      return;
    }
    const pending = custom.trim();
    const items = pending ? [...bring, pending] : bring;
    const result = validateRegistration({
      name,
      contact,
      persons,
      bring: items,
      note,
      showPublic: Boolean(uid) && showPublic,
      photoURL,
    });
    setErrors(result.errors);
    if (!result.ok) return;
    setStatus('sending');
    try {
      await submitChristmasRegistration(result.value, uid);
      setStatus('done');
    } catch (err) {
      console.warn('Weihnachtsfeier registration failed:', err?.code || err);
      setStatus('failed');
    }
  };

  const withdraw = async () => {
    if (!window.confirm('Deine Anmeldung wirklich zurückziehen?')) return;
    try {
      await withdrawChristmasRegistration(uid);
      setStatus('idle');
    } catch (err) {
      console.warn('Weihnachtsfeier withdraw failed:', err?.code || err);
      setStatus('failed');
    }
  };

  if (status !== 'done' && myRegistration) {
    return (
      <div className="xmas-form xmas-form--done" role="status" data-testid="xmas-registered">
        <span className="xmas-form-done-icon" aria-hidden="true">
          <Check size={28} />
        </span>
        <h3>Du bist angemeldet</h3>
        <p className="xmas-text">
          {myRegistration.persons} {myRegistration.persons === 1 ? 'Person' : 'Personen'}
          {myRegistration.bring?.length > 0 && ` · bringt mit: ${myRegistration.bring.join(', ')}`}
        </p>
        <p className="xmas-text">{content.thanksText}</p>
        <label className="xmas-check">
          <input
            type="checkbox"
            checked={myRegistration.showPublic === true}
            onChange={(e) =>
              setMyChristmasShowPublic(uid, e.target.checked).catch(() => setStatus('failed'))
            }
          />
          Andere dürfen sehen, dass ich komme
        </label>
        <button
          type="button"
          className="xmas-btn xmas-btn--ghost xmas-btn--small"
          onClick={withdraw}
        >
          Anmeldung zurückziehen
        </button>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="xmas-form xmas-form--done" role="status" data-testid="xmas-registration-done">
        <span className="xmas-form-done-icon" aria-hidden="true">
          <Check size={28} />
        </span>
        <h3>{content.thanksTitle}</h3>
        <p className="xmas-text">{content.thanksText}</p>
      </div>
    );
  }

  const customIdeas = bring.filter((x) => !content.bringIdeas.includes(x));

  return (
    <>
      {seatsFull && (
        <p className="xmas-full-note" data-testid="xmas-full-note">
          Aktuell sind alle Plätze vergeben. Du kannst dich trotzdem eintragen, wir melden uns,
          sobald etwas frei wird.
        </p>
      )}
      <form className="xmas-form" onSubmit={submit} noValidate data-testid="xmas-registration-form">
        {adminPreview && (
          <p className="xmas-form-hint">
            Admin-Vorschau: Anmeldungen, die du hier abschickst, erscheinen in der Verwaltung unter
            „Weihnachtsfeier“ und können dort gelöscht werden.
          </p>
        )}
        <div className="xmas-field">
          <label htmlFor="xmas-name">Name</label>
          <input
            id="xmas-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={100}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <span className="xmas-error">{errors.name}</span>}
        </div>
        <div className="xmas-field">
          <label htmlFor="xmas-contact">E-Mail oder Telefonnummer</label>
          <input
            id="xmas-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            autoComplete="email"
            maxLength={200}
            aria-invalid={Boolean(errors.contact)}
          />
          {errors.contact && <span className="xmas-error">{errors.contact}</span>}
        </div>
        <div className="xmas-field">
          <span className="xmas-label" id="xmas-persons-label">
            Wie viele Personen kommen?
          </span>
          <div className="xmas-stepper" role="group" aria-labelledby="xmas-persons-label">
            <button
              type="button"
              onClick={() => setPersons((p) => Math.max(1, p - 1))}
              aria-label="Eine Person weniger"
            >
              −
            </button>
            <output aria-live="polite" data-testid="xmas-persons">
              {persons}
            </output>
            <button
              type="button"
              onClick={() => setPersons((p) => Math.min(MAX_PERSONS, p + 1))}
              aria-label="Eine Person mehr"
            >
              +
            </button>
          </div>
          {errors.persons && <span className="xmas-error">{errors.persons}</span>}
        </div>

        <div className="xmas-field">
          <span className="xmas-label">Was bringst du zum Potpourri mit?</span>
          <div className="xmas-chips" role="group" aria-label="Vorschläge">
            {content.bringIdeas.map((item) => (
              <button
                key={item}
                type="button"
                className={`xmas-chip${bring.includes(item) ? ' xmas-chip--on' : ''}`}
                aria-pressed={bring.includes(item)}
                onClick={() => toggle(item)}
              >
                {bring.includes(item) && <Check size={14} aria-hidden="true" />}
                {item}
                {coveredCount(item) > 0 && (
                  <span className="xmas-chip-count">schon {coveredCount(item)}×</span>
                )}
              </button>
            ))}
            {customIdeas.map((item) => (
              <button
                key={item}
                type="button"
                className="xmas-chip xmas-chip--on"
                onClick={() => toggle(item)}
                aria-label={`${item} entfernen`}
              >
                {item}
                <X size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="xmas-add-row">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Eigene Idee, z. B. Linsensuppe"
              aria-label="Eigene Idee hinzufügen"
              maxLength={80}
            />
            <button type="button" className="xmas-btn xmas-btn--ghost" onClick={addCustom}>
              <Plus size={16} aria-hidden="true" /> Hinzufügen
            </button>
          </div>
        </div>

        <div className="xmas-field">
          <label htmlFor="xmas-note">Anmerkung (optional)</label>
          <textarea
            id="xmas-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="z. B. Unverträglichkeiten, Fragen …"
          />
        </div>

        <input
          className="xmas-honeypot"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />

        {uid && (
          <label className="xmas-check">
            <input
              type="checkbox"
              checked={showPublic}
              onChange={(e) => setShowPublic(e.target.checked)}
            />
            <span>
              Andere dürfen sehen, dass ich komme
              <small>
                Dein Profilbild (falls vorhanden) erscheint in „Wer kommt“, dein Name beim
                Drüberfahren.
              </small>
            </span>
          </label>
        )}

        <p className="xmas-form-privacy">
          Deine Angaben nutzen wir nur zur Organisation der Weihnachtsfeier.
        </p>
        {status === 'failed' && (
          <p className="xmas-error" role="alert">
            Die Anmeldung konnte nicht gespeichert werden. Bitte versuche es noch einmal.
          </p>
        )}
        <button type="submit" className="xmas-btn" disabled={status === 'sending'}>
          {status === 'sending' ? 'Wird gesendet …' : 'Verbindlich anmelden'}
        </button>
      </form>
    </>
  );
}
