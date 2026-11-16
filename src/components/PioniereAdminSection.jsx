import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Sprout } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useMembershipSettings } from '../hooks/useMembership';
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

// Super-Admins only (rendered by MembersTab): the flag app_settings/membership and
// the Statuten link of the Pioniere sign-up (Trello 6af620c0).
export default function PioniereAdminSection({ children }) {
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
      {children}
    </section>
  );
}
