# Testprotokoll: Event-Lifecycle-E-Mails

_Test-Protokoll für die automatischen Benachrichtigungs-E-Mails, die beim Lebenszyklus eines Events ausgelöst werden. Voraussetzung: Funktionen sind deployt (`firebase deploy --only functions`), Mailgun-Domain `mg.thetribe.at` ist verifiziert, die Secrets `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM`, `MAILGUN_REPLY_TO` sind gebunden. `MAILGUN_FROM` ist der angezeigte Absender (`The Tribe <admin@mg.thetribe.at>`), `MAILGUN_REPLY_TO` ist die Adresse, an die Antworten gehen (`admin@thetribe.at`, Outlook-365-Posteingang)._

## 1. „Neuer Event-Vorschlag" (Submitted → an alle Admins)

- **Wer löst aus:** beliebiger User
- **Aktion:** Event im Wizard erstellen, am Ende „Einreichen" klicken
- **Empfänger:**
  - Optional: eine geteilte Team-Inbox (Secret `SUBMITTED_NOTIFICATION_INBOX`, z. B. `admin@thetribe.at`), wenn das Secret gesetzt ist — wird zusätzlich zu den Admins aus `admin_users` angeschrieben
  - alle Admins (aufgelöst über die `admin_users`-Collection und Firebase Auth)
  - Doppelte Empfänger werden dedupliziert (Groß-/Kleinschreibung + Whitespace ignoriert)
- **Betreff:** `Neuer Event-Vorschlag: {Titel}`
- **Inhalt:** Name des Einreichers + Button „Im Review ansehen" (Link zu `/admin?tab=review#<eventId>`)
- **Verifizieren:**
  - Mailgun Dashboard → Sending → Logs → Filter `mg.thetribe.at` → Status `delivered`, To enthält alle Admin-Adressen (inkl. Team-Inbox, falls gesetzt). Auf einer Nachricht: Header prüfen → `From` ist `The Tribe <admin@mg.thetribe.at>`, `Reply-To` ist `admin@thetribe.at`.
  - Function Log: `firebase functions:log --only onEventCreated,onEventStatusChanged -n 50` → Meldung `submitted notification processed`, `recipients` = Anzahl Empfänger. Bei einem brandneuen Event ist `onEventCreated` der Auslöser; bei einem Re-Submit aus Entwurf/Papierkorb `onEventStatusChanged`.
  - Bei `recipients: 0` stimmt etwas mit `admin_users` nicht (kein Doc vorhanden oder Auth-User fehlt) UND es ist keine `SUBMITTED_NOTIFICATION_INBOX` gesetzt

## 2. „Dein Event ist live" (Published → an Ersteller)

- **Wer löst aus:** Admin
- **Aktion:** Im Bereich „Review" das pending Event öffnen, „Genehmigen" klicken
- **Empfänger:** Ersteller des Events (`event.organizer.email`)
- **Betreff:** `Dein Event ist live: {Titel}`
- **Inhalt:** Glückwunsch + Button „Event ansehen" (Link zu `/event/<slug>`)
- **Verifizieren:**
  - Mailgun Logs → 1× delivered an die Ersteller-Adresse
  - Function Log: `published notification processed`, `recipients: 1`
  - Kein Mail? → `organizer.email` ist im Event leer; in diesem Fall entscheidet die Routing-Logik bereits gegen eine Mail (`decideEventStatusNotification` → null)

## 3. „Änderungen gewünscht" (Changes Requested → an Ersteller)

- **Wer löst aus:** Admin (im Event-Detail bei Status `pending` oder `draft`)
- **Aktion:** Im Nachrichtenfeld einen Text eingeben und „Senden"
- **Empfänger:** Ersteller des Events
- **Betreff:** `Änderungen gewünscht: {Titel}`
- **Inhalt:** persönliche Anrede + der Nachrichtentext 1:1 inline (HTML-escaped) + Button „Event bearbeiten"
- **Verifizieren:**
  - Mailgun Logs → 1× delivered, Subject enthält den Eventtitel
  - Function Log: `changes_requested notification processed`, `recipients: 1`
  - Im Ersteller-Postfach: eingebetteter Text muss zeichengenau dem geschriebenen Admin-Text entsprechen
- **Wichtig:** Triggert nur bei `authorRole: "Admin"`. Antworten eines Users auf eine Admin-Nachricht lösen **keine** E-Mail aus (gewollt).
- **Ausnahme Ablehnungsgrund:** Eine Nachricht aus dem Dropdown „Ablehnungsgründe“ (Feld `kind: "rejection"`) löst **keine** „Änderungen gewünscht“-Mail aus; der Text geht mit der Ablehnungsmail (Abschnitt 4a) raus. Im Composer und an der Nachricht steht dafür „E-Mail erst beim Ablehnen“. Wird das Häkchen „Als Ablehnungsgrund senden“ entfernt, ist es eine normale Nachricht mit Mail.

## 4. „Dein Event wurde gelöscht" (Deleted → an Ersteller)

