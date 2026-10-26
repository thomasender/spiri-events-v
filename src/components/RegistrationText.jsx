import { parseRegistrationText } from '../utils/contactFormat';

/** Free text of the "Anmeldung" field with clickable links, e-mails and phone numbers. */
export default function RegistrationText({ text }) {
  return (
    <span className="detail-value detail-link--break">
      {parseRegistrationText(text).map((segment, index) => {
        if (segment.type === 'link') {
          return (
            <a
              key={index}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              className="detail-link"
            >
              {segment.value}
            </a>
          );
        }
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
  );
}
