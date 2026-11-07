import { useState } from 'react';
import { useMyDmSetting } from '../../hooks/useMessenger';

// "Ich nehme Privatnachrichten an": my own switch, shared by the Postfach and the profile.
export default function DirectMessageSetting({
  className = 'messenger-setting',
  testId = 'messenger-allow',
}) {
  const { allow, loaded, update } = useMyDmSetting();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async (e) => {
    setError(false);
    setSaving(true);
    try {
      await update(e.target.checked);
    } catch (err) {
      console.error('Direct message setting save failed:', err);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <label className={className}>
        <input
          type="checkbox"
          checked={allow}
          disabled={!loaded || saving}
          onChange={toggle}
          data-testid={testId}
        />
        <span>Ich nehme Privatnachrichten an</span>
      </label>
      {error && (
        <p className="submit-error" data-testid={`${testId}-error`}>
          Einstellung konnte nicht gespeichert werden. Bitte versuche es erneut.
        </p>
      )}
    </>
  );
}
