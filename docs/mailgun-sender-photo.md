# Mailgun Sender Photo

Mails, die der Eventskalender (`events.thetribe.at`) über Mailgun verschickt,
erscheinen im Posteingang mit einem Absender-Foto neben "The Tribe". Das Foto
ist eine Domain-Einstellung im Mailgun-Dashboard und wird hier zentral
hinterlegt, damit das Branding konsistent und die Mails professionell wirken.

## Was ist im Repo

`public/email-sender-logo.png` — das Brand-Mark als quadratische PNG, 512×512 px,
transparenter Hintergrund, ca. 14 KB. Stammt aus `public/logo-mark.svg` und wird
bei Bedarf mit dem Script `scripts/render-email-sender-logo.mjs` neu gerendert.

## Einmalig im Mailgun-Dashboard setzen

Das Foto wird **einmal pro Mailgun-Domain** im Dashboard hinterlegt — nicht
pro Mail und nicht per API.

1. Mailgun-Dashboard öffnen: <https://app.eu.mailgun.net/sending/domains/mg.thetribe.at/settings>
2. Im Bereich **"Sending" → "Settings"** (oder "Sender Photo") das Bild
   `public/email-sender-logo.png` hochladen.
3. Speichern.

Nach dem Upload wird das Bild in Mail-Clients angezeigt, die das Feld
unterstützen (z. B. Apple Mail). Gmail verwendet stattdessen das
Domain-Favicon oder ein BIMI-Logo — das ist ein separates Thema und hier
nicht abgedeckt.

## Wann neu rendern

Wenn sich das Brand-Mark (`public/logo-mark.svg`) ändert, das PNG neu erzeugen:

```bash
node scripts/render-email-sender-logo.mjs
```

Dann die neue Datei im Repo committen und erneut im Mailgun-Dashboard
hochladen.

## Was Mailgun nicht braucht

- Kein Code-Change an `functions/src/mailgun.ts` oder `functions/src/notifications.ts`
- Keine neuen Secrets
- Kein API-Call beim Versand
