import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import './LegalPage.css';
import { CANDLE_ROOM_NAME } from '../utils/candleRoom';
import { useRegion } from '../hooks/useRegion';
import { instagramChannels, instagramProfileUrl } from '../utils/regions';

// Dark launch: the per-region wording and the channel list only appear once at
// least two Instagram channels exist; with one channel the text stays as it was.
const MIN_CHANNELS_FOR_LIST = 2;

const content = {
  datenschutz: {
    title: 'Datenschutzerklärung',
    description:
      'Datenschutzerklärung von tribe Vorarlberg: welche Daten wir erheben, wie wir sie schützen und welche Rechte du hast.',
    lastUpdated: 'Oktober 2026',
    sections: [
      {
        heading: '1. Verantwortlicher',
        text: `Verantwortlicher für die Verarbeitung personenbezogener Daten im Sinne der DSGVO ist:

**Tribe Vorarlberg - Verein zur Förderung einer ganzheitlichen Lebensweise und Gesundheitsförderung**

ZVR-Zahl: 1865711062
Vordere Achmühlerstraße 17C
A-6850 Dornbirn
Vorarlberg / Österreich

E-Mail: [admin@thetribe.at](mailto:admin@thetribe.at)
Tel: +43 68181828713`,
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
- Name der Veranstalterin bzw. des Veranstalters
- Kontaktangaben zum Event (optional, z.B. Telefonnummer, E-Mail-Adresse oder Website, so wie Sie sie eingeben)

Diese Daten werden in Firestore (Firebase) gespeichert. Event-Bilder werden in Firebase Cloud Storage gespeichert.

Nach der Freigabe sind die Angaben zum Event, einschließlich Veranstalter-Name und Kontaktangaben, öffentlich auf der Website sichtbar. Sie erscheinen außerdem in den Kalenderdateien und im Kalender-Abo, die angemeldete Nutzer:innen herunterladen bzw. abonnieren können (siehe Abschnitt 13). Die E-Mail-Adresse Ihres Kontos wird dabei nicht veröffentlicht.

*Bei Nutzung des Kalender-Exports:*
- Ein zufällig erzeugter, persönlicher Kalender-Schlüssel, der Ihrem Konto zugeordnet ist (siehe Abschnitt 13)

*Bei Nutzung des Community-Chats (nur mit Login und bestätigter E-Mail-Adresse):*
- Ihre Chat-Nachrichten, Ihre Emoji-Reaktionen darauf, Ihr Anzeigename und Ihr Profilfoto sowie Zeitpunkt des Sendens (siehe Abschnitt 14)

*Bei Nutzung der Privatnachrichten (nur mit Login und bestätigter E-Mail-Adresse):*
- Ihre Privatnachrichten und Emoji-Reaktionen darauf, deren Zeitpunkt, die Konto-Kennungen der beiden Beteiligten sowie Ihre Einstellungen dazu (siehe Abschnitt 15)

*Bei aktiviertem Online-Status (freiwillig, standardmäßig aus):*
- Ein Zeitstempel Ihrer letzten Aktivität auf der Website (siehe Abschnitt 16)

*Beim Aufruf der Website:*
- Technische Zugriffsdaten in Server-Protokollen (siehe Abschnitt 9)`,
      },
      {
        heading: '3. Zweck und Rechtsgrundlage der Verarbeitung',
        text: `Wir verarbeiten Ihre Daten auf Grundlage folgender Rechtsgrundlagen:

*Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO):*
- Registrierung und Authentifizierung
- Verwaltung Ihrer Events
- Kalender-Export und Kalender-Abo, wenn Sie diese Funktion nutzen (siehe Abschnitt 13)

*Einwilligung (Art. 6 Abs. 1 lit. a DSGVO):*
- Statistik mit Google Analytics (siehe Abschnitt 7)
- Veröffentlichung im Verzeichnis und auf Instagram (siehe Abschnitte 11 und 12)

*Berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO):*
- Bereitstellung der App-Funktionalität
- Sicherstellung des ordnungsgemäßen Betriebs und der Sicherheit, einschließlich der Server-Protokolle (siehe Abschnitt 9)
- Veröffentlichung der freigegebenen Event-Angaben, auch in Kalenderdateien und im Kalender-Abo (siehe Abschnitt 13)`,
      },
      {
        heading: '4. Keine Weitergabe an Dritte',
        text: `Wir geben Ihre personenbezogenen Daten nicht an Dritte weiter (Ausnahmen: die freiwillige Veröffentlichung Ihrer Events auf Instagram mit Ihrer Einwilligung, siehe Abschnitt 12, sowie die Nutzungsstatistik mit Google Analytics, die nur mit Ihrer Einwilligung erfolgt, siehe Abschnitt 7). Ihre Daten werden nicht verkauft, vermietet oder in sonstiger Weise an externe Unternehmen oder Organisationen übermittelt.

Firebase (Google) fungiert als Auftragsverarbeiter und erhält Ihre Daten nur insoweit, als dies für die Bereitstellung der Authentifizierungs-, Datenbank- und Hosting-Dienste erforderlich ist.

Wenn Sie den Kalender in einer Kalender-App oder bei einem Kalenderdienst (z.B. Google Kalender) abonnieren, ruft dieser Dienst die öffentlichen Event-Daten auf Ihre Veranlassung bei uns ab (siehe Abschnitt 13).`,
      },
      {
        heading: '5. Speicherdauer',
        text: `Wir speichern Ihre Daten so lange, wie Sie Ihr Konto aktiv nutzen:

- *Account-Daten:* Werden gelöscht, sobald Sie Ihr Konto löschen
- *Events:* Werden gelöscht, wenn Sie diese löschen oder Ihr Konto entfernen lassen
- *Kalender-Schlüssel:* Wird gelöscht, sobald Sie Ihr Konto löschen; wenn Sie einen neuen Kalender-Link erzeugen, wird der alte Schlüssel ersetzt
- *Chat-Nachrichten:* Werden automatisch nach 10 Tagen gelöscht, beim Löschen Ihres Kontos sofort (siehe Abschnitt 14)
- *Privatnachrichten:* Werden automatisch nach 90 Tagen gelöscht, beim Löschen Ihres Kontos werden Ihre Nachrichten sofort entfernt (siehe Abschnitt 15)
- *Online-Status:* Der Zeitstempel wird beim Verlassen der Seite, beim Abmelden und beim Ausschalten der Option gelöscht, spätestens nach einem Tag automatisch (siehe Abschnitt 16)
- *Server-Protokolle:* Siehe Abschnitt 9

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
        heading: '7. Statistik mit Google Analytics (nur mit Einwilligung)',
        text: `Wir möchten verstehen, wie diese Website genutzt wird, um sie zu verbessern und mehr Menschen zu erreichen. Dafür verwenden wir Google Analytics 4, einen Dienst der Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. Google Analytics wird über Firebase eingebunden.

*Nur mit Ihrer Einwilligung:*
- Google Analytics wird erst aktiv, wenn Sie im Hinweis beim ersten Besuch auf „Akzeptieren“ klicken. Wenn Sie „Ablehnen“ wählen oder keine Auswahl treffen, wird Google Analytics nicht geladen, es werden keine Daten an Google gesendet und es wird kein Analyse-Cookie gesetzt
- Die Seite können Sie in beiden Fällen uneingeschränkt nutzen

*Rechtsgrundlage:* Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) sowie § 165 Abs. 3 TKG 2021 für das Speichern und Auslesen von Informationen auf Ihrem Endgerät (Cookies).

*Welche Daten werden verarbeitet?*
- Gekürzte (anonymisierte) IP-Adresse
- Geräte- und Browserinformationen (z.B. Gerätetyp, Betriebssystem, Browser, Sprache)
- Aufgerufene Seiten und Ihre Interaktionen auf der Website (z.B. Klicks, Favoriten, Teilen, Filter)
- Eine pseudonyme Kennung, die in Cookies gespeichert wird (Cookies mit dem Namen „_ga“ bzw. „_ga_“ und der Mess-ID)

Wir erfassen in der Statistik keine E-Mail-Adressen, Namen oder Freitext-Eingaben und führen keine Daten mit Ihrem Benutzerkonto zusammen. Besuche von Administrator:innen werden nicht gezählt.

*Speicherdauer:* Die Ereignisdaten werden bei Google Analytics nach 2 Monaten automatisch gelöscht. Die Cookies bleiben bis zu 2 Jahre auf Ihrem Gerät gespeichert, sofern Sie sie nicht vorher löschen.

*Keine Werbenutzung:* Wir verwenden keine Google-Signale und keine Werbepersonalisierung. Es werden keine Werbeprofile erstellt, und die Daten werden nicht mit Werbediensten von Google verknüpft. Die Datenfreigabe an Google für eigene Zwecke (z.B. Benchmarking, Produktverbesserung) haben wir deaktiviert.

*Übermittlung in Drittländer:* Google kann Daten auch in die USA übermitteln. Google LLC ist unter dem EU-US Data Privacy Framework zertifiziert, für das die Europäische Kommission ein angemessenes Datenschutzniveau festgestellt hat. Zusätzlich besteht ein Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO mit Google.

*Widerruf:* Sie können Ihre Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen, indem Sie im Seitenende (Footer) auf „Cookie-Einstellungen“ klicken und „Ablehnen“ wählen. Danach werden keine weiteren Daten mehr gesendet. Die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt unberührt. Bereits gesetzte Cookies können Sie zusätzlich in Ihrem Browser löschen.

Weitere Informationen finden Sie in der Datenschutzerklärung von Google: [https://policies.google.com/privacy](https://policies.google.com/privacy)`,
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
- Bereitstellung der Website und der Server-Funktionen (Firebase Hosting, Cloud Functions), z.B. für den Kalender-Export
- Nutzungsstatistik (Google Analytics, nur mit Ihrer Einwilligung, siehe Abschnitt 7)

Die Datenverarbeitung durch Firebase erfolgt auf Grundlage eines Auftragsverarbeitungsvertrags gemäß Art. 28 DSGVO. Google verarbeitet Daten ausschließlich nach unserer Weisung und nicht für eigene Zwecke.

*Server-Protokolle:* Bei jedem Aufruf der Website und ihrer Server-Funktionen (z.B. beim Abruf einer Kalenderdatei oder des Kalender-Abos) werden technisch bedingt Zugriffsdaten protokolliert: Ihre IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse sowie die Angaben Ihres Browsers bzw. Ihrer Kalender-App (User-Agent). Diese Protokolle werden von Google als Auftragsverarbeiter erstellt und gespeichert. Wir nutzen sie ausschließlich, um den Betrieb und die Sicherheit der Website zu gewährleisten und Fehler oder Missbrauch zu erkennen, und führen sie nicht mit anderen Daten zusammen. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und funktionsfähigen Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Die Protokolle werden nur so lange gespeichert, wie es für Betrieb und Sicherheit erforderlich ist, und danach automatisch gelöscht.

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
        heading: '11. Verzeichnis (freiwillig)',
        text: `Auf der Seite „Verzeichnis“ können sich Nutzer:innen freiwillig eintragen, um mit ihren Angeboten gefunden zu werden, auch wenn sie keine Events veranstalten.

*Was wird veröffentlicht?*
- Nur wenn Sie in Ihrem Profil ausdrücklich zustimmen („Ich möchte im Verzeichnis gelistet werden“), erscheinen Ihr Name, Ihr Profilfoto, Ihre Kurzbeschreibung, die von Ihnen gewählten Kategorien und optional Ihre Region im Verzeichnis
- Kontaktdaten und weitere Details sind nicht im Verzeichnis, sondern nur auf Ihrem öffentlichen Profil sichtbar
- Die Einträge sind öffentlich und können von jedem eingesehen und durchsucht werden

*Rechtsgrundlage:* Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Ohne Ihre Zustimmung werden Sie nicht gelistet.

*Widerruf und Löschung:*
- Sie können die Eintragung jederzeit in Ihrem Profil wieder ausschalten; Sie verschwinden dann sofort aus dem Verzeichnis
- Beim Löschen Ihres Kontos wird auch Ihr Verzeichniseintrag entfernt

*Moderation:* Das Team von The Tribe kann einzelne Einträge aus dem Verzeichnis ausblenden, etwa bei unpassenden oder rechtswidrigen Inhalten. Ihr Profil bleibt davon unberührt.`,
      },
      {
        heading: '12. Veröffentlichung auf Instagram (freiwillig)',
        channelList: true,
        text: (ctx) => {
          const multi = ctx.channels.length >= MIN_CHANNELS_FOR_LIST;
          return `${
            multi
              ? 'Wir betreiben für unsere Regionen eigene Instagram-Kanäle, auf denen wir Veranstaltungen der jeweiligen Region bewerben. Instagram ist ein Dienst von Meta Platforms Ireland Limited.'
              : 'Wir betreiben den Instagram-Kanal @tribevorarlberg, auf dem wir Veranstaltungen bewerben. Instagram ist ein Dienst von Meta Platforms Ireland Limited.'
          }

*Was wird veröffentlicht?*
- Nur wenn Sie beim Erstellen oder Bearbeiten eines Events ausdrücklich zustimmen, wird Ihr Event auf ${multi ? 'dem Instagram-Kanal der Region Ihres Events' : 'unserem Instagram-Kanal'} veröffentlicht (als Beitrag und in wöchentlichen Übersichten je Bezirk)
- Veröffentlicht werden die Angaben zum Event (Titel, Datum, Uhrzeit, Ort, Beschreibung, Bild und ein Link zur Event-Seite)
- Wenn Sie in Ihrem Profil einen Instagram-Namen angegeben haben, markieren wir Ihr Instagram-Profil im Bild des Beitrags, laden es als Co-Autor (Collab) zum Beitrag ein und erwähnen es in der Beschreibung („@name“). Die Einladung müssen Sie in Instagram selbst annehmen; kann sie nicht gesendet werden, wird der Beitrag ohne Einladung veröffentlicht
- Sie können in Ihrem Profil festlegen, ob die Zustimmung für neue Events standardmäßig gesetzt sein soll; sie ist standardmäßig ausgeschaltet. Pro Event können Sie diese Einstellung ändern

*Rechtsgrundlage:* Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Ohne Ihre Zustimmung wird Ihr Event nicht auf Instagram veröffentlicht und Ihr Profil weder markiert noch eingeladen noch erwähnt.

*Weitergabe:* Mit der Veröffentlichung werden die genannten Inhalte an Instagram (Meta) übermittelt und sind dort öffentlich sichtbar. Für die Verarbeitung durch Instagram gilt die Datenschutzerklärung von Meta.${
            multi
              ? ' Meta Platforms Ireland Limited ist für die Verarbeitung auf Instagram ein eigener Verantwortlicher.'
              : ''
          }

*Widerruf und Löschung:*
- Sie können Ihre Zustimmung jederzeit für künftige Events ausschalten
- Möchten Sie, dass ein bereits veröffentlichter Beitrag entfernt wird, senden Sie uns eine E-Mail an admin@thetribe.at; wir löschen den Beitrag in angemessener Frist`;
        },
      },
      {
        heading: '13. Kalender-Export und Kalender-Abo (nur mit Login)',
        text: `Angemeldete Nutzer:innen können einzelne Events als Kalenderdatei (.ics) herunterladen oder den Veranstaltungskalender (auf Wunsch nach Ort und Kategorie gefiltert) in ihrer Kalender-App abonnieren, z.B. in Apple Kalender, Outlook oder Google Kalender. Diese Funktion steht nur mit Login zur Verfügung.

*Persönlicher Kalender-Link:*
- Kalender-Apps können sich nicht bei uns anmelden. Deshalb erzeugen wir beim ersten Aufruf der Funktion einen zufälligen, persönlichen Schlüssel, der mit Ihrem Konto gespeichert wird (Cloud Firestore) und Teil Ihrer Kalender-Links ist. Nur mit einem gültigen Schlüssel liefern wir die Kalenderdaten aus
- Jede Person, die Ihren Link kennt, kann damit die darin enthaltenen öffentlichen Event-Daten abrufen. Behandeln Sie den Link deshalb wie ein Passwort und geben Sie ihn nicht weiter
- Unter „im eigenen Kalender speichern“ können Sie jederzeit einen neuen Link erzeugen; der alte Link funktioniert danach nicht mehr. Bereits zwischengespeicherte Kalenderdaten können über den alten Link noch etwa eine Stunde lang abrufbar sein
- Beim Löschen Ihres Kontos wird der Schlüssel gelöscht, Ihre Kalender-Links funktionieren danach nicht mehr

*Was enthält die Kalenderdatei bzw. das Abo?*
- Nur freigegebene, öffentliche Events: Titel, Datum, Uhrzeit, Ort, Beschreibung, Name der Veranstalterin bzw. des Veranstalters, die Kontaktangaben zum Event und einen Link zur Event-Seite
- Keine E-Mail-Adressen von Benutzerkonten und keine Angaben über Sie als Abonnent:in

*Abruf durch Kalender-Apps:*
- Wenn Sie den Kalender abonnieren, ruft Ihre Kalender-App bzw. Ihr Kalenderdienst den Link regelmäßig selbstständig ab, bei Online-Kalendern wie Google Kalender von den Servern des jeweiligen Anbieters aus. Dabei entstehen die in Abschnitt 9 beschriebenen Server-Protokolle
- Heruntergeladene oder abonnierte Termine werden in Ihrer Kalender-App gespeichert. Kopien bleiben dort, bis Sie sie löschen bzw. bis zur nächsten Aktualisierung des Abos; darauf haben wir keinen Einfluss
- Wenn Sie den Link „Google Kalender“ verwenden, wird das Abo bei Google (Google Ireland Limited) eingerichtet und von Google verarbeitet. Dafür gilt die Datenschutzerklärung von Google: [https://policies.google.com/privacy](https://policies.google.com/privacy)

*Rechtsgrundlage:* Die Erzeugung und Speicherung des Schlüssels und die Bereitstellung der Kalenderdaten erfolgen, weil Sie diese Funktion nutzen (Art. 6 Abs. 1 lit. b DSGVO). Die Veröffentlichung der Event-Angaben, einschließlich Veranstalter-Name und Kontaktangaben, in Kalenderdateien und im Abo beruht auf unserem berechtigten Interesse, die freigegebenen Events möglichst gut auffindbar zu machen, sowie dem Interesse der Veranstalter:innen an der Bewerbung ihrer Events (Art. 6 Abs. 1 lit. f DSGVO).`,
      },
      {
        heading: `14. Community-Chat „Lagerfeuer“ und „${CANDLE_ROOM_NAME}“`,
        text: `Angemeldete Nutzer:innen mit bestätigter E-Mail-Adresse können im Chat „Lagerfeuer“ mit anderen Mitgliedern schreiben. Der Chat steht nur mit Login zur Verfügung und ist nicht öffentlich im Internet sichtbar.

*Welche Daten verarbeiten wir?*
- Ihre Nachricht (Text und Emojis), der Zeitpunkt des Sendens, Ihr Anzeigename und Ihr Profilfoto (so wie in Ihrem Profil hinterlegt; ohne Foto wird der Anfangsbuchstabe Ihres Namens angezeigt) sowie eine interne Konto-Kennung
- Zeitpunkt Ihrer letzten Nachricht (technisch notwendig, um Spam durch zu schnelles Senden zu verhindern)
- Wenn Sie auf eine Nachricht mit einem Emoji reagieren: welches Emoji, zusammen mit Ihrer Konto-Kennung. Die Reaktion ist für alle sichtbar, die die Nachricht sehen, Sie können sie jederzeit zurücknehmen, und sie wird mit der Nachricht gelöscht
- Solange Sie den Chat geöffnet haben, speichern wir kurzzeitig Ihren Anzeigenamen, Ihr Profilfoto und den Zeitpunkt Ihrer letzten Aktivität, damit andere Mitglieder sehen, wer gerade im Chat ist und wie viele Personen es sind. Der Eintrag wird beim Verlassen des Chats gelöscht, spätestens nach einem Tag automatisch. Die Anzeige sehen nur angemeldete Mitglieder mit bestätigter E-Mail-Adresse
- Bei Meldungen: der gemeldete Nachrichtentext samt Name der verfassenden Person, die meldende Konto-Kennung und der Zeitpunkt der Meldung
- Bei Sperren: die Dauer der Sperre und der Grund, den die Moderation vermerkt hat

*Wer sieht Ihre Nachrichten?*
- Alle angemeldeten Mitglieder mit bestätigter E-Mail-Adresse sowie die Administrator:innen. Schreiben Sie deshalb nichts, was nicht alle Mitglieder lesen sollen. Verschicken Sie keine sensiblen Daten, insbesondere keine Gesundheitsdaten (Art. 9 DSGVO), und keine personenbezogenen Daten anderer
- Mitglieder können Nachrichten melden. Gemeldete Nachrichten und die Konto-Kennung der meldenden Person sehen nur die Administrator:innen. Bei einer neuen Meldung erhalten die Administrator:innen eine E-Mail

*Moderation:*
- Administrator:innen können Nachrichten löschen und Mitglieder für einen Zeitraum stumm schalten oder dauerhaft vom Chat ausschließen, etwa bei Beleidigungen, Spam, Hetze oder anderen Verstößen gegen die Chat-Regeln. Die Chat-Regeln werden beim ersten Betreten des Chats angezeigt; ob Sie sie bestätigt haben, speichern wir nur lokal in Ihrem Browser (Local Storage)

*Speicherdauer:*
- Chat-Nachrichten werden automatisch nach 10 Tagen gelöscht
- Sie können Ihre eigenen Nachrichten jederzeit selbst löschen
- Beim Löschen Ihres Kontos werden Ihre Chat-Nachrichten und Ihre Reaktionen gelöscht
- Meldungen werden spätestens nach 30 Tagen gelöscht. Ein Eintrag über eine Sperre bleibt, solange die Sperre gilt

*Chat-Räume zu einzelnen Events („${CANDLE_ROOM_NAME}“):*
- Auf der Seite eines freigegebenen Events kann es einen kleinen Chat-Raum geben, in dem sich Teilnehmende austauschen, etwa für Mitfahrgelegenheiten. Schreiben können nur angemeldete Mitglieder mit bestätigter E-Mail-Adresse; es gelten dieselben Daten, Chat-Regeln, Sperren, Löschfristen (10 Tage) und Löschung beim Löschen Ihres Kontos wie oben beschrieben
- *Anders als im Lagerfeuer ist der Verlauf öffentlich:* Wenn die Funktion für alle freigeschaltet ist, kann jede Person, die die Event-Seite aufruft, die Nachrichten mit Anzeigename und Profilfoto lesen, auch ohne Login. Schreiben Sie dort deshalb nur, was öffentlich sichtbar sein darf
- Zusätzlich speichern wir für jeden Raum den Zeitpunkt der letzten Nachricht, damit im Kalender eine Kerze auf neue Nachrichten hinweisen kann. Welche Nachrichten Sie schon gesehen haben, merkt sich nur Ihr Browser (Local Storage)

*Erwähnungen (@Name):*
- In Lagerfeuer und ${CANDLE_ROOM_NAME} können Mitglieder andere mit @Name erwähnen, nicht jedoch in Privatnachrichten. Erwähnt werden können nur Personen, die in ihrem Profil „Andere dürfen mich erwähnen“ eingeschaltet haben (Standard: aus; Einwilligung, jederzeit im Profil widerrufbar)
- Ist die Option eingeschaltet, speichern wir in Ihrem öffentlichen Profil zusätzlich Ihren Namen in vereinfachter Schreibweise (Kleinbuchstaben, ohne Akzente), damit Sie bei der Namenssuche nach dem @ gefunden werden. Beim Ausschalten wird dieser Eintrag gelöscht
- Wird eine Person erwähnt, steht ihre Konto-Kennung zusammen mit dem Namen in der Nachricht. Zusätzlich legen wir für sie eine Benachrichtigung an: Art des Raums, Titel des Events, Name der verfassenden Person, ein kurzer Textauszug der Nachricht und der Zeitpunkt. Sie erscheint nur in der Glocke im Kopfbereich der Seite für die erwähnte Person. Es werden keine E-Mails verschickt
- Die Benachrichtigung wird nach 10 Tagen automatisch gelöscht (wie die Nachricht), spätestens beim Löschen Ihres Kontos. Sie können sie auch selbst löschen

*Rechtsgrundlage:* Die Bereitstellung des Chats und die Anzeige Ihrer Nachrichten erfolgen, weil Sie die Funktion nutzen (Art. 6 Abs. 1 lit. b DSGVO). Moderation, Spam-Schutz und die Bearbeitung von Meldungen beruhen auf unserem berechtigten Interesse, den Chat sicher und frei von Missbrauch zu halten (Art. 6 Abs. 1 lit. f DSGVO).

*Verarbeitung:* Die Daten werden in Google Cloud Firestore (Firebase) gespeichert (siehe Abschnitt 9). Wir geben keine Chat-Inhalte an Dritte weiter und nutzen sie nicht für Werbung oder Statistik.

*Ihre Rechte:* Sie können jederzeit Auskunft über Ihre Chat-Daten verlangen und der Verarbeitung widersprechen (siehe Abschnitt 6). Möchten Sie, dass eine Nachricht von Ihnen vorzeitig entfernt wird, löschen Sie sie selbst im Chat oder schreiben Sie uns an admin@thetribe.at.`,
      },
      {
        heading: '15. Privatnachrichten (Postfach, nur mit Login)',
        text: `Angemeldete Nutzer:innen mit bestätigter E-Mail-Adresse können anderen Mitgliedern Privatnachrichten schreiben. Die Funktion steht nur mit Login zur Verfügung.

*Welche Daten verarbeiten wir?*
- Den Text Ihrer Nachrichten (inkl. Emojis), den Zeitpunkt, die Konto-Kennungen der beiden Beteiligten, einen kurzen Ausschnitt der letzten Nachricht für die Übersicht sowie den Zeitpunkt, bis zu dem eine Person die Unterhaltung gelesen hat (für die Anzeige „ungelesen“)
- Ihre Einstellung, ob Sie Privatnachrichten annehmen, und Ihre Liste blockierter Mitglieder. Diese Liste ist nur für Sie sichtbar
- Zur Begrenzung von Spam: Zeitpunkt und Anzahl der von Ihnen begonnenen Unterhaltungen pro Tag
- Wenn Sie auf eine Nachricht mit einem Emoji reagieren: welches Emoji, zusammen mit Ihrer Konto-Kennung. Sichtbar nur für die beiden Beteiligten; die Reaktion wird mit der Nachricht gelöscht

*Wer kann die Nachrichten lesen?*
- Nur die beiden Beteiligten. **Die Administrator:innen können Privatnachrichten nicht lesen.**
- Melden eine Person eine Unterhaltung, werden die letzten Nachrichten dieser Unterhaltung (bis zu sechs) als Kopie an die Administrator:innen übermittelt, damit diese über Maßnahmen entscheiden können. Nur diese Kopie ist für sie lesbar. Bei einer Meldung erhalten die Administrator:innen eine E-Mail, die keine Nachrichtentexte enthält
- Bitte schicken Sie keine sensiblen Daten, insbesondere keine Gesundheitsdaten (Art. 9 DSGVO). Die Nachrichten werden zwar nur für die Beteiligten freigegeben, sind aber nicht Ende-zu-Ende-verschlüsselt: Der Betreiber (Google Cloud Firestore) speichert sie in lesbarer Form auf den Servern

*Ihre Kontrolle:*
- Sie können Privatnachrichten in Ihrem Postfach ausschalten, Mitglieder blockieren (die blockierte Person erfährt das nicht und kann Ihnen nicht mehr schreiben) und eigene Nachrichten jederzeit löschen. Gelöscht ist sie dann bei beiden Beteiligten

*Speicherdauer:*
- Privatnachrichten werden automatisch nach 90 Tagen gelöscht
- Beim Löschen Ihres Kontos werden Ihre Nachrichten, Ihre Reaktionen, Ihre Einstellung und Ihre Blockierliste gelöscht. Nachrichten der anderen Person bleiben für diese bis zur automatischen Löschung bestehen; Ihr Name wird dann durch „Gelöschtes Mitglied“ ersetzt
- Meldungen werden spätestens nach 30 Tagen gelöscht

*Rechtsgrundlage:* Die Zustellung und Anzeige der Nachrichten erfolgt, weil Sie die Funktion nutzen (Art. 6 Abs. 1 lit. b DSGVO). Spam-Schutz, Moderation und die Bearbeitung von Meldungen beruhen auf unserem berechtigten Interesse, die Funktion sicher und frei von Missbrauch zu halten (Art. 6 Abs. 1 lit. f DSGVO). Ein vom Chat verhängter Ausschluss gilt auch für Privatnachrichten.

*Verarbeitung:* Die Daten werden in Google Cloud Firestore (Firebase) gespeichert (siehe Abschnitt 9). Wir geben sie nicht an Dritte weiter und nutzen sie nicht für Werbung oder Statistik. Wir senden keine E-Mail-Benachrichtigungen über neue Privatnachrichten.

*Ihre Rechte:* Siehe Abschnitt 6. Auskunft über Ihre Privatnachrichten erhalten Sie auf Anfrage an admin@thetribe.at.`,
      },
      {
        heading: '16. Online-Status (freiwillig)',
        text: `In Ihrem Profil können Sie die Option „Meinen Online-Status anzeigen“ einschalten. Sie ist **standardmäßig ausgeschaltet**; ohne Ihre Zustimmung wird nichts gespeichert oder angezeigt.

*Was passiert, wenn Sie die Option einschalten?*
- Solange Sie angemeldet sind und die Website geöffnet und sichtbar ist, speichern wir etwa einmal pro Minute einen Zeitstempel („zuletzt aktiv“) mit Ihrer Konto-Kennung
- Andere angemeldete Mitglieder mit bestätigter E-Mail-Adresse sehen neben Ihrem Foto, zum Beispiel im Verzeichnis, auf Ihrem Profil und im Postfach, einen grünen Punkt, wenn Sie gerade aktiv sind (Zeitstempel jünger als zwei Minuten), sonst einen roten Punkt. Besucher:innen ohne Anmeldung sehen keinen Status
- Mit der Einstellung wird außerdem gespeichert, dass Sie sie eingeschaltet haben. Diese Angabe ist Teil Ihres öffentlichen Profils, die Zeitstempel selbst sehen nur angemeldete Mitglieder

*Wenn Sie die Option ausgeschaltet lassen:* Es gibt keinen Punkt bei Ihrem Foto. Beachten Sie: Im Chat „Lagerfeuer“ (Abschnitt 14) sehen angemeldete Mitglieder unabhängig von dieser Option, wer den Chat gerade geöffnet hat.

*Speicherdauer:* Der Zeitstempel wird gelöscht, sobald Sie die Seite verlassen, sich abmelden oder die Option ausschalten, spätestens nach einem Tag automatisch. Beim Löschen Ihres Kontos wird er ebenfalls gelöscht.

*Rechtsgrundlage:* Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die Sie jederzeit mit Wirkung für die Zukunft widerrufen können, indem Sie die Option im Profil ausschalten.`,
      },
      {
        heading: '17. Ort, Umkreis und Standort (freiwillig)',
        text: `Damit wir Ihnen Veranstaltungen in Ihrer Nähe zeigen können, geben Sie einen Ort oder eine Region ein und wählen einen Umkreis. Alternativ können Sie auf „Meinen Standort verwenden“ klicken. Erst dann fragt Ihr Browser, ob er Ihren Standort mitteilen darf; ohne diesen Klick und ohne Ihre Erlaubnis wird kein Standort abgefragt.

- Die Suche nach Orten und Regionen läuft vollständig in Ihrem Browser mit einer in die App eingebauten Ortsliste. Ihre Eingabe wird dafür nicht an uns oder an andere Dienste gesendet
- Ein geteilter Standort wird nur einmal und nur in Ihrem Browser verwendet, um den nächstgelegenen Ort der Liste (und damit Ihre Region) zu finden. Der genaue Standort wird nicht an uns oder an andere Dienste übermittelt und nirgends gespeichert
- Gespeichert wird nur die Auswahl selbst: der Name des Ortes, dessen ungefähre Lage (auf den Ort gerundet), der Umkreis und die zugehörige Region. Ohne Konto bleibt das in Ihrem Browser (lokaler Speicher). Mit Konto wird die Auswahl zusätzlich in Ihrem Profil gespeichert, damit sie auf allen Ihren Geräten gilt. Sie können sie jederzeit im Menü oder in Ihrem Profil ändern; beim Löschen Ihres Kontos wird sie mit gelöscht
- Rechtsgrundlage ist unser berechtigtes Interesse, Ihnen passende Veranstaltungen anzuzeigen (Art. 6 Abs. 1 lit. f DSGVO), für den geteilten Standort Ihre Einwilligung im Browser (Art. 6 Abs. 1 lit. a DSGVO), die Sie jederzeit in den Einstellungen Ihres Browsers widerrufen können
- Ihr Browser bzw. Ihr Gerät ermittelt den Standort selbst und nutzt dafür je nach Gerät die Ortungsdienste des Herstellers (z.B. Google oder Apple); dafür gelten deren Datenschutzbestimmungen
- Die Ortsliste und die Grenzen liegen in der App selbst. Die Kartendaten wurden vereinfacht und damit verändert. Quellen: Orte und Postleitzahlen: [GeoNames](https://www.geonames.org), Lizenz [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); Österreich © BEV – Bundesamt für Eich- und Vermessungswesen, laut Angabe von geoBoundaries unter der Lizenz [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/); Schweiz © swisstopo (swissBOUNDARIES3D, [Nutzungsbedingungen](https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste)); Liechtenstein: Natural Earth (gemeinfrei)`,
      },
      {
        heading: '18. Änderungen dieser Datenschutzerklärung',
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

### Verantwortliche / Vereinsvorstand

#### Präsident

Peter Mathis

[info@petermathis.at](mailto:info@petermathis.at)

+4368181828713

#### Vizepräsident

Thomas Ender

[thomas@blissofkundalini.yoga](mailto:thomas@blissofkundalini.yoga)

+43 660 2673509`,
      },
      {
        heading: 'Onlinepräsenzen',
        text: (ctx) => {
          // One channel (today): the line as before. Several: one line per region.
          const instagramLines =
            ctx.channels.length >= MIN_CHANNELS_FOR_LIST
              ? ctx.channels
                  .map((c) => {
                    const url = instagramProfileUrl(c.handle);
                    return `- Instagram ${c.regionName}: [${url}](${url})`;
                  })
                  .join('\n')
              : '- Instagram: [https://www.instagram.com/tribevorarlberg](https://www.instagram.com/tribevorarlberg)';
          return `Dieses Impressum gilt auch für folgende Onlinepräsenzen:

- Facebook: [https://www.facebook.com/tribevorarlberg](https://www.facebook.com/tribevorarlberg)
${instagramLines}

E-Mail: [admin@thetribe.at](mailto:admin@thetribe.at)`;
        },
      },
      {
        heading: 'Kartendaten / Quellen',
        text: `Die Ortsliste für die Ortswahl stammt von [GeoNames](https://www.geonames.org) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Die Grenzen für die Regionswahl wurden vereinfacht und damit verändert. Österreich: © BEV – Bundesamt für Eich- und Vermessungswesen, laut Angabe von geoBoundaries unter der Lizenz [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). Schweiz: © swisstopo ([Nutzungsbedingungen](https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste)). Liechtenstein: Natural Earth (gemeinfrei).`,
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

### 5. Nutzung der Inhalte und Datenbank

Die Inhalte von The Tribe dürfen ausschließlich für private, nicht-kommerzielle Zwecke genutzt werden, etwa um sich über Veranstaltungen zu informieren, einzelne Termine im eigenen Kalender zu speichern oder Veranstaltungen im persönlichen Umfeld weiterzuempfehlen.

Ohne vorherige ausdrückliche schriftliche Zustimmung von The Tribe ist es nicht gestattet,

- Inhalte, insbesondere die Veranstaltungsdaten, Texte, Bilder und Veranstalterinformationen, ganz oder in wesentlichen Teilen zu kommerziellen Zwecken zu vervielfältigen, zu verbreiten, öffentlich zugänglich zu machen, zu verkaufen oder auf andere Weise weiterzuverwenden;
- die auf The Tribe veröffentlichten Daten systematisch oder automatisiert auszulesen, zu kopieren oder zu sammeln (z. B. durch Web-Scraping, Crawler, Bots, das Abrufen von Datenschnittstellen oder das Auswerten von Kalender-Feeds und Kalenderdateien);
- Inhalte von The Tribe in andere Plattformen, Datenbanken, Verzeichnisse, Kalender, Apps oder Dienste zu übernehmen oder dort automatisiert zu spiegeln;
- Inhalte von The Tribe zum Training, zur Weiterentwicklung oder zum Betrieb von KI-Systemen oder anderen automatisierten Verfahren der Datenanalyse zu verwenden;
- Schutzmechanismen, Zugangs- oder Nutzungsbeschränkungen von The Tribe zu umgehen.

Diese Einschränkungen gelten unabhängig davon, ob die Inhalte frei zugänglich sind. Die Zusammenstellung und Aufbereitung der Veranstaltungsdaten auf The Tribe kann als Datenbank bzw. Datenbankwerk nach dem österreichischen Urheberrechtsgesetz (§§ 40f und 76c ff. UrhG) geschützt sein. Die allgemeine Auffindbarkeit über Suchmaschinen im üblichen Umfang bleibt davon unberührt. Gesetzlich zwingend erlaubte Nutzungen (z. B. Vervielfältigungen zum privaten Gebrauch) bleiben ebenfalls unberührt.

Hinweis: Die Rechte an den von Veranstalter:innen bereitgestellten Inhalten verbleiben bei diesen. Auch aus diesem Grund kann The Tribe Dritten keine Weiterverwendungsrechte an solchen Inhalten einräumen. Eine Weiterverwendung von Veranstaltungsdaten bedarf daher gegebenenfalls zusätzlich der Zustimmung der jeweiligen Rechteinhaber:innen. Personenbezogene Angaben von Veranstalter:innen und Nutzer:innen dürfen nicht für Werbe- oder Adressierungszwecke gesammelt oder weiterverarbeitet werden.

Bei Verstößen behält sich The Tribe vor, Zugriffe zu sperren und zivil- und urheberrechtliche Schritte einzuleiten, insbesondere auf Unterlassung, Beseitigung, Auskunft, Schadenersatz und Herausgabe des Gewinns. Anfragen zu einer Nutzung der Inhalte richten Sie bitte an [admin@thetribe.at](mailto:admin@thetribe.at).

### 6. Änderungen des Online-Angebots

The Tribe behält sich ausdrücklich vor, Teile der Website oder das gesamte Online-Angebot jederzeit ohne gesonderte Ankündigung zu verändern, zu ergänzen, zu löschen oder die Veröffentlichung zeitweise oder dauerhaft einzustellen.

Für die Verfügbarkeit einzelner Inhalte, Veranstaltungen, Profile oder Funktionen kann keine Gewähr übernommen werden.

### 7. Haftung

The Tribe haftet nicht für Schäden materieller oder ideeller Art, die aus der Nutzung oder Nichtnutzung der auf der Plattform veröffentlichten Informationen, Veranstaltungen, Angebote oder extern verlinkten Websites entstehen, soweit gesetzlich zulässig und sofern kein vorsätzliches oder grob fahrlässiges Verhalten von The Tribe vorliegt.

Zwingende gesetzliche Haftungsbestimmungen bleiben unberührt.

### 8. Rechtswirksamkeit dieses Haftungsausschlusses

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

    if (line.startsWith('#### ')) {
      flush();
      blocks.push({ type: 'h5', text: line.substring(5) });
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
        if (block.type === 'h5') {
          return (
            <h5 key={blockIdx} className="legal-subsubsubheading">
              {renderInline(block.text, `h5-${blockIdx}`)}
            </h5>
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

function InstagramChannelList({ channels }) {
  return (
    <details className="legal-details" data-testid="legal-instagram-channels">
      <summary>Unsere Instagram-Kanäle ({channels.length})</summary>
      <ul className="legal-list">
        {channels.map((c) => (
          <li key={c.regionId}>
            {c.regionName}:{' '}
            <a
              className="legal-link"
              href={instagramProfileUrl(c.handle)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.handle}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function LegalPage({ page }) {
  const data = content[page];
  // Channels of the active regions (Vorarlberg: code default when no handle is stored).
  const { regions } = useRegion();
  const channels = instagramChannels(regions);

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
              <LegalText
                text={
                  typeof section.text === 'function' ? section.text({ channels }) : section.text
                }
              />
              {section.channelList && channels.length >= MIN_CHANNELS_FOR_LIST && (
                <InstagramChannelList channels={channels} />
              )}
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