- **Wer löst aus:** User oder Admin
- **Aktion:** „In Papierkorb" auf dem Event (EventList, EventDetail oder Edit-Form), Bestätigungsdialog → OK
- **Empfänger:** Ersteller
- **Betreff:** `Dein Event wurde gelöscht: {Titel}`
- **Inhalt:** Hinweis + Hinweis auf „Papierkorb"-Tab zur Wiederherstellung
- **Verifizieren:**
  - Mailgun Logs → 1× delivered
  - Function Log: `deleted notification processed`, `recipients: 1`
- **Wichtig:** Triggert bei **jedem** Übergang nach `trashed` (von `draft`, `pending` oder `approved`), außer bei einer Ablehnung (`trashKind: "rejected"`, siehe 4a).

## 4a. „Dein Event wurde abgelehnt" (Rejected → an Ersteller)

- **Wer löst aus:** Super-Admin oder Regions-Moderator:in, nur bei einem fremden Event im Status `pending`
- **Voraussetzung:** Im Nachrichtenbereich des Events steht mindestens eine Staff-Nachricht (`authorRole: "Admin"`), am besten aus „Ablehnungsgründe“. Sonst ist „Ablehnen“ im Dialog gesperrt und zeigt „Bitte zuerst im Nachrichtenbereich einen Grund schreiben“ mit Link zum Event.
- **Aktion:** Review → Button „Ablehnen“ (Verbotsschild) → Dialog zeigt die neueste Staff-Nachricht als Grund → „Ablehnen“
- **Ergebnis:** Event im Papierkorb (`status: "trashed"`, `trashKind: "rejected"`, `trashReason` = Nachrichtentext als Klartext, max. 2000 Zeichen); der Nachrichtenverlauf bleibt erhalten
- **Empfänger:** Ersteller (Einstellung „Gelöscht“-Mails, `notifyOnDeleted`)
- **Betreff:** `Dein Event wurde abgelehnt: {Titel}`
- **Inhalt:** freundliche Anrede, Grund als Zitat (HTML-escaped), Hinweis auf „Papierkorb“ (30 Tage) mit Wiederherstellen, Überarbeiten und erneut Einreichen; bei mehreren aktiven Regionen die Zeile „Rückfragen zu dieser Region“
- **Verifizieren:**
  - Mailgun Logs → 1× delivered; **keine** zusätzliche „Dein Event wurde gelöscht“-Mail und (bei Vorlage) keine „Änderungen gewünscht“-Mail
  - Function Log: `rejected notification processed`, `recipients: 1`
- **Negativtests:** eigenes Event → kein „Ablehnen“-Button; freigegebenes Event → kein „Ablehnen“-Button; Wiederherstellen aus dem Papierkorb setzt `trashKind` zurück (späteres normales Löschen schickt wieder die Lösch-Mail)

## 5. „Einladung ins Moderations-Team" (an die eingeladene Person) und „Neue Moderator:in" (an Super-Admins)

- **Wer löst aus:** Super-Admin in Verwaltung → „Moderation" → „Per E-Mail einladen" (oder „Erneut senden" in der Liste „Offene Einladungen")
- **Empfänger:** die eingegebene Adresse (klein geschrieben)
- **Betreff:** `Einladung ins Moderations-Team vom Tribe {Region}` (mehrere Regionen: `Tribe A und Tribe B`)
- **Inhalt:** Einladungstext + Button „Einladung annehmen" (Link `/einladung?t=<token>`, auf Staging zur Staging-Seite), „gilt bis {Datum}" (14 Tage), Hinweis auf die Adresse
- **Danach:** Link öffnen → anmelden oder Konto anlegen (mit derselben Adresse) → Wizard durchklicken, Häkchen setzen, mit Namen unterschreiben → „Willkommen im Team!". Jetzt geht an **alle Super-Admins** je eine Mail `Neue Moderator:in: {Name} ({Tribe Region})` mit Button „Moderation ansehen".
- **Verifizieren:**
  - Mailgun Logs → 1× delivered an die eingeladene Adresse; nach der Annahme je 1× an jede Super-Admin-Adresse
  - Function Log: `firebase functions:log --only adminCreateModeratorInvite,acceptModeratorInvite -n 50` → `emailSent: true` bzw. `alreadyAccepted: false`
  - Schlägt der Versand fehl (z. B. Staging mit Dummy-Mailgun), bleibt die Einladung gültig: der Dialog zeigt „konnte nicht gesendet werden" und „Link kopieren"
- **Negativtests:** zweites Öffnen eines angenommenen Links → „schon angenommen", keine Mail; widerrufener oder abgelaufener Link → keine Rolle, keine Mail; „Link kopieren" bei einer älteren Einladung erzeugt einen neuen Link **ohne** Mail (der Link aus der ersten Mail funktioniert danach nicht mehr)

## 6. „Neue Nachricht von {Name}" (Postfach → an die angeschriebene Person)

