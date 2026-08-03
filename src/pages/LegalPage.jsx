import { useParams, Link } from 'react-router-dom';
import './LegalPage.css';

const content = {
  datenschutz: {
    title: 'Datenschutzerklärung',
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

**Bei der Registrierung:**
- E-Mail-Adresse (für die Authentifizierung)
- Passwort (verschlüsselt gespeichert, Firebase Authentication)

**Bei der Erstellung von Events:**
- Titel, Datum, Uhrzeit, Ort
- Beschreibung
- Beitrag (kostenlos oder gegen Gebühr)
- Link (optional)
- Bild (optional, max. 15MB; wird automatisch für die Anzeige komprimiert)

Diese Daten werden in Firestore (Firebase) gespeichert. Event-Bilder werden in Firebase Cloud Storage gespeichert.`,
      },
      {
        heading: '3. Zweck und Rechtsgrundlage der Verarbeitung',
        text: `Wir verarbeiten Ihre Daten auf Grundlage folgender Rechtsgrundlagen:

**Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO):**
- Registrierung und Authentifizierung
- Verwaltung Ihrer Events

**Berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO):**
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

- **Account-Daten:** Werden gelöscht, sobald Sie Ihr Konto löschen
- **Events:** Werden gelöscht, wenn Sie diese löschen oder Ihr Konto entfernen lassen

Nach einer Löschunganfrage werden die Daten innerhalb von 30 Tagen entfernt.`,
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

**Was bedeutet das für Sie?**
- Das hochgeladene Bild wird auf Servern innerhalb der EU/des EWR gespeichert und ist über eine öffentliche URL abrufbar (damit das Bild auf der Event-Seite angezeigt werden kann)
- Die Verarbeitung erfolgt im Rahmen der Datenverarbeitung mit Google (Firebase), der gleichen Infrastruktur, die wir auch für die übrigen App-Daten nutzen
- Die URLs der Bilder sind öffentlich und können von jedem eingesehen werden

**Löschen von Bildern:**
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
  agbs: {
    title: 'Allgemeine Geschäftsbedingungen (AGB)',
    lastUpdated: 'Juli 2026',
    sections: [
      {
        heading: '1. Geltungsbereich',
        text: `Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der Web-Anwendung "tribe Vorarlberg" (im Folgenden "Plattform" oder "App"). Mit der Registrierung und Nutzung der Plattform erklären Sie sich mit diesen AGB einverstanden. Die AGB sind integraler Bestandteil des Nutzungsvertrags zwischen Ihnen und dem Betreiber der Plattform.`,
      },
      {
        heading: '2. Gegenstand der Plattform',
        text: `Die Plattform "tribe Vorarlberg" dient ausschließlich der Veröffentlichung und Verwaltung von Veranstaltungen (Events) im Bereich Spiritualität, Wellness und persönliche Entwicklung in Vorarlberg, Österreich.

Die Plattform bietet Nutzern die Möglichkeit:
- Veranstaltungen zu erstellen, zu bearbeiten und zu löschen
- Veranstaltungen anderer Nutzer anzusehen
- Sich über Veranstaltungen zu informieren und diese weiterzuempfehlen

Die Plattform ist eine reine Informations- und Vermittlungsplattform. Sie fungiert nicht als Veranstalter der gelisteten Events und ist nicht Vertragspartner für etwaige Vereinbarungen zwischen Event-Erstellern und Teilnehmern.`,
      },
      {
        heading: '3. Registrierung und Konto',
        text: `Um die Plattform in vollem Umfang nutzen zu können (Erstellen und Verwalten von Events), ist eine Registrierung erforderlich.

Zur Registrierung sind folgende Angaben notwendig:
- Ein gültiger Name (zur Identifikation bei der Event-Verwaltung)
- Eine gültige E-Mail-Adresse (für die Authentifizierung)
- Ein Passwort (mindestens 6 Zeichen)

Sie sind dafür verantwortlich, Ihre Zugangsdaten vertraulich zu halten und vor unbefugtem Zugriff zu schützen. Jede Person, die sich mit Ihren Zugangsdaten anmeldet, gilt als berechtigter Nutzer. Bei Missbrauch oder Verlust der Zugangsdaten informieren Sie uns bitte umgehend.`,
      },
      {
        heading: '4. Verifizierung und Verantwortung der Event-Erstatter',
        text: `Die Plattform führt keine systematische Verifizierung der Event-Erstatter durch. Die Erstellung eines Kontos und die Veröffentlichung von Events ist grundsätzlich jeder registrierte Nutzer möglich.

