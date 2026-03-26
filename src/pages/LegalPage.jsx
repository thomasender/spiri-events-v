import { useParams, Link } from 'react-router-dom'
import './LegalPage.css'

const content = {
  datenschutz: {
    title: 'Datenschutzerklärung',
    lastUpdated: 'März 2026',
    sections: [
      {
        heading: '1. Verantwortlicher',
        text: `Verantwortlicher für die Verarbeitung personenbezogener Daten im Sinne der DSGVO ist:

Spirituelle Events Vorarlberg
E-Mail: kontakt@spirituelle-events-vorarlberg.at`
      },
      {
        heading: '2. Welche Daten wir erheben',
        text: `Wir erheben und verarbeiten nur die Daten, die für den Betrieb dieser App notwendig sind.

**Bei der Registrierung:**
- E-Mail-Adresse (für die Authentifizierung)
- Passwort (verschlüsselt gespeichert, Firebase Authentication)

**Bei der Erstellung von Events:**
- Titel, Datum, Uhrzeit, Ort
- Beschreibung
- Beitrag (kostenlos oder gegen Gebühr)
- Link (optional)

Diese Daten werden ausschließlich in Firestore (Firebase) gespeichert.`
      },
      {
        heading: '3. Zweck und Rechtsgrundlage der Verarbeitung',
        text: `Wir verarbeiten Ihre Daten auf Grundlage folgender Rechtsgrundlagen:

**Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO):**
- Registrierung und Authentifizierung
- Verwaltung Ihrer Events

**Berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO):**
- Bereitstellung der App-Funktionalität
- Sicherstellung des ordnungsgemäßen Betriebs`
      },
      {
        heading: '4. Keine Weitergabe an Dritte',
        text: `Wir geben Ihre personenbezogenen Daten nicht an Dritte weiter. Ihre Daten werden nicht verkauft, vermietet oder in sonstiger Weise an externe Unternehmen oder Organisationen übermittelt.

Firebase (Google) fungiert als Auftragsverarbeiter und erhält Ihre Daten nur insoweit, als dies für die Bereitstellung der Authentifizierungs- und Datenbankdienste erforderlich ist.`
      },
      {
        heading: '5. Speicherdauer',
        text: `Wir speichern Ihre Daten so lange, wie Sie Ihr Konto aktiv nutzen:

- **Account-Daten:** Werden gelöscht, sobald Sie Ihr Konto löschen
- **Events:** Werden gelöscht, wenn Sie diese löschen oder Ihr Konto entfernen lassen

Nach einer Löschunganfrage werden die Daten innerhalb von 30 Tagen entfernt.`
      },
      {
        heading: '6. Ihre Rechte',
        text: `Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:

- **Auskunftsrecht (Art. 15 DSGVO):** Sie können Auskunft über Ihre gespeicherten Daten verlangen
- **Recht auf Berichtigung (Art. 16 DSGVO):** Sie können unrichtige Daten korrigieren lassen
- **Recht auf Löschung (Art. 17 DSGVO):** Sie können die Löschung Ihrer Daten verlangen
- **Recht auf Einschränkung (Art. 18 DSGVO):** Sie können die Verarbeitung einschränken lassen
- **Widerspruchsrecht (Art. 21 DSGVO):** Sie können der Verarbeitung widersprechen
- **Recht auf Datenübertragbarkeit (Art. 20 DSGVO):** Sie können Ihre Daten in einem gängigen Format erhalten

Um Ihre Rechte auszuüben, senden Sie eine E-Mail an kontakt@spirituelle-events-vorarlberg.at`
      },
      {
        heading: '7. Kein Tracking oder Analytics',
        text: `Diese App verwendet keine Tracking-Dienste, Cookies zu Werbezwecken oder Analyse-Tools. Es werden keine Daten über Ihr Nutzungsverhalten erhoben oder gespeichert.`
      },
      {
        heading: '8. Datensicherheit',
        text: `Wir setzen angemessene technische und organisatorische Maßnahmen ein, um Ihre Daten zu schützen:

- Firebase Authentication für sichere Authentifizierung
- Firestore Zugriffsregeln, die sicherstellen, dass Benutzer nur auf ihre eigenen Daten zugreifen können
- Verschlüsselte Übertragung (HTTPS/TLS)`
      },
      {
        heading: '9. Firebase (Google) als Auftragsverarbeiter',
        text: `Wir nutzen Firebase (ein Dienst von Google Ireland Limited) für:
- Authentifizierung (Firebase Authentication)
- Datenspeicherung (Cloud Firestore)

Die Datenverarbeitung durch Firebase erfolgt auf Grundlage eines Auftragsverarbeitungsvertrags gemäß Art. 28 DSGVO. Google verarbeitet Daten ausschließlich nach unserer Weisung und nicht für eigene Zwecke.

Weitere Informationen finden Sie in der Datenschutzerklärung von Google: https://policies.google.com/privacy`
      },
      {
        heading: '10. Änderungen dieser Datenschutzerklärung',
        text: `Wir behalten uns vor, diese Datenschutzerklärung bei Änderungen der App oder der Rechtslage anzupassen. Die jeweils aktuelle Version finden Sie immer auf dieser Seite.`
      }
    ]
  },
  nutzungsbedingungen: {
    title: 'Nutzungsbedingungen',
    lastUpdated: 'März 2026',
    sections: [
      {
        heading: '1. Geltungsbereich',
        text: `Diese Nutzungsbedingungen gelten für die Nutzung der Web-Anwendung "Spirituelle Events Vorarlberg" (im Folgenden "App"). Mit der Nutzung dieser App erklären Sie sich mit diesen Bedingungen einverstanden.`
      },
      {
        heading: '2. Gegenstand der App',
        text: `Die App dient der Veröffentlichung und Verwaltung spiritueller Veranstaltungen in Vorarlberg. Nutzer können Events erstellen, bearbeiten und löschen sowie Events anderer Nutzer ansehen.`
      },
      {
        heading: '3. Registrierung und Zugang',
        text: `Um die App in vollem Umfang nutzen zu können (Erstellen und Verwalten von Events), ist eine Registrierung erforderlich. Zur Registrierung sind folgende Angaben notwendig:

- Eine gültige E-Mail-Adresse
- Ein Passwort

Sie sind dafür verantwortlich, Ihre Zugangsdaten vertraulich zu halten und vor unbefugtem Zugriff zu schützen.`
      },
      {
        heading: '4. Nutzung der App',
        text: `Die App darf nur für rechtmäßige Zwecke genutzt werden. Als Nutzer verpflichten Sie sich:

- Keine falschen, irreführenden oder rechtswidrigen Events zu erstellen
- Keine Inhalte zu veröffentlichen, die gegen geltendes Recht verstoßen
- Die App nicht in einer Weise zu nutzen, die die Stabilität oder Sicherheit der Dienste beeinträchtigt
- Keine automatisierten Abfragen oder Systeme einzusetzen, die den Betrieb stören könnten`
      },
      {
        heading: '5. Verantwortlichkeit für Inhalte',
        text: `Für den Inhalt der von Ihnen erstellten Events sind Sie selbst verantwortlich. Wir überprüfen die Inhalte nicht vor der Veröffentlichung und distanzieren uns ausdrücklich von rechtswidrigen Inhalten.

Sollten Sie einen Inhalt melden wollen, schreiben Sie an kontakt@spirituelle-events-vorarlberg.at.`
      },
      {
        heading: '6. Geistiges Eigentum',
        text: `Die App und deren Inhalte (Design, Texte, Grafiken) sind urheberrechtlich geschützt. Eine Vervielfältigung oder Verbreitung ohne unsere ausdrückliche Zustimmung ist nicht gestattet.`
      },
      {
        heading: '7. Verfügbarkeit',
        text: `Wir streben eine möglichst unterbrechungsfreie Verfügbarkeit der App an. Ein Anspruch auf ständige Verfügbarkeit besteht jedoch nicht. Wir behalten uns vor, den Dienst jederzeit einzuschränken oder einzustellen.`
      },
      {
        heading: '8. Haftung',
        text: `Wir haften nicht für Schäden, die durch die Nutzung der App entstehen, es sei denn, diese wurden durch Vorsatz oder grobe Fahrlässigkeit verursacht. Dies gilt nicht für Schäden an Leben, Körper oder Gesundheit.

Für Events, die von Nutzern erstellt werden, übernehmen wir keine Verantwortung. Die Teilnahme an Events erfolgt auf eigene Verantwortung.`
      },
      {
        heading: '9. Datenschutz',
        text: `Der Schutz Ihrer personenbezogenen Daten ist uns wichtig. Informationen zur Verarbeitung Ihrer Daten finden Sie in unserer Datenschutzerklärung.

Grundsätzlich:
- Wir speichern nur Daten, die für den Betrieb der App notwendig sind
- Wir geben keine Daten an Dritte weiter
- Wir nutzen keine Tracking- oder Analysetools`
      },
      {
        heading: '10. Konto-Löschung',
        text: `Sie können Ihr Konto jederzeit löschen lassen, indem Sie uns eine entsprechende Anfrage per E-Mail senden. Nach der Löschung werden alle Ihre Daten gemäß unserer Datenschutzerklärung entfernt.`
      },
      {
        heading: '11. Änderungen der Nutzungsbedingungen',
        text: `Wir behalten uns vor, diese Nutzungsbedingungen bei Bedarf zu ändern. Die aktuelle Version finden Sie immer auf dieser Seite. Die geänderten Bedingungen gelten für die Nutzung nach dem Zeitpunkt ihrer Veröffentlichung.`
      },
      {
        heading: '12. Schlussbestimmungen',
        text: `Es gilt das Recht der Republik Österreich. Sollten einzelne Bestimmungen dieser Nutzungsbedingungen unwirksam sein, so bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.

Anbieter:
Spirituelle Events Vorarlberg
E-Mail: kontakt@spirituelle-events-vorarlberg.at`
      }
    ]
  }
}

export default function LegalPage() {
  const { page } = useParams()
  const data = content[page]

  if (!data) {
    return (
      <div className="page-container">
        <div className="legal-page">
          <p>Die gesuchte Seite wurde nicht gefunden.</p>
          <Link to="/" className="btn btn-secondary">Zurück zur Startseite</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="legal-page fade-enter">
        <p className="legal-updated">Stand: {data.lastUpdated}</p>
        <h1 className="legal-title">{data.title}</h1>
        <div className="legal-content">
          {data.sections.map((section, index) => (
            <section key={index}>
              <h2>{section.heading}</h2>
              <p style={{ whiteSpace: 'pre-wrap' }}>{section.text}</p>
            </section>
          ))}
        </div>
        <div className="legal-footer">
          <Link to="/" className="btn btn-secondary">Zurück zur Startseite</Link>
        </div>
      </div>
    </div>
  )
}
