import { useParams, Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import './LegalPage.css';

const content = {
  datenschutz: {
    title: 'Datenschutzerklärung',
    description:
      'Datenschutzerklärung von tribe Vorarlberg: welche Daten wir erheben, wie wir sie schützen und welche Rechte du hast.',
    lastUpdated: 'März 2026',
    sections: [
      {
        heading: '1. Verantwortlicher',
        text: `Verantwortlicher für die Verarbeitung personenbezogener Daten im Sinne der DSGVO ist:

tribe Vorarlberg
E-Mail: thomas@blissofkundalini.yoga`,
      },
      {
        heading: '2. Welche Daten wir erheben',
        text: `Wir erheben und verarbeiten nur die Daten, die für den Betrieb dieser App notwendig sind.

*Bei der Registrierung:*
- E-Mail-Adresse (für die Authentifizierung)
- Passwort (verschlüsselt gespeichert, Firebase Authentication)

*Bei der Erstellung von Events:*
- Titel, Datum, Uhrzeit, Ort
- Beschreibung
- Beitrag (kostenlos, gegen Gebühr oder freie Spende)
- Link (optional)
- Bild (optional, max. 15MB; wird automatisch für die Anzeige komprimiert)

Diese Daten werden in Firestore (Firebase) gespeichert. Event-Bilder werden in Firebase Cloud Storage gespeichert.`,
      },
      {
        heading: '3. Zweck und Rechtsgrundlage der Verarbeitung',
        text: `Wir verarbeiten Ihre Daten auf Grundlage folgender Rechtsgrundlagen:

*Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO):*
- Registrierung und Authentifizierung
- Verwaltung Ihrer Events

*Berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO):*
- Bereitstellung der App-Funktionalität
- Sicherstellung des ordnungsgemäßen Betriebs`,
      },
      {
        heading: '4. Keine Weitergabe an Dritte',
        text: `Wir geben Ihre personenbezogenen Daten nicht an Dritte weiter. Ihre Daten werden nicht verkauft, vermietet oder in sonstiger Weise an externe Unternehmen oder Organisationen übermittelt.

Firebase (Google) fungiert als Auftragsverarbeiter und erhält Ihre Daten nur insoweit, als dies für die Bereitstellung der Authentifizierungs- und Datenbankdienste erforderlich ist.`,
      },
      {
        heading: '5. Speicherdauer',
        text: `Wir speichern Ihre Daten so lange, wie Sie Ihr Konto aktiv nutzen:

- *Account-Daten:* Werden gelöscht, sobald Sie Ihr Konto löschen
- *Events:* Werden gelöscht, wenn Sie diese löschen oder Ihr Konto entfernen lassen

Nach einer Löschunganfrage werden die Daten innerhalb von 30 Tagen entfernt.`,
      },
      {
        heading: '6. Ihre Rechte',
        text: `Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:

- *Auskunftsrecht (Art. 15 DSGVO):* Sie können Auskunft über Ihre gespeicherten Daten verlangen
- *Recht auf Berichtigung (Art. 16 DSGVO):* Sie können unrichtige Daten korrigieren lassen
- *Recht auf Löschung (Art. 17 DSGVO):* Sie können die Löschung Ihrer Daten verlangen
- *Recht auf Einschränkung (Art. 18 DSGVO):* Sie können die Verarbeitung einschränken lassen
- *Widerspruchsrecht (Art. 21 DSGVO):* Sie können der Verarbeitung widersprechen
- *Recht auf Datenübertragbarkeit (Art. 20 DSGVO):* Sie können Ihre Daten in einem gängigen Format erhalten

Um Ihre Rechte auszuüben, senden Sie eine E-Mail an kontakt@spirituelle-events-vorarlberg.at`,
      },
      {
        heading: '7. Kein Tracking oder Analytics',
        text: `Diese App verwendet keine Tracking-Dienste, Cookies zu Werbezwecken oder Analyse-Tools. Es werden keine Daten über Ihr Nutzungsverhalten erhoben oder gespeichert.`,
      },
      {
        heading: '8. Datensicherheit',
        text: `Wir setzen angemessene technische und organisatorische Maßnahmen ein, um Ihre Daten zu schützen:

- Firebase Authentication für sichere Authentifizierung
- Firestore Zugriffsregeln, die sicherstellen, dass Benutzer nur auf ihre eigenen Daten zugreifen können
- Verschlüsselte Übertragung (HTTPS/TLS)`,
      },
      {
        heading: '9. Firebase (Google) als Auftragsverarbeiter',
        text: `Wir nutzen Firebase (ein Dienst von Google Ireland Limited) für:
- Authentifizierung (Firebase Authentication)
- Datenspeicherung (Cloud Firestore)

Die Datenverarbeitung durch Firebase erfolgt auf Grundlage eines Auftragsverarbeitungsvertrags gemäß Art. 28 DSGVO. Google verarbeitet Daten ausschließlich nach unserer Weisung und nicht für eigene Zwecke.

Weitere Informationen finden Sie in der Datenschutzerklärung von Google: https://policies.google.com/privacy`,
      },
      {
        heading: '10. Bildspeicherung (Firebase Cloud Storage)',
        text: `Wenn Sie ein Bild zu einem Event hochladen, wird dieses in Firebase Cloud Storage gespeichert. Firebase Cloud Storage ist ein Dienst von Google Ireland Limited und speichert die Daten auf Google-Servern.

*Was bedeutet das für Sie?*
- Das hochgeladene Bild wird auf Servern innerhalb der EU/des EWR gespeichert und ist über eine öffentliche URL abrufbar (damit das Bild auf der Event-Seite angezeigt werden kann)
- Die Verarbeitung erfolgt im Rahmen der Datenverarbeitung mit Google (Firebase), der gleichen Infrastruktur, die wir auch für die übrigen App-Daten nutzen
- Die URLs der Bilder sind öffentlich und können von jedem eingesehen werden

*Löschen von Bildern:*
- Wenn Sie ein Event bearbeiten und das Bild entfernen oder ersetzen, wird das alte Bild automatisch aus dem Speicher gelöscht
- Wenn Sie ein Event löschen, wird auch das zugehörige Bild entfernt

Wir empfehlen Ihnen, nur Bilder hochzuladen, die Sie auch andernorts öffentlich teilen würden, und keine sensiblen personenbezogenen Daten (z.B. Gesichter unkenntlich machen) in den Bildern zu zeigen.`,
      },
      {
        heading: '11. Änderungen dieser Datenschutzerklärung',
        text: `Wir behalten uns vor, diese Datenschutzerklärung bei Änderungen der App oder der Rechtslage anzupassen. Die jeweils aktuelle Version finden Sie immer auf dieser Seite.`,
      },
    ],
  },
  impressum: {
    title: 'Impressum',
    description:
      'Impressum und Anbieterkennzeichnung von tribe Vorarlberg – Verein zur Förderung einer ganzheitlichen Lebensweise.',
    lastUpdated: 'August 2026',
    sections: [
      {
        heading: 'Angaben gemäß § 5 ECG (E-Commerce-Gesetz)',
        text: `Tribe Vorarlberg – Verein zur Förderung einer ganzheitlichen Lebensweise und Gesundheitsförderung

ZVR-Zahl: 1865711062

Sitz des Vereins:
Dornbirn, Österreich

Vertretungsbefugtes Organ:
Die Präsidenten gemäß den Vereinsstatuten.

E-Mail: office@tribevorarlberg.at

Grundlegende Richtung der Website:
Diese Website informiert über die Tätigkeiten, Veranstaltungen und Ziele des Vereins.`,
      },
    ],
  },
};

function renderInline(text, keyPrefix) {
  const parts = [];
  const regex = /\*([^*]+)\*/g;
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(<strong key={`${keyPrefix}-b-${i++}`}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts;
}

function LegalText({ text }) {
  const lines = text.split('\n');
  const blocks = [];
  let current = null;

  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flush();
      continue;
    }

    if (line.startsWith('- ')) {
      const item = line.substring(2);
      if (current?.type !== 'list') {
        flush();
        current = { type: 'list', items: [item] };
      } else {
        current.items.push(item);
      }
    } else {
      if (current?.type !== 'paragraph') {
        flush();
        current = { type: 'paragraph', lines: [line] };
      } else {
        current.lines.push(line);
      }
    }
  }
  flush();

  return (
    <>
      {blocks.map((block, blockIdx) => {
        if (block.type === 'list') {
          return (
            <ul key={blockIdx} className="legal-list">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInline(item, `l-${blockIdx}-${itemIdx}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={blockIdx} className="legal-paragraph">
            {block.lines.map((line, lineIdx) => (
              <span key={lineIdx}>
                {renderInline(line, `p-${blockIdx}-${lineIdx}`)}
                {lineIdx < block.lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

export default function LegalPage() {
  const { page } = useParams();
  const data = content[page];

  if (!data) {
    return (
      <div className="page-container">
        <div className="legal-page">
          <p>Die gesuchte Seite wurde nicht gefunden.</p>
          <Link to="/" className="btn btn-secondary">
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <SeoMeta title={data.title} description={data.description} path={`/${page}`} />
      <div className="legal-page fade-enter">
        <p className="legal-updated">Stand: {data.lastUpdated}</p>
        <h1 className="legal-title">{data.title}</h1>
        <div className="legal-content">
          {data.sections.map((section, index) => (
            <section key={index}>
              <h2>{section.heading}</h2>
              <LegalText text={section.text} />
            </section>
          ))}
        </div>
        <div className="legal-footer">
          <Link to="/" className="btn btn-secondary">
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
