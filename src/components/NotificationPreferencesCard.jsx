import { useState } from 'react';
import './ProfileForm.css';
import { CANDLE_ROOM_NAME } from '../utils/candleRoom';

const PREFERENCE_DEFINITIONS = [
  {
    key: 'notifyOnChangesRequested',
    label: 'Änderungen gewünscht',
    description:
      'Du erhältst eine E-Mail, wenn ein Admin Feedback zu einem deiner Events hinterlässt.',
    adminOnly: false,
  },
  {
    key: 'notifyOnPublished',
    label: 'Event veröffentlicht',
    description:
      'Du erhältst eine E-Mail, sobald dein Event freigegeben und öffentlich sichtbar ist.',
    adminOnly: false,
  },
  {
    key: 'notifyOnDeleted',
    label: 'Event gelöscht',
    description: 'Du erhältst eine E-Mail, wenn dein Event in den Papierkorb verschoben wird.',
    adminOnly: false,
  },
  {
    key: 'notifyOnFavoriteCancelled',
    label: 'Favorit abgesagt',
    description:
      'Du erhältst eine E-Mail, wenn ein Event oder ein Termin, den du als Favorit gespeichert hast, abgesagt wird.',
    adminOnly: false,
  },
  {
    key: 'notifyOnDirectMessage',
    label: 'Neue Privatnachricht',
    description:
      'Du erhältst eine E-Mail mit einem kurzen Auszug, wenn dir jemand im Postfach schreibt (höchstens eine pro Unterhaltung und Stunde).',
    adminOnly: false,
    feature: 'messenger',
  },
  {
    key: 'notifyOnEventChat',
    label: `${CANDLE_ROOM_NAME} deiner Veranstaltungen`,
    description: `Du erhältst eine E-Mail mit einem kurzen Auszug, wenn jemand im ${CANDLE_ROOM_NAME} einer Veranstaltung schreibt, die du erstellt hast (höchstens eine pro Tag).`,
    adminOnly: false,
    feature: 'chat',
  },
  {
    key: 'notifyOnSubmitted',
    label: 'Neue Event-Einreichungen',
    description:
      'Du erhältst eine E-Mail, sobald ein Mitglied ein neues Event zur Prüfung einreicht.',
    adminOnly: true,
  },
  {
    key: 'notifyOnContactMessage',
    label: 'Kontakt-Nachrichten',
    description:
      'Du erhältst eine E-Mail, wenn jemand eine Nachricht über „Sag Hallo" oder „Kontakt mit uns auf" schickt.',
    adminOnly: true,
  },
  {
    key: 'notifyNewsletter',
    label: 'Newsletter abonnieren',
    description:
      'Du erhältst gelegentlich eine E-Mail mit Neuigkeiten und Updates rund um die Plattform.',
    adminOnly: false,
  },
];

const SAVED_INDICATOR_TIMEOUT_MS = 3000;

// `messengerAvailable` / `chatAvailable`: the chat switches only show while the
// Postfach / Event Chat is open for this person (dark launch: nothing changes
// while the flags are off).
export default function NotificationPreferencesCard({
  preferences,
  isAdmin = false,
  messengerAvailable = false,
  chatAvailable = false,
  onSave,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState(null);

  const features = { messenger: messengerAvailable, chat: chatAvailable };
  const visibleDefinitions = PREFERENCE_DEFINITIONS.filter(
    (definition) =>
      (!definition.adminOnly || isAdmin) && (!definition.feature || features[definition.feature])
  );

  const handleToggle = async (key, value) => {
    setError('');
    setSavedKey(null);
    setSaving(true);
    try {
      await onSave({ [key]: value });
      setSavedKey(key);
      setTimeout(() => {
        setSavedKey((current) => (current === key ? null : current));
      }, SAVED_INDICATOR_TIMEOUT_MS);
    } catch (err) {
      console.error('Notification preference save failed:', err);
      setError('Einstellung konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-card" data-testid="notification-preferences-card">
      <h2 className="profile-card-title">Benachrichtigungen</h2>
      <p className="profile-card-hint">
        Wähle, welche E-Mail-Benachrichtigungen du erhalten möchtest. Änderungen werden sofort
        gespeichert.
      </p>

      <ul className="notification-preferences-list">
        {visibleDefinitions.map((definition) => {
          const checked = Boolean(preferences?.[definition.key]);
          const justSaved = savedKey === definition.key;
          return (
            <li key={definition.key} className="notification-preference-item">
              <label className="notification-preference-label">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={(event) => handleToggle(definition.key, event.target.checked)}
                  data-testid={`notification-pref-${definition.key}`}
                />
                <span className="notification-preference-text">
                  <span className="notification-preference-name">{definition.label}</span>
                  <span className="notification-preference-description">
                    {definition.description}
                  </span>
                  {justSaved && (
                    <span
                      className="notification-preference-saved"
                      data-testid="notification-pref-saved"
                    >
                      Gespeichert.
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="submit-error" data-testid="notification-pref-error">
          {error}
        </p>
      )}
    </div>
  );
}
