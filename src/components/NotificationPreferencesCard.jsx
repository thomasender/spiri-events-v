import { useState } from 'react';
import './ProfileForm.css';

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
    key: 'notifyOnSubmitted',
    label: 'Neue Event-Einreichungen',
    description:
      'Du erhältst eine E-Mail, sobald ein Mitglied ein neues Event zur Prüfung einreicht.',
    adminOnly: true,
  },
];

const SAVED_INDICATOR_TIMEOUT_MS = 3000;

export default function NotificationPreferencesCard({ preferences, isAdmin = false, onSave }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState(null);

  const visibleDefinitions = PREFERENCE_DEFINITIONS.filter(
    (definition) => !definition.adminOnly || isAdmin
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
