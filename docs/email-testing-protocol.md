# Testprotokoll: Event-Lifecycle-E-Mails

_Test-Protokoll für die vier automatischen Benachrichtigungs-E-Mails, die beim Lebenszyklus eines Events ausgelöst werden. Voraussetzung: Funktionen sind deployt (`firebase deploy --only functions`), Mailgun-Domain `mg.thetribe.at` ist verifiziert, die drei Secrets `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM` sind gebunden._

## 1. „Neuer Event-Vorschlag" (Submitted → an alle Admins)

- **Wer löst aus:** beliebiger User
- **Aktion:** Event im Wizard erstellen, am Ende „Einreichen" klicken
- **Empfänger:** alle Admins (aufgelöst über die `admin_users`-Collection und Firebase Auth)
- **Betreff:** `Neuer Event-Vorschlag: {Titel}`
- **Inhalt:** Name des Einreichers + Button „Im Review ansehen" (Link zu `/admin/review#<eventId>`)
- **Verifizieren:**
  - Mailgun Dashboard → Sending → Logs → Filter `mg.thetribe.at` → Status `delivered`, To enthält alle Admin-Adressen
  - Function Log: `firebase functions:log --only onEventStatusChanged -n 50` → Meldung `submitted notification processed`, `recipients` = Anzahl Admins
  - Bei `recipients: 0` stimmt etwas mit `admin_users` nicht (kein Doc vorhanden oder Auth-User fehlt)

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

## 4. „Dein Event wurde gelöscht" (Deleted → an Ersteller)

- **Wer löst aus:** User oder Admin
- **Aktion:** „In Papierkorb" auf dem Event (EventList, EventDetail oder Edit-Form), Bestätigungsdialog → OK
- **Empfänger:** Ersteller
- **Betreff:** `Dein Event wurde gelöscht: {Titel}`
- **Inhalt:** Hinweis + Hinweis auf „Papierkorb"-Tab zur Wiederherstellung
- **Verifizieren:**
  - Mailgun Logs → 1× delivered
  - Function Log: `deleted notification processed`, `recipients: 1`
- **Wichtig:** Triggert bei **jedem** Übergang nach `trashed` (von `draft`, `pending` oder `approved`).

## Was **nicht** zu einer E-Mail führt (Negativtests)

| Aktion                                                                     | Erwartung                                |
| -------------------------------------------------------------------------- | ---------------------------------------- |
| Admin klickt „Zu Entwurf" (pending → draft)                                | keine E-Mail                             |
| Admin stellt Event aus Papierkorb wieder her                               | keine E-Mail                             |
| Admin klickt „Endgültig löschen"                                           | keine E-Mail (Doc ist weg, kein Trigger) |
| User schreibt eine Nachricht an Admin (`authorRole: "User"`)               | keine E-Mail                             |
| Andere Felder werden geändert (`title`, `category`, …) ohne Status-Wechsel | keine E-Mail                             |

## Wiederkehrende Verifikations-Tools

```bash
# Aktuelle Logs (einmalig, letzte 50 Zeilen)
firebase functions:log --only onEventStatusChanged,onAdminMessageCreated -n 50

# Live-Log im Browser (Firebase Console)
firebase functions:log --only onEventStatusChanged,onAdminMessageCreated --open

# Mailgun Dashboard (Ground Truth für Zustellung)
open https://app.eu.mailgun.net/sending/mg.thetribe.at/logs
```

In Mailgun hat jede Nachricht eine Message-ID in spitzen Klammern (z. B. `<20260917062257.85d81230fa48dc1a@mg.thetribe.at>`). Darüber lassen sich Bounces, Defers und Spam-Beschwerden nachverfolgen.
