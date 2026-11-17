import { useEffect, useState } from 'react';
import { Copy, Mail, MessageCircle, Send } from 'lucide-react';
import { preEntryAdmin } from '../hooks/usePreEntries';
import { copyToClipboard } from '../utils/copyToClipboard';
import {
  SUBJECT_MAX,
  TEMPLATE_KEYS,
  TEMPLATE_LABELS,
  TEMPLATE_TEXT_MAX,
  buildTemplateValues,
  fillTemplate,
  linkKindForTemplate,
  preEntryErrorMessage,
  suggestedTemplate,
  whatsappLink,
} from '../utils/preEntries';

// "Kontaktieren" of one pre-entry (Trello 6afb1116): pick a template and a channel,
// the server issues a fresh link (only its hash is stored), the text is filled in
// and stays editable. E-Mail goes out through the system, WhatsApp opens wa.me,
// "Andere" copies the text; every attempt ends up in the contact log.
export default function PreEntryContactPanel({
  row,
  settings,
  now,
  moderatorName,
  onDone,
  onCancel,
}) {
  const contact = row.contact ?? {};
  const [template, setTemplate] = useState(() => suggestedTemplate(row, settings, now));
  const [channel, setChannel] = useState(() =>
    contact.email ? 'email' : contact.phone ? 'whatsapp' : 'other'
  );
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [externalOpened, setExternalOpened] = useState(false);

  // A new template = a new link and a freshly filled text.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError('');
      setPrepared(false);
      setExternalOpened(false);
      try {
        const kind = linkKindForTemplate(template);
        const issued = await preEntryAdmin('issueLink', { eventId: row.eventId, kind });
        if (cancelled) return;
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const values = buildTemplateValues({
          row: { ...row, expiresAtMs: issued.expiresAtMs ?? row.expiresAtMs },
          links: {
            preview: kind === 'preview' ? issued.url : '',
            takeover: kind === 'takeover' ? issued.url : '',
            public: row.event?.slug ? `${origin}/event/${row.event.slug}` : '',
          },
          moderatorName,
          now,
          origin,
        });
        const tpl = settings.templates[template];
        setSubject(fillTemplate(tpl.subject, values));
        setText(fillTemplate(tpl.text, values));
        setPrepared(true);
      } catch (err) {
        if (!cancelled) setError(preEntryErrorMessage(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The row object changes with every reload of the list; the template is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, row.eventId]);

  const logContact = async (usedChannel) => {
    await preEntryAdmin('logContact', { eventId: row.eventId, channel: usedChannel, template });
  };

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      if (channel === 'email') {
        await preEntryAdmin('sendEmail', { eventId: row.eventId, subject, text, template });
      } else {
        await logContact(channel);
      }
      onDone?.();
    } catch (err) {
      setError(preEntryErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const waLink = whatsappLink(contact.phone, text);

  const copy = async () => {
    const ok = await copyToClipboard(channel === 'email' ? `${subject}\n\n${text}` : text);
    setCopied(ok);
    setExternalOpened(true);
  };

  return (
    <section className="pre-entry-contact" aria-label="Veranstalter kontaktieren">
      <div className="pre-entry-contact-row">
        <label>
          <span>Vorlage</span>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            data-testid="pre-entry-template"
          >
            {TEMPLATE_KEYS.map((key) => (
              <option key={key} value={key}>
                {TEMPLATE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Kontaktweg</span>
          <select
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
              setExternalOpened(false);
            }}
            data-testid="pre-entry-channel"
          >
            <option value="email" disabled={!contact.email}>
              E-Mail {contact.email ? `(${contact.email})` : '(keine Adresse)'}
            </option>
            <option value="whatsapp" disabled={!contact.phone}>
              WhatsApp {contact.phone ? `(${contact.phone})` : '(keine Nummer)'}
            </option>
            <option value="other">Andere (SMS, Telefon, Instagram …)</option>
          </select>
        </label>
      </div>

      {channel === 'email' && (
        <label className="pre-entry-contact-field">
          <span>Betreff</span>
          <input
            type="text"
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!prepared}
          />
        </label>
      )}
      <label className="pre-entry-contact-field">
        <span>Nachricht (fertig ausgefüllt, du kannst sie noch ändern)</span>
        <textarea
          rows={10}
          value={text}
          maxLength={TEMPLATE_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          disabled={!prepared}
          data-testid="pre-entry-message"
        />
      </label>
      {contact.other && channel === 'other' && (
        <p className="pre-entry-muted">Weitere Kontaktmöglichkeit: {contact.other}</p>
      )}

      {error && (
        <p className="pre-entry-error" role="alert">
          {error}
        </p>
      )}

      <div className="pre-entry-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Abbrechen
        </button>
        {channel === 'email' && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !prepared || !subject.trim() || !text.trim()}
            onClick={send}
            data-testid="pre-entry-send-email"
          >
            <Mail size={16} aria-hidden="true" />
            <span>E-Mail senden</span>
          </button>
        )}
        {channel === 'whatsapp' && waLink && prepared && (
          <a
            className="btn btn-primary"
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setExternalOpened(true)}
            data-testid="pre-entry-whatsapp"
          >
            <MessageCircle size={16} aria-hidden="true" />
            <span>In WhatsApp öffnen</span>
          </a>
        )}
        {channel !== 'email' && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!prepared}
            onClick={copy}
            data-testid="pre-entry-copy"
          >
            <Copy size={16} aria-hidden="true" />
            <span>{copied ? 'Kopiert' : 'Text kopieren'}</span>
          </button>
        )}
        {channel !== 'email' && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !prepared || !externalOpened}
            onClick={send}
            data-testid="pre-entry-mark-contacted"
          >
            <Send size={16} aria-hidden="true" />
            <span>Als kontaktiert markieren</span>
          </button>
        )}
      </div>
    </section>
  );
}
