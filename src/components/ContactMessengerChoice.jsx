import { CONTACT_MESSENGERS, contactPhone } from '../utils/contactFormat';
import './ContactMessengers.css';

/**
 * Below the contact field of the event forms: once the contact is a phone
 * number, the organizer may tick the messengers visitors can reach it with
 * (Trello 6af6d067). Renders nothing for an e-mail or free text.
 */
export default function ContactMessengerChoice({ kontakt, value, onChange }) {
  if (!contactPhone(kontakt)) return null;
  const selected = Array.isArray(value) ? value : [];
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  };
  return (
    <div
      role="group"
      aria-labelledby="contact-messenger-choice-label"
      className="contact-messenger-choice"
      data-testid="contact-messenger-choice"
    >
      <span id="contact-messenger-choice-label" className="contact-messenger-choice-label">
        Auch erreichbar über:
      </span>
      {CONTACT_MESSENGERS.map((messenger) => (
        <label key={messenger.id} className="contact-messenger-chip">
          <input
            type="checkbox"
            checked={selected.includes(messenger.id)}
            onChange={() => toggle(messenger.id)}
          />
          <span>{messenger.label}</span>
        </label>
      ))}
    </div>
  );
}
