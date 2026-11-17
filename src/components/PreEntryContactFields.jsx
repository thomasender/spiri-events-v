// Contact of the organizer of a pre-entry (Trello 6afb1116): never public.
/** The contact fields, shared by the wizard section and the edit form of the overview. */
export function PreEntryContactFields({ contact, onChange, errors = {} }) {
  const field = (key, label, props = {}) => (
    <label className="pre-entry-contact-field">
      <span>{label}</span>
      <input
        type="text"
        value={contact[key]}
        onChange={onChange(key)}
        className={errors[key] ? 'input-error' : ''}
        data-testid={`pre-entry-contact-${key}`}
        {...props}
      />
      {errors[key] && <span className="error-text">{errors[key]}</span>}
    </label>
  );
  return (
    <div className="pre-entry-contact-grid">
      {field('name', 'Name (Veranstalter:in)', { maxLength: 120 })}
      {field('contactPerson', 'Ansprechperson', { maxLength: 120 })}
      {field('organization', 'Organisation', { maxLength: 120 })}
      {field('email', 'E-Mail', { maxLength: 200, inputMode: 'email', type: 'email' })}
      {field('phone', 'Telefon / WhatsApp', { maxLength: 40, inputMode: 'tel' })}
      {field('other', 'Weitere Kontaktmöglichkeit (z. B. Instagram)', { maxLength: 300 })}
      {errors.contact && <p className="error-text">{errors.contact}</p>}
    </div>
  );
}
