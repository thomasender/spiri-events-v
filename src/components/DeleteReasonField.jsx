import './DeleteReasonField.css';

export const DELETE_REASON_MAX_LENGTH = 2000;

/**
 * Textarea in which an admin explains why they delete another user's event.
 * The reason is sent to the event owner by email, so it is required.
 */
export default function DeleteReasonField({ value, onChange, disabled = false }) {
  return (
    <div className="delete-reason-field">
      <label htmlFor="delete-reason">
        Grund für das Löschen <span aria-hidden="true">*</span>
      </label>
      <textarea
        id="delete-reason"
        data-testid="delete-reason"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required
        rows={4}
        maxLength={DELETE_REASON_MAX_LENGTH}
        placeholder="Warum wird dieses Event gelöscht?"
      />
      <p className="delete-reason-hint">Der Grund wird dem Veranstalter per E-Mail mitgeteilt.</p>
    </div>
  );
}
