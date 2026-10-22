import { Link } from 'react-router-dom';
import { CHAT_RETENTION_DAYS } from '../../utils/chat';

// Chat rules shown before the first message, shared by the Lagerfeuer and the
// Kerzenraum. `audience` says who can read what you write.
export default function ChatRules({
  onAccept,
  audience = 'Alle angemeldeten Mitglieder',
  testIdPrefix = 'chat',
  canReport = true,
}) {
  const titleId = `${testIdPrefix}-rules-title`;
  return (
    <section className="chat-rules" data-testid={`${testIdPrefix}-rules`} aria-labelledby={titleId}>
      <h2 id={titleId}>Chat-Regeln</h2>
      <ul>
        <li>Sei freundlich und respektvoll. Keine Beleidigungen, Hetze oder Diskriminierung.</li>
        <li>Kein Spam, keine Werbung, keine Kettennachrichten.</li>
        <li>Keine persönlichen Daten anderer, keine Gesundheits- oder Heilversprechen.</li>
        <li>
          {audience} können deine Nachrichten mit Namen und Foto sehen. Sie werden nach{' '}
          {CHAT_RETENTION_DAYS} Tagen automatisch gelöscht.
        </li>
        <li>
          {canReport ? 'Verstöße kannst du melden. ' : ''}Die Moderation kann Nachrichten löschen
          und Mitglieder ausschließen.
        </li>
      </ul>
      <p>
        Mehr dazu in der <Link to="/datenschutz">Datenschutzerklärung</Link> (Abschnitt
        Community-Chat).
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onAccept}
        data-testid={`${testIdPrefix}-rules-accept`}
      >
        Verstanden, los geht&apos;s
      </button>
    </section>
  );
}