Für den Inhalt und die Richtigkeit der von Ihnen erstellten Events sind Sie selbst verantwortlich. Die Plattform überprüft die Inhalte nicht vor der Veröffentlichung. Eventuelle Unstimmigkeiten, Fehler oder rechtswidrige Inhalte liegen in der alleinigen Verantwortung des jeweiligen Event-Erstatters.`,
      },
      {
        heading: '5. Kostenpflichtige Veranstaltungen',
        text: `Die Plattform ermöglicht es Nutzern, Events mit einem Teilnahmebeitrag (Gebühr) zu kennzeichnen. Für kostenpflichtige Veranstaltungen gelten folgende Regelungen:

**Haftungsausschluss:**
- Die Plattform fungiert NICHT als Zahlungsdienstleister oder Treuhänder
- Die Plattform übermittelt KEINE Zahlungen zwischen Event-Erstellern und Teilnehmern
- Etwaige Zahlungsvereinbarungen werden ausschließlich zwischen dem Event-Erstatter und den Teilnehmern direkt getroffen
- Die Plattform übernimmt KEINE Haftung für Zahlungen, Rückerstattungen oder Streitigkeiten im Zusammenhang mit kostenpflichtigen Veranstaltungen
- Bei kostenpflichtigen Events obliegt es dem Event-Erstatter, die Zahlungsabwicklung eigenverantwortlich und im Einklang mit geltendem Recht zu regeln (z.B. Rechnungslegung, steuerliche Pflichten)

**Empfehlung:**
Wir empfehlen Event-Erstellern, bei kostenpflichtigen Veranstaltungen klare Zahlungsbedingungen in der Event-Beschreibung anzugeben und geeignete Zahlungswege (z.B. Überweisung, PayPal, etc.) selbst zu organisieren.`,
      },
      {
        heading: '6. Inhalte und Verhaltensregeln',
        text: `Die Plattform darf nur für rechtmäßige Zwecke genutzt werden. Als Nutzer verpflichten Sie sich:

- Keine falschen, irreführenden, missverständlichen oder rechtswidrigen Events zu erstellen
- Keine Inhalte zu veröffentlichen, die gegen geltendes Recht verstoßen (einschließlich, aber nicht beschränkt auf: Diskriminierung, Beleidigung, Ehrverletzung, Urheberrechtsverletzung)
- Die Plattform nicht in einer Weise zu nutzen, die die Stabilität oder Sicherheit der Dienste beeinträchtigt
- Keine automatisierten Abfragen oder Systeme einzusetzen, die den Betrieb stören könnten
- Keine Events zu erstellen, die dem Verkauf von Waren oder Dienstleistungen dienen, die nicht im Zusammenhang mit der jeweiligen Veranstaltung stehen
- Keine personenbezogenen Daten Dritter ohne deren Einwilligung zu veröffentlichen`,
      },
      {
        heading: '7. Verantwortung für Event-Inhalte',
        text: `Für den Inhalt der von Ihnen erstellten Events (einschließlich Texten, Bildern, Links und sonstigen Angaben) sind Sie selbst verantwortlich.

Die Plattform übernimmt keine Gewähr für:
- Die Richtigkeit, Vollständigkeit oder Aktualität der Event-Informationen
- Die tatsächliche Durchführung der angekündigten Events
- Die Qualität, Sicherheit oder Rechtmäßigkeit der angebotenen Veranstaltungen
- Die Zuverlässigkeit, Seriosität oder Kompetenz der Event-Veranstalter

Sollten Sie einen Inhalt melden wollen (z.B. wegen Rechtswidrigkeit, Irreführung oder Beleidigung), schreiben Sie uns an: kontakt@spirituelle-events-vorarlberg.at. Wir werden den Sachverhalt prüfen und gegebenenfalls den betreffenden Inhalt entfernen.`,
      },
      {
        heading: '8. Stornierung und Änderung von Events',
        text: `Event-Erstatter sind grundsätzlich verpflichtet, ihre Events wie angekündigt durchzuführen. Sollte ein Event abgesagt, verschoben oder wesentlich geändert werden, empfehlen wir Ihnen:

- Die Event-Beschreibung zeitnah zu aktualisieren
- Teilnehmer, die sich angemeldet haben, auf anderem Wege zu informieren (sofern Kontaktmöglichkeiten bestehen)
- Ggf. eine Rückerstattung bereits gezahlter Teilnahmegebühren zu veranlassen

Die Plattform übernimmt keine Verantwortung für die Kommunikation zwischen Event-Erstellern und Teilnehmern und haftet nicht für Schäden, die aus einer Absage, Verschiebung oder Änderung eines Events entstehen.`,
      },
      {
        heading: '9. Geistiges Eigentum',
        text: `Die Plattform und deren Inhalte (Design, Texte, Grafiken, Logo, UI-Elemente) sind urheberrechtlich geschützt. Eine Vervielfältigung, Verbreitung, Bearbeitung oder öffentliche Zugänglichmachung ohne unsere ausdrückliche Zustimmung ist nicht gestattet.

