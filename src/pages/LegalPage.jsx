import { Link } from 'react-router-dom';
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
    lastUpdated: 'September 2026',
    sections: [
      {
        heading: 'Verein',
        text: `**Tribe Vorarlberg - Verein zur Förderung einer ganzheitlichen Lebensweise und Gesundheitsförderung**

ZVR-Zahl: 1865711062
Vordere Achmühlerstraße 17C
A-6850 Dornbirn
Vorarlberg / Österreich`,
      },
      {
        heading: 'Projekt',
        text: `Dieser Online Veranstaltungskalender ist ein Projekt des gemeinnützigen Vereins "Tribe Vorarlberg" welcher mit diesem Projekt seinen Zweck eine ganzheitliche, bewusste und gesundheitsfördernde Lebensweise zu fördern und zu pflegen, sowie die Unterstützung von Menschen in ihrer persönlichen, körperlichen, geistigen, sozialen, spirituellen und kulturellen Entwicklung nachkommt.

Verantwortliche / Vereinsvorstand

Präsident

Peter Mathis

[info@petermathis.at](mailto:info@petermathis.at)

+4368181828713

Vizepräsident

Thomas Ender

[thomas@blissofkundalini.yoga](mailto:thomas@blissofkundalini.yoga)

+43 660 2673509`,
      },
      {
        heading: 'Onlinepräsenzen',
        text: `Dieses Impressum gilt auch für folgende Onlinepräsenzen:

- Facebook: [https://www.facebook.com/tribevorarlberg](https://www.facebook.com/tribevorarlberg)
- Instagram: [https://www.instagram.com/tribevorarlberg](https://www.instagram.com/tribevorarlberg)

E-Mail: admin@thetribe.at`,
      },
      {
        heading: 'Streitschlichtung',
        text: `Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: [https://consumer-redress.ec.europa.eu/index_de](https://consumer-redress.ec.europa.eu/index_de). Unsere E-Mail-Adresse finden Sie oben im Impressum.

Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.`,
      },
      {
        heading: 'Haftungsausschluss',
        text: `### 1. Inhalte und Veranstaltungen

The Tribe dient als Plattform zur Veröffentlichung und Auffindbarkeit von Veranstaltungen, Angeboten und Informationen Dritter. Die auf der Website veröffentlichten Inhalte, insbesondere Texte, Bilder, Termine, Preise, Beschreibungen und sonstige Angaben, werden teilweise von externen Veranstalter:innen und Nutzer:innen bereitgestellt.

Für die Aktualität, Richtigkeit, Vollständigkeit oder Rechtmäßigkeit der bereitgestellten Informationen übernimmt The Tribe keine Gewähr. Haftungsansprüche, die sich aus der Nutzung oder Nichtnutzung der auf The Tribe veröffentlichten Informationen ergeben, sind ausgeschlossen, soweit gesetzlich zulässig und sofern kein vorsätzliches oder grob fahrlässiges Verhalten von The Tribe vorliegt.

The Tribe ist nicht Veranstalter, Anbieter oder Vertragspartner der auf der Plattform präsentierten Veranstaltungen und Angebote, sofern dies nicht ausdrücklich anders angegeben ist. Für die Durchführung, Ausgestaltung, Verfügbarkeit, Qualität und rechtliche Zulässigkeit der jeweiligen Veranstaltungen und Angebote sind ausschließlich die jeweiligen Anbieter:innen verantwortlich.

### 2. Externe Links und Angebote

Auf The Tribe können externe Personen und Veranstalter:innen Links zu ihren eigenen Websites, Angeboten, Buchungs- und Verkaufsseiten sowie zu anderen externen Online-Angeboten hinterlegen. Diese Links können teilweise automatisiert mit den veröffentlichten Veranstaltungen oder Profilen verknüpft werden.

The Tribe hat keinen Einfluss auf die Inhalte, Verfügbarkeit, Preise, Geschäftsbedingungen oder Datenschutzpraktiken dieser externen Websites und Angebote und übernimmt hierfür keine Verantwortung. Für sämtliche Inhalte und Angebote auf verlinkten externen Seiten ist ausschließlich deren jeweilige Betreiber verantwortlich.

Für Schäden, die aus der Nutzung oder Nichtnutzung externer Websites oder der dort angebotenen Informationen, Produkte oder Dienstleistungen entstehen, haftet The Tribe nicht, soweit gesetzlich zulässig.

Sollte The Tribe von rechtswidrigen oder problematischen Inhalten Kenntnis erlangen, werden diese im Rahmen der technischen und rechtlichen Möglichkeiten geprüft und gegebenenfalls entfernt bzw. die entsprechende Verlinkung deaktiviert.

### 3. Von Nutzer:innen bereitgestellte Inhalte

Personen und Veranstalter:innen, die Inhalte auf The Tribe hochladen oder veröffentlichen, sind selbst dafür verantwortlich, dass ihre Texte, Bilder, Videos, Logos, Veranstaltungsinformationen und sonstigen Inhalte frei von Rechten Dritter sind und keine gesetzlichen Bestimmungen verletzen.

Mit der Übermittlung von Inhalten bestätigen die jeweiligen Nutzer:innen, dass sie über die erforderlichen Rechte zur Veröffentlichung verfügen und The Tribe diese Inhalte im Rahmen der Plattform veröffentlichen, bearbeiten, technisch verarbeiten und darstellen darf.

The Tribe übernimmt keine Verantwortung für die von Nutzer:innen bereitgestellten Inhalte und ist nicht verpflichtet, diese vor ihrer Veröffentlichung auf ihre Rechtmäßigkeit, Richtigkeit oder Vollständigkeit zu überprüfen.

The Tribe behält sich vor, Inhalte, die gegen gesetzliche Bestimmungen, Rechte Dritter oder die Grundsätze der Plattform verstoßen, ohne vorherige Ankündigung zu entfernen.

### 4. Urheberrecht

Die auf The Tribe veröffentlichten Inhalte können sowohl von The Tribe selbst als auch von externen Nutzer:innen und Veranstalter:innen stammen.

Die Urheber- und Nutzungsrechte an von The Tribe selbst erstellten Texten, Bildern, Grafiken und sonstigen Inhalten verbleiben bei The Tribe bzw. den jeweiligen Rechteinhaber:innen. Eine Verwendung, Vervielfältigung oder Weitergabe dieser Inhalte bedarf der entsprechenden Zustimmung, sofern keine gesetzliche Ausnahme besteht.

Die Rechte an von Nutzer:innen bereitgestellten Inhalten verbleiben bei den jeweiligen Urheber:innen bzw. Rechteinhaber:innen. Die Verantwortung dafür, dass diese Inhalte auf The Tribe veröffentlicht werden dürfen, liegt bei der jeweiligen einstellenden Person.

Sollte trotz sorgfältiger Prüfung ein Inhalt ohne entsprechende Berechtigung veröffentlicht worden sein, bitten wir um einen entsprechenden Hinweis. Nach Kenntniserlangung wird The Tribe den betreffenden Inhalt prüfen und, sofern erforderlich, entfernen oder die weitere Veröffentlichung unterbinden.

### 5. Änderungen des Online-Angebots

The Tribe behält sich ausdrücklich vor, Teile der Website oder das gesamte Online-Angebot jederzeit ohne gesonderte Ankündigung zu verändern, zu ergänzen, zu löschen oder die Veröffentlichung zeitweise oder dauerhaft einzustellen.

Für die Verfügbarkeit einzelner Inhalte, Veranstaltungen, Profile oder Funktionen kann keine Gewähr übernommen werden.

### 6. Haftung

The Tribe haftet nicht für Schäden materieller oder ideeller Art, die aus der Nutzung oder Nichtnutzung der auf der Plattform veröffentlichten Informationen, Veranstaltungen, Angebote oder extern verlinkten Websites entstehen, soweit gesetzlich zulässig und sofern kein vorsätzliches oder grob fahrlässiges Verhalten von The Tribe vorliegt.

Zwingende gesetzliche Haftungsbestimmungen bleiben unberührt.

### 7. Rechtswirksamkeit dieses Haftungsausschlusses

Sollten einzelne Bestimmungen dieses Haftungsausschlusses der geltenden Rechtslage nicht, nicht mehr oder nicht vollständig entsprechen, bleibt die Gültigkeit der übrigen Bestimmungen davon unberührt. An die Stelle der unwirksamen oder nicht anwendbaren Bestimmung tritt eine Regelung, die dem wirtschaftlichen und rechtlichen Zweck der ursprünglichen Bestimmung möglichst nahekommt.`,
      },
    ],
  },
};

