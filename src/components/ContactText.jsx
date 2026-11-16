import { contactPhone, messengerLinks, parseContactText } from '../utils/contactFormat';
import './ContactMessengers.css';

/**
 * The event's contact text with clickable e-mail and phone numbers, followed
 * by the messenger links the organizer chose for the phone number
 * (`kontaktMessenger`, Trello 6af6d067).
 */
export default function ContactText({ kontakt, messengers, className }) {
  const links = messengerLinks(contactPhone(kontakt), messengers);
  return (
    <>
      <span className={className}>
        {parseContactText(kontakt).map((segment, index) => {
          if (segment.type === 'email') {
            return (
              <a key={index} href={`mailto:${segment.value}`} className="detail-link">
                {segment.value}
              </a>
            );
          }
          if (segment.type === 'phone') {
            return (
              <a key={index} href={`tel:${segment.value}`} className="detail-link">
                {segment.value}
              </a>
            );
          }
          return <span key={index}>{segment.value}</span>;
        })}
      </span>
      {links.length > 0 && (
        <span className="contact-messengers" data-testid="contact-messengers">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="detail-link contact-messenger-link"
              data-testid={`contact-messenger-${link.id}`}
            >
              {link.label}
            </a>
          ))}
        </span>
      )}
    </>
  );
}
