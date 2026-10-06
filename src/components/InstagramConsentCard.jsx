import { useState } from 'react';
import './ProfileForm.css';

const SAVED_INDICATOR_TIMEOUT_MS = 3000;

/**
 * Profile setting: pre-ticks the Instagram consent box for new events.
 * Saves immediately, like the notification preferences next to it.
 */
export default function InstagramConsentCard({ checked, onSave }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleToggle = async (value) => {
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      await onSave({ instagramConsentDefault: value });
      setSaved(true);
      setTimeout(() => setSaved(false), SAVED_INDICATOR_TIMEOUT_MS);
    } catch (err) {
      console.error('Instagram consent default save failed:', err);
      setError('Einstellung konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-card" data-testid="instagram-consent-card">
      <h2 className="profile-card-title">Instagram</h2>
      <p className="profile-card-hint">
        Mit deiner Einwilligung dürfen wir deine Events auf dem Instagram-Kanal @tribevorarlberg_
        veröffentlichen und dein Instagram-Profil (siehe Feld „Instagram“ oben) verlinken.
        Änderungen werden sofort gespeichert.
      </p>
      <label className="notification-preference-label">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          disabled={saving}
          onChange={(event) => handleToggle(event.target.checked)}
          data-testid="instagram-consent-default-checkbox"
        />
        <span className="notification-preference-text">
          <span className="notification-preference-name">
            Instagram-Einwilligung standardmäßig für neue Events
          </span>
          <span className="notification-preference-description">
            Das Häkchen im Event-Formular ist dann von Anfang an gesetzt. Du kannst es pro Event
            jederzeit ändern.
          </span>
          {saved && (
            <span className="notification-preference-saved" data-testid="instagram-consent-saved">
              Gespeichert.
            </span>
          )}
        </span>
      </label>
      {error && (
        <p className="submit-error" data-testid="instagram-consent-error">
          {error}
        </p>
      )}
    </div>
  );
}