function renderInline(text, keyPrefix) {
  const parts = [];
  const regex = /(\[[^\]]+\]\([^)]+?\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('[')) {
      const linkMatch = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(token);
      const linkText = linkMatch[1];
      const url = linkMatch[2];
      const isMailto = url.startsWith('mailto:');
      const linkProps = { key: `${keyPrefix}-link-${i++}`, href: url, className: 'legal-link' };
      if (!isMailto) {
        linkProps.target = '_blank';
        linkProps.rel = 'noopener noreferrer';
      }
      parts.push(<a {...linkProps}>{linkText}</a>);
    } else if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-bb-${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<strong key={`${keyPrefix}-b-${i++}`}>{token.slice(1, -1)}</strong>);
    }
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

    if (line.startsWith('### ')) {
      flush();
      blocks.push({ type: 'h4', text: line.substring(4) });
      continue;
    }

    if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'h3', text: line.substring(3) });
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
        if (block.type === 'h3') {
          return (
            <h3 key={blockIdx} className="legal-subheading">
              {renderInline(block.text, `h3-${blockIdx}`)}
            </h3>
          );
        }
        if (block.type === 'h4') {
          return (
            <h4 key={blockIdx} className="legal-subsubheading">
              {renderInline(block.text, `h4-${blockIdx}`)}
            </h4>
          );
        }
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

export default function LegalPage({ page }) {
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
