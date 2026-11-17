import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { savePreEntrySettings } from '../hooks/usePreEntries';
import {
  DEFAULT_TEMPLATES,
  PLACEHOLDERS,
  PRE_ENTRY_LIMITS,
  SUBJECT_MAX,
  TEMPLATE_KEYS,
  TEMPLATE_LABELS,
  TEMPLATE_TEXT_MAX,
  buildPreEntrySettingsDoc,
  unknownPlaceholders,
} from '../utils/preEntries';

const MODE_LABELS = {
  off: 'Aus',
  admins: 'Nur Super-Admins (zum Testen)',
  all: 'Alle Moderator:innen',
};

// Super-Admin settings of the pre-entries (Trello 6afb1116): flag, link validity,
// reminder after N days, automatic deletion, message templates. Stored in
// app_settings/preEntries; the server reads mode / days from there too.
export default function PreEntrySettingsSection({ settings }) {
  const { user } = useAuth();
  const [form, setForm] = useState(() => structuredClone(settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setTemplate = (key, part, value) =>
    setForm((prev) => ({
      ...prev,
      templates: { ...prev.templates, [key]: { ...prev.templates[key], [part]: value } },
    }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await savePreEntrySettings(buildPreEntrySettingsDoc(form), user?.uid);
      setMessage('Gespeichert.');
    } catch (err) {
      console.error('Saving pre-entry settings failed:', err);
      setMessage('Speichern hat nicht geklappt. Bitte prüfe die Werte.');
    } finally {
      setSaving(false);
    }
  };

  const number = (key, label, hint) => (
    <label className="pre-entry-contact-field">
      <span>{label}</span>
      <input
        type="number"
        min={PRE_ENTRY_LIMITS[key][0]}
        max={PRE_ENTRY_LIMITS[key][1]}
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
        data-testid={`pre-entry-setting-${key}`}
      />
      {hint && <span className="pre-entry-muted">{hint}</span>}
    </label>
  );

  return (
    <form className="pre-entry-settings" onSubmit={save} data-testid="pre-entry-settings">
      <h3>Einstellungen (nur Super-Admins)</h3>
      <label className="pre-entry-contact-field">
        <span>Funktion</span>
        <select
          value={form.mode}
          onChange={(e) => setField('mode', e.target.value)}
          data-testid="pre-entry-setting-mode"
        >
          {Object.entries(MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="pre-entry-settings-numbers">
        {number('validDays', 'Vorschau-Link gültig (Tage)')}
        {number('reminderDays', 'Erinnerung empfehlen nach (Tagen ohne Reaktion)')}
        {number(
          'autoDeleteDays',
          'Automatisch löschen nach Ablauf / Ablehnung (Tage)',
          '0 = nie automatisch löschen'
        )}
      </div>

      <details>
        <summary>Nachrichtenvorlagen</summary>
        <p className="pre-entry-muted">Platzhalter, die beim Kontaktieren ausgefüllt werden:</p>
        <ul className="pre-entry-placeholders">
          {PLACEHOLDERS.map((p) => (
            <li key={p.key} title={p.label}>
              <code>{`{${p.key}}`}</code>
            </li>
          ))}
        </ul>
        {TEMPLATE_KEYS.map((key) => {
          const t = form.templates[key];
          const unknown = unknownPlaceholders(`${t.subject} ${t.text}`);
          const isDefault =
            t.subject === DEFAULT_TEMPLATES[key].subject && t.text === DEFAULT_TEMPLATES[key].text;
          return (
            <fieldset key={key} className="pre-entry-settings-template">
              <legend>{TEMPLATE_LABELS[key]}</legend>
              <label className="pre-entry-contact-field">
                <span>Betreff (E-Mail)</span>
                <input
                  type="text"
                  maxLength={SUBJECT_MAX}
                  value={t.subject}
                  onChange={(e) => setTemplate(key, 'subject', e.target.value)}
                />
              </label>
              <label className="pre-entry-contact-field">
                <span>Text</span>
                <textarea
                  rows={8}
                  maxLength={TEMPLATE_TEXT_MAX}
                  value={t.text}
                  onChange={(e) => setTemplate(key, 'text', e.target.value)}
                  data-testid={`pre-entry-template-${key}`}
                />
              </label>
              {unknown.length > 0 && (
                <p className="pre-entry-error" role="alert">
                  Unbekannte Platzhalter: {unknown.map((u) => `{${u}}`).join(', ')}
                </p>
              )}
              {!isDefault && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      templates: { ...prev.templates, [key]: { ...DEFAULT_TEMPLATES[key] } },
                    }))
                  }
                >
                  Standardtext wiederherstellen
                </button>
              )}
            </fieldset>
          );
        })}
      </details>

      <div className="pre-entry-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Einstellungen speichern
        </button>
        {message && (
          <span className="pre-entry-muted" role="status">
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