Sie behalten alle Rechte an den von Ihnen erstellten Event-Inhalten. Mit der Veröffentlichung eines Events auf der Plattform gewähren Sie uns jedoch das Recht, diese Inhalte im Rahmen der Plattform öffentlich zugänglich zu machen.`,
      },
      {
        heading: '10. Verfügbarkeit',
        text: `Wir streben eine möglichst unterbrechungsfreie Verfügbarkeit der Plattform an. Ein Anspruch auf ständige Verfügbarkeit besteht jedoch nicht. Wir behalten uns vor, den Dienst jederzeit einzuschränken, zu ändern oder einzustellen, insbesondere aufgrund von:

- Wartungsarbeiten
- Sicherheitsgründen
- Technischen Problemen
- Änderungen an der Plattform-Funktionalität

Geplante Wartungsarbeiten werden wir nach Möglichkeit im Voraus ankündigen.`,
      },
      {
        heading: '11. Haftung',
        text: `Wir haften nicht für Schäden, die durch die Nutzung der Plattform entstehen, es sei denn, diese wurden durch Vorsatz oder grobe Fahrlässigkeit verursacht. Dies gilt nicht für Schäden an Leben, Körper oder Gesundheit.

**Haftungsausschluss im Detail:**
- Für Events, die von Nutzern erstellt werden, übernehmen wir keine Verantwortung
- Die Teilnahme an Events erfolgt auf eigene Verantwortung der Teilnehmer
- Für kostenpflichtige Transaktionen zwischen Event-Erstellern und Teilnehmern übernehmen wir keine Haftung
- Wir haften nicht für Schäden, die aus der Absage, Verschiebung oder Änderung eines Events entstehen
- Wir haften nicht für die Richtigkeit von Event-Informationen oder die Qualität der angebotenen Veranstaltungen

Für Event-Erstatter: Sie haften als Veranstalter für Ihre Events und stellen uns von allen Ansprüchen Dritter im Zusammenhang mit Ihren Events frei.`,
      },
      {
        heading: '12. Konto-Löschung und Vertragsbeendigung',
        text: `Sie können Ihr Konto jederzeit löschen lassen, indem Sie uns eine entsprechende Anfrage per E-Mail senden an: kontakt@spirituelle-events-vorarlberg.at.

Nach der Löschung werden alle Ihre personenbezogenen Daten gemäß unserer Datenschutzerklärung entfernt. Bereits veröffentlichte Events werden ebenfalls gelöscht, sofern sie keine wesentlichen Inhalte Dritter enthalten.

Wir behalten uns vor, Konten zu sperren oder zu löschen bei:
- Verstoß gegen diese AGB
- Rechtswidrigen Handlungen
- Missbrauch der Plattform
- Falschen oder irreführenden Event-Informationen`,
      },
      {
        heading: '13. Datenschutz',
        text: `Der Schutz Ihrer personenbezogenen Daten ist uns wichtig. Informationen zur Verarbeitung Ihrer Daten finden Sie in unserer Datenschutzerklärung (abrufbar unter /datenschutz).

Grundsätze:
- Wir speichern nur Daten, die für den Betrieb der Plattform notwendig sind
- Wir geben keine Daten an Dritte weiter
- Wir nutzen keine Tracking- oder Analysetools
- Firebase (Google) fungiert als Auftragsverarbeiter gemäß Art. 28 DSGVO`,
      },
      {
        heading: '14. Änderungen dieser AGB',
        text: `Wir behalten uns vor, diese AGB bei Bedarf zu ändern, insbesondere bei:

- Änderungen der Plattform-Funktionalität
- Rechtlichen Anforderungen
- Erweiterung der angebotenen Dienste

Die aktuelle Version finden Sie immer auf dieser Seite. Die geänderten AGB gelten für die Nutzung nach dem Zeitpunkt ihrer Veröffentlichung. Bei wesentlichen Änderungen werden wir Sie beim nächsten Login darauf hinweisen.`,
      },
      {
        heading: '15. Schlussbestimmungen',
        text: `Es gilt das Recht der Republik Österreich unter Ausschluss des UN-Kaufrechts (CISG) und der Verweisungsnormen des Internationalen Privatrechts.

Sollten einzelne Bestimmungen dieser AGB unwirksam sein oder werden, so bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. An die Stelle der unwirksamen Bestimmung tritt eine wirksame Regelung, die dem mit der unwirksamen Bestimmung verfolgten Zweck möglichst nahekommt.

Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesen AGB ist, soweit gesetzlich zulässig, der Sitz des Betreibers in Österreich.

Anbieter:
tribe Vorarlberg
Thomas Ender
Starkenfeld 19, 6841 Mäder, Österreich
E-Mail: kontakt@spirituelle-events-vorarlberg.at`,
      },
    ],
  },
};

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
          <Link to="/" className="btn btn-secondary">
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
