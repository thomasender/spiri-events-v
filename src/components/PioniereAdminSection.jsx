import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Sprout, UserPlus } from 'lucide-react';
import { callable, db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useMembershipSettings } from '../hooks/useMembership';
import {
  MIN_MEMBERSHIP_AMOUNT,
  formatEuro,
  isValidMemberName,
  isValidMembershipAmount,
  parseMembershipAmount,
} from '../utils/clubMembership';
import './ChatTab.css';
import './PioniereAdminSection.css';

const MODES = [
  { id: 'off', label: 'Aus', help: 'Die Anmeldung unter /pioniere ist für niemanden da.' },
  {
    id: 'admins',
    label: 'Nur Admins (Test)',
    help: 'Nur Super-Admins sehen die Anmeldung (zum Testen).',
  },
  { id: 'all', label: 'Für alle', help: 'Alle Besucher:innen; zum Anmelden braucht es ein Konto.' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function adminCreateResultMessage(result, name) {
  if (result.alreadyMember) return `${name} ist bereits Vereinsmitglied. Nichts geändert.`;
  const account = result.createdAccount
    ? 'Neues Konto angelegt'
    : 'Bestehendes Konto verknüpft (kein zweites Konto angelegt)';
  const mail = result.emailSent
    ? 'Einladungsmail ist verschickt.'
    : 'Die Einladungsmail wurde NICHT verschickt.';
  return `${name} ist jetzt Vereinsmitglied. ${account}. ${mail}`;
}

function adminCreateErrorMessage(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  if (code === 'invalid-argument') return 'Bitte Name, E-Mail und Betrag (ab 3 €) prüfen.';
  if (code === 'permission-denied') return 'Nur Super-Admins können Mitglieder anlegen.';
  return 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
}

// "Mitglied anlegen" for members from a paper form (Trello 6af620c0): the account
// is looked up by e-mail (or created) by adminCreateClubMember.
export function PioniereAddMemberForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const parsedAmount = amount.trim() ? parseMembershipAmount(amount) : null;
  const amountOk = parsedAmount === null || isValidMembershipAmount(parsedAmount);
  const valid = isValidMemberName(name) && EMAIL_PATTERN.test(email.trim()) && amountOk;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await callable('adminCreateClubMember')({
        name: name.trim(),
        email: email.trim(),
        amount: parsedAmount,
        sendEmail,
      });
      setMessage(adminCreateResultMessage(result.data, name.trim()));
      setName('');
      setEmail('');
      setAmount('');
      onCreated?.();
    } catch (err) {
      console.error('adminCreateClubMember failed:', err);
      setMessage(adminCreateErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pioniere-admin-add">
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="pioniere-admin-add-toggle"
      >
        <UserPlus size={16} aria-hidden="true" />
        <span>Mitglied anlegen</span>
      </button>
      {open && (
        <form className="pioniere-admin-create" onSubmit={submit} data-testid="pioniere-admin-add">
          <p className="chat-tab-hint">
            Für Beitritte über das Papierformular. Gibt es schon ein Konto mit dieser E-Mail, wird
            es verknüpft, sonst wird eines angelegt und die Person bekommt eine Einladungsmail zum
            Passwort festlegen (mit Link zum Datenschutz-Abschnitt für Vereinsmitglieder).
          </p>
          <label>
            <span>Name</span>
            <input
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              data-testid="pioniere-admin-add-name"
            />
          </label>
          <label>
            <span>E-Mail-Adresse</span>
            <input
              type="email"
              value={email}
              maxLength={200}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="pioniere-admin-add-email"
            />
          </label>
          <label>
            <span>
              Monatsbeitrag laut Formular (optional, ab {formatEuro(MIN_MEMBERSHIP_AMOUNT)})
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="pioniere-admin-add-amount"
            />
          </label>
          <label className="pioniere-admin-check">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            <span>Einladungsmail senden</span>
          </label>
          <button type="submit" className="btn btn-secondary" disabled={!valid || busy}>
            {busy ? 'Wird angelegt …' : 'Als Vereinsmitglied anlegen'}
          </button>
        </form>
      )}
      {message && (
        <p className="chat-tab-hint" role="status" data-testid="pioniere-admin-add-result">
          {message}
        </p>
      )}
    </div>
  );
}

// Super-Admins only (rendered by MembersTab): the flag app_settings/membership,
// the Statuten link of the Pioniere sign-up and "Mitglied anlegen" (Trello 6af620c0).
export default function PioniereAdminSection({ onMemberCreated }) {
  const { user } = useAuth();
  const settings = useMembershipSettings();
  const [statutesUrl, setStatutesUrl] = useState('');
  const [statutesVersion, setStatutesVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (settings.loading) return;
    setStatutesUrl(settings.statutesUrl);
    setStatutesVersion(settings.statutesVersion);
  }, [settings.loading, settings.statutesUrl, settings.statutesVersion]);

  const save = async (patch) => {
    setBusy(true);
    setMessage('');
    try {
      await setDoc(
        doc(db, 'app_settings', 'membership'),
        {
          mode: settings.mode,
          ...patch,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid ?? null,
        },
        { merge: true }
      );
      setMessage('Gespeichert.');
    } catch (err) {
      console.error('Saving app_settings/membership failed:', err);
      setMessage('Das hat nicht geklappt. Ist der Link eine https-Adresse?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pioniere-admin" data-testid="pioniere-admin">
      <h3 className="pioniere-admin-title">
        <Sprout size={18} aria-hidden="true" /> Vereinsmitgliedschaft „Pioniere“
      </h3>
      <div className="chat-tab-modes" role="radiogroup" aria-label="Sichtbarkeit der Anmeldung">
        {MODES.map((m) => (
          <label
            key={m.id}
            className={`chat-tab-mode${settings.mode === m.id ? ' chat-tab-mode--on' : ''}`}
          >
            <input
              type="radio"
              name="membership-mode"
              value={m.id}
              checked={settings.mode === m.id}
              disabled={busy || settings.loading}
              onChange={() => save({ mode: m.id })}
            />
            <span className="chat-tab-mode-label">{m.label}</span>
            <span className="chat-tab-mode-help">{m.help}</span>
          </label>
        ))}
      </div>
      <form
        className="pioniere-admin-statutes"
        onSubmit={(e) => {
          e.preventDefault();
          save({ statutesUrl: statutesUrl.trim(), statutesVersion: statutesVersion.trim() });
        }}
      >
        <label>
          <span>Link zu den Statuten (PDF oder Seite, https://…)</span>
          <input
            type="url"
            value={statutesUrl}
            maxLength={500}
            placeholder="https://…"
            onChange={(e) => setStatutesUrl(e.target.value)}
            data-testid="pioniere-admin-statutes-url"
          />
        </label>
        <label>
          <span>Fassung der Statuten (z. B. Datum), wird bei der Anmeldung gespeichert</span>
          <input
            type="text"
            value={statutesVersion}
            maxLength={40}
            onChange={(e) => setStatutesVersion(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-secondary" disabled={busy || settings.loading}>
          Statuten speichern
        </button>
      </form>
      {!settings.loading && !settings.statutesUrl && (
        <p className="pioniere-admin-warning" role="note">
          Noch kein Statuten-Link: Die Anmeldung zeigt einen Platzhalter, bezahlen können nur
          Super-Admins (zum Testen).
        </p>
      )}
      {message && (
        <p className="chat-tab-hint" role="status">
          {message}
        </p>
      )}
      <PioniereAddMemberForm onCreated={onMemberCreated} />
    </section>
  );
}
