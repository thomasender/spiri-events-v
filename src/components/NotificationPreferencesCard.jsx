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

// Push (docs/push-notifications.md): what this account gets pushed, on every
// device where push is switched on. `staffOnly` for Super-Admins and moderators.
const PUSH_DEFINITIONS = [
  {
    key: 'pushOnEventStatus',
    label: 'Event genehmigt oder abgelehnt',
    description: 'Ein kurzer Hinweis, sobald über dein eingereichtes Event entschieden ist.',
    staffOnly: false,
  },
  {
    key: 'pushOnReviewMessage',
    label: 'Rückfrage zu deinem Event',
    description: 'Ein kurzer Hinweis, wenn das Team eine Frage zu deinem Event hat.',
    staffOnly: false,
  },
];

const SAVED_INDICATOR_TIMEOUT_MS = 3000;

const PUSH_NOTES = {
  'ios-tab': {
    testId: 'push-ios-hint',
    text: 'Auf dem iPhone und iPad gibt es Push-Benachrichtigungen nur in der App: Tippe in Safari auf „Teilen“ und dann auf „Zum Home-Bildschirm“. Öffne die Seite danach über das neue Symbol und schalte Push hier ein.',
  },
  unsupported: {
    testId: 'push-unsupported',
    text: 'Dieser Browser kann leider keine Push-Benachrichtigungen empfangen.',
  },
  denied: {
    testId: 'push-denied',
    text: 'Du hast Benachrichtigungen für diese Seite blockiert. Erlaube sie in den Einstellungen deines Browsers, dann kannst du Push hier einschalten.',
  },
};

// `messengerAvailable` / `chatAvailable`: the chat switches only show while the
// Postfach / Event Chat is open for this person (dark launch: nothing changes
// while the flags are off).
// `push`: { state, enable, disable } of usePushDevice. The push part only shows
// once a VAPID key is configured (state !== 'disabled').
export default function NotificationPreferencesCard({
  preferences,
  isAdmin = false,
  isStaff = isAdmin,
  messengerAvailable = false,
  chatAvailable = false,
  push = null,
  onSave,
}) {
  const [saving, setSaving] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
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

  const pushState = push?.state ?? 'disabled';
  const pushDefinitions = PUSH_DEFINITIONS.filter((definition) => !definition.staffOnly || isStaff);
  const anyPushOn = pushDefinitions.some((definition) => preferences?.[definition.key] === true);
  // The topics follow the account (all devices): visible on an active device, and
  // wherever one is still on so it can be switched off from anywhere.
  const showPushTopics = pushState === 'active' || anyPushOn;

  const handleDeviceToggle = async (checked) => {
    setError('');
    setPushBusy(true);
    try {
      if (!checked) {
        await push.disable();
        return;
      }
      const result = await push.enable();
      // First device: switch every topic on, so turning push on is enough.
      if (result?.ok && !anyPushOn) {
        await onSave(
          Object.fromEntries(pushDefinitions.map((definition) => [definition.key, true]))
        );
      }
    } catch (err) {
      console.error('Push toggle failed:', err);
      setError('Push konnte nicht eingeschaltet werden. Bitte versuche es später erneut.');
    } finally {
      setPushBusy(false);
    }
  };

  const renderCheckbox = (definition) => {
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
            <span className="notification-preference-description">{definition.description}</span>
            {justSaved && (
              <span className="notification-preference-saved" data-testid="notification-pref-saved">
                Gespeichert.
              </span>
            )}
          </span>
        </label>
      </li>
    );
  };

  return (
    <div className="profile-card" data-testid="notification-preferences-card">
      <h2 className="profile-card-title">Benachrichtigungen</h2>
      <p className="profile-card-hint">
        Wähle, welche E-Mail-Benachrichtigungen du erhalten möchtest. Änderungen werden sofort
        gespeichert.
      </p>

      <ul className="notification-preferences-list">{visibleDefinitions.map(renderCheckbox)}</ul>

      {pushState !== 'disabled' && (
        <section className="notification-push" data-testid="notification-push">
          <h3 className="notification-push-title">Push-Benachrichtigungen</h3>
          <p className="profile-card-hint">
            Kurze Hinweise direkt auf dein Handy oder deinen Computer, auch wenn die Seite
            geschlossen ist. Deine E-Mails bleiben, wie oben eingestellt.
          </p>
          {PUSH_NOTES[pushState] && (
            <p className="notification-push-note" data-testid={PUSH_NOTES[pushState].testId}>
              {PUSH_NOTES[pushState].text}
            </p>
          )}
          <ul className="notification-preferences-list">
            {(pushState === 'available' || pushState === 'active') && (
              <li className="notification-preference-item">
                <label className="notification-preference-label">
                  <input
                    type="checkbox"
                    checked={pushState === 'active'}
                    disabled={pushBusy || saving}
                    onChange={(event) => handleDeviceToggle(event.target.checked)}
                    data-testid="push-device-toggle"
                  />
                  <span className="notification-preference-text">
                    <span className="notification-preference-name">Push auf diesem Gerät</span>
                    <span className="notification-preference-description">
                      Beim Einschalten fragt dein Browser, ob er Benachrichtigungen zeigen darf.
                    </span>
                  </span>
                </label>
              </li>
            )}
            {showPushTopics && pushDefinitions.map(renderCheckbox)}
          </ul>
        </section>
      )}

      {error && (
        <p className="submit-error" data-testid="notification-pref-error">
          {error}
        </p>
      )}
    </div>
  );
}