- **Voraussetzung:** `app_settings/messenger` steht auf `all` (bei `admins` bekommen nur Admins als Empfänger eine Mail). Zwei Konten mit bestätigter E-Mail-Adresse.
- **Wer löst aus:** Mitglied A schreibt Mitglied B im Postfach (`/postfach/<uid von B>`)
- **Empfänger:** B (Adresse aus Firebase Auth), Einstellung „Neue Privatnachricht" (`notifyOnDirectMessage`, Standard an)
- **Betreff:** `Neue Nachricht von {Anzeigename von A}`
- **Inhalt:** Anrede, Name von A, Textauszug (ca. 140 Zeichen, an einer Wortgrenze mit „…" gekürzt, eine Zeile), Button „Nachricht lesen und antworten" (Link `/postfach/<uid von A>`), Hinweis „höchstens einmal pro Stunde", Fußzeile mit Link zu den Benachrichtigungseinstellungen
- **Drossel:** pro Unterhaltung und Empfänger höchstens 1 Mail pro Stunde. Zweite Nachricht von A innerhalb der Stunde → keine Mail; Antwort von B an A → A bekommt seine eigene erste Mail.
- **Verifizieren:**
  - Mailgun Logs → 1× delivered an B
  - Function Log: `firebase functions:log --only onDirectMessageMailNotify -n 50` → `Direct message mail processed` (`sent: true`), bei der zweiten Nachricht `Direct message mail throttled`
  - Link in der Mail öffnet direkt die Unterhaltung mit A
- **Negativtests (keine Mail, Log `Direct message mail skipped` mit `reason`):** B hat den Schalter im Profil aus (`opted_out`), B hat A blockiert oder umgekehrt (`blocked`), B nimmt keine Privatnachrichten an (`no_direct_messages`, Senden scheitert dann ohnehin), A ist im Chat stumm geschaltet/gesperrt (`author_banned`), Flag `off` (gar kein Log), Konto gelöscht/deaktiviert (`author_inactive` / `recipient_inactive`), B ohne bestätigte Adresse (`recipient_unverified`)

## 7. „Neue Nachricht im Event Chat: {Titel}" (Event Chat → an die Veranstalter:in)

- **Voraussetzung:** `app_settings/chat` steht auf `all` (bei `admins`: nur Admins als Veranstalter:in). Ein freigegebenes Event von Konto V, ein zweites Konto G mit bestätigter E-Mail-Adresse.
- **Wer löst aus:** G schreibt im Event Chat auf der Event-Seite von V
- **Empfänger:** V (`events.createdBy`, Adresse aus Firebase Auth), Einstellung „Event Chat deiner Veranstaltungen" (`notifyOnEventChat`, Standard an)
- **Betreff:** `Neue Nachricht im Event Chat: {Titel}`
- **Inhalt:** Anrede, Eventtitel, Name von G, Textauszug (wie oben), Button „Zum Event Chat" (Link `/event/<slug>#kerzenraum`), Hinweis „höchstens einmal pro Tag", Fußzeile mit Link zu den Benachrichtigungseinstellungen
- **Drossel:** höchstens 1 Mail pro Veranstalter:in und Kalendertag (Zeitzone Wien), **über alle Events zusammen**. Zweite Nachricht am selben Tag (auch in einem anderen Event von V) → keine Mail; ab Mitternacht wieder.
- **Verifizieren:**
  - Mailgun Logs → 1× delivered an V
  - Function Log: `firebase functions:log --only onKerzenraumMailNotify -n 50` → `Event chat mail processed`, danach `Event chat mail throttled`
- **Negativtests (keine Mail):** V schreibt selbst (`author_is_organizer`), Schalter aus (`opted_out`), V hat G im Postfach blockiert (`blocked`), G gesperrt (`author_banned`), Flag `off`

## Was **nicht** zu einer E-Mail führt (Negativtests)

| Aktion                                                                     | Erwartung                                |
| -------------------------------------------------------------------------- | ---------------------------------------- |
| Admin klickt „Zu Entwurf" (pending → draft)                                | keine E-Mail                             |
| Admin stellt Event aus Papierkorb wieder her                               | keine E-Mail                             |
| Admin klickt „Endgültig löschen"                                           | keine E-Mail (Doc ist weg, kein Trigger) |
| User schreibt eine Nachricht an Admin (`authorRole: "User"`)               | keine E-Mail                             |
| Andere Felder werden geändert (`title`, `category`, …) ohne Status-Wechsel | keine E-Mail                             |
| Nachricht im Chat „Lagerfeuer“ oder eine @Erwähnung                        | keine E-Mail (nur die Glocke)            |

## Wiederkehrende Verifikations-Tools

```bash
# Aktuelle Logs (einmalig, letzte 50 Zeilen)
firebase functions:log --only onEventCreated,onEventStatusChanged,onAdminMessageCreated -n 50

# Live-Log im Browser (Firebase Console)
firebase functions:log --only onEventCreated,onEventStatusChanged,onAdminMessageCreated --open

# Mailgun Dashboard (Ground Truth für Zustellung)
open https://app.eu.mailgun.net/sending/mg.thetribe.at/logs
```

In Mailgun hat jede Nachricht eine Message-ID in spitzen Klammern (z. B. `<20260917062257.85d81230fa48dc1a@mg.thetribe.at>`). Darüber lassen sich Bounces, Defers und Spam-Beschwerden nachverfolgen.
