# Pre-Concept: 30 Tage Papierkorb für gelöschte Beiträge

**Ticket:** [SS79oSci](https://trello.com/c/SS79oSci) — 30 Tage Papierkorb für gelöschte Beiträge
**Type:** Feature (Soft-Delete + Auto-Retention + neuer Admin-Tab)
**Author:** opencode pre-concept skill

## Context

Aktuell werden Events via `deleteDoc` hart aus Firestore gelöscht (siehe `src/hooks/useEvents.js:144-150` und `src/components/EventList.jsx:75-86`). Das ist unumkehrbar — User können versehentlich gelöschte Events nicht wiederherstellen, und es gibt keinen Compliance-fähigen Retention-Pfad.

Das Ticket will:
1. Beim "Löschen"-Klick das Event **nicht** entfernen, sondern nur in einen `trashed`-Status setzen.
2. In der Verwaltung einen **"Papierkorb"-Tab** anzeigen — aber **nur wenn tatsächlich ein Event im Papierkorb liegt**.
3. Nach **30 Tagen** wird das Event endgültig aus der DB entfernt.
4. Sobald der Papierkorb leer ist, verschwindet der Tab wieder.

## Offene Kernfrage

**Wie lösen wir das automatische Löschen nach 30 Tagen technisch aus — gemäss Firestore Best Practices?**

Im Projekt gibt es aktuell **keine Cloud Functions** (Verzeichnis `functions/` existiert nicht, `firebase.json:1-23` enthält keinen `functions`-Block, `firebase functions:list` liefert einen Fehler für `spirieventsvbg`). Der Build wird via Netlify (`netlify.toml`) statisch ausgeliefert — es gibt keinen Server-Runtime.

Firestore bietet für genau diesen Use-Case (zeitbasierte Auto-Löschung) eine eingebaute Funktion: **TTL Policies (Time-To-Live)**. Das ist der von Google dokumentierte Best-Practice-Pfad dafür (siehe `https://cloud.google.com/firestore/docs/ttl`).

## Lösungspfade

### Pfad A — Firestore TTL Policy (empfohlen, idiomatisch)

Soft-Delete + TTL-Feld + Cleanup am User-Aktion-Zeitpunkt.

**Was heisst das konkret:**
- Neues Feld `trashedAt: Timestamp | null` auf `events`-Dokumenten.
- Neuer Status `'trashed'` (zusätzlich zu `draft`, `pending`, `approved`).
- `deleteEvent()` im Hook wird zu `trashEvent()`: schreibt `status: 'trashed', trashedAt: serverTimestamp()` (kein `deleteDoc` mehr).
- Firestore-TTL-Policy via `firestore-ttl.json` (oder CLI `firebase firestore:ttl:enable`) auf das Feld `trashedAt` mit `ttl: 2592000` (= 30 Tage in Sekunden). Firestore löscht abgelaufene Docs dann **server-side, automatisch, ohne Compute-Kosten**.
- Storage-Cleanup (Bilder unter `events/{id}/...`) und Sub-Collection-Cleanup (`events/{id}/messages/{msgId}`) erfolgen **am Moment des Trash-Klicks** client-seitig — d.h. direkt in `trashEvent()` über `deleteImageByUrl()` (existiert bereits in `src/lib/imageUpload.js:138-149`) und ein paralleler `deleteDoc`-Loop über die Messages (Pattern existiert in `src/hooks/useEvents.js:260-262` bei `approveEvent`).
- "Wiederherstellen" im Papierkorb setzt `status: 'draft'`, `trashedAt: null`. Bilder sind dann weg (siehe Risiko unten) — das sollte in der UI kommuniziert werden, oder wir wählen Pfad A' unten.

**Was bereits wiederverwendbar ist:**
- `useEvents` Hook (`src/hooks/useEvents.js`) — wir erweitern ihn um `trashEvent` / `restoreEvent` und passen `deleteEvent` an (Hard-Delete nur noch für Admins auf Wunsch).
- `ConfirmDialog` (`src/components/ConfirmDialog.jsx`) — Bestätigungs-Dialog für "In Papierkorb verschieben".
- `RecurringDeleteDialog` (`src/components/RecurringDeleteDialog.jsx`) — kann für Trash-Bestätigung wiederverwendet oder analog gebaut werden.
- `AdminPage` Tab-Pattern (`src/pages/AdminPage.jsx:78-160`) — neuer Tab folgt exakt dem gleichen Muster wie `DraftsTab` / `FeedbackTab`. Badge-Count (z.B. `useTrashedCount`-Hook, analog zu `useUnreadMessageCount.js`) für die "nur zeigen wenn nicht leer"-Logik.
- `DraftsTab` (`src/components/DraftsTab.jsx`) — als Vorlage für `TrashTab` (gleiche Komposition, anderes Filter-Kriterium).
- `deleteImageByUrl` (`src/lib/imageUpload.js:138-149`) — Storage-Cleanup-Helper.
- Message-Subcollection-Loop (`src/hooks/useEvents.js:260-262`) — Pattern für Cleanup der Sub-Collection.
- Firestore-Rules-Pattern `isOwner() || isAdmin()` (`firestore.rules:22-29`) — für die neuen Update-Operationen.

**Was neu ist:**
- TTL-Konfiguration (eine `firestore-ttl.json` mit `{ "field": "trashedAt", "ttl": 2592000 }` und ein CLI-Aufruf `firebase firestore:ttl:enable`). Die Datei kann eingecheckt werden, damit Deploy reproduzierbar ist — die Policy wird via `firebase deploy --only firestore` aktiviert (oder per Console).
- Neuer `TrashTab`-Komponente (~ analog `DraftsTab`).
- Erweiterung von `useEvents` um `trashEvent`, `restoreEvent`, optional `permanentDeleteEvent` (nur Admin).
- Anpassung der `EventList` / `DraftsTab` Delete-Buttons: "Löschen" → "In Papierkorb".
- Hook `useTrashedCount` (zählt `status == 'trashed'` für aktuellen User / für alle Admins).
- Firestore-Rules-Erweiterung: `trashedAt`-Feld darf gesetzt werden (Update auf eigenes oder Admin-Doc), `'trashed'` als erlaubter Status.

**Risiken / Dependencies:**
- ⚠️ **Bilder sind bei Wiederherstellung weg.** Wir löschen Storage-Files beim Trash-Klick, weil es keinen Trigger gibt, der sie nach 30 Tagen putzt, ohne Cloud Function. Wenn "Restore inkl. Bild" ein hartes Requirement ist → Pfad A' oder Pfad C.
- TTL-Löschung ist **eventually consistent** — Google dokumentiert bis zu 72h Verzögerung. Für ein 30-Tage-Fenster irrelevant; trotzdem sollte in der UI kommuniziert werden, dass "endgültig gelöscht nach max. 30 Tagen + 3 Tage" gilt.
- TTL löscht **nur das Top-Level-Document**. Sub-Collections (`messages`) müssen wir vorher selbst putzen — erledigen wir am Trash-Zeitpunkt (s.o.).
- TTL löscht **keine Storage-Files**. Erledigen wir am Trash-Zeitpunkt (s.o.).
- Funktioniert im **Spark-Tarif** (kein Blaze nötig). Das ist relevant, weil wir im Projekt aktuell keinen Hinweis auf Blaze haben.

### Pfad A' — Variante: Storage erst beim Permanent-Delete putzen

Wie Pfad A, **aber** Storage-Files und Messages werden **nicht** beim Trash-Klick gelöscht, sondern erst wenn der Tab wirklich endgültig entfernt wird.

**Problem:** Bei TTL gibt es keinen serverseitigen Trigger, der nach Ablauf noch etwas aufräumt. Wir müssten also:
- entweder Storage-Cleanup doch beim Trash-Klick machen (→ zurück zu A), oder
- einen kleinen **client-seitigen Sweep** machen (z.B. beim App-Load: jeder User löscht alle Storage-Files unter `events/{eventId}/...` für eigene trash-Events mit `trashedAt > 30 Tage`). Funktioniert, ist aber fragil und unzuverlässig (läuft nur wenn jemand die App öffnet).

→ Pfad A' ist nur sinnvoll, wenn die "Bilder bleiben 30 Tage erhalten"-Anforderung so wichtig ist, dass man die Unzuverlässigkeit in Kauf nimmt. **Eher nicht empfohlen.**

### Pfad B — Cloud Functions mit `onSchedule`

Klassisch: scheduled Function läuft täglich, queried Trash-Events älter als 30 Tage, löscht sie inkl. Sub-Collection + Storage.

**Was heisst das konkret:**
- `functions/`-Verzeichnis neu anlegen mit `package.json`, `tsconfig.json`, `index.ts`.
- `firebase.json` um `"functions": { "source": "functions" }` erweitern.
- Scheduled Function: `pubsub.schedule('every 24 hours').onRun(async (ctx) => { ... })` — query `events where status == 'trashed' && trashedAt < now - 30d`, pro Doc: `recursiveDelete` (löscht Sub-Collections) + Storage-Prefix `events/{id}/` löschen.
- Deploy via `firebase deploy --only functions`. Setzt **Blaze-Tarif** voraus.
- Soft-Delete / Restore-UI identisch zu Pfad A (kein TTL-Feld nötig, aber `trashedAt` als Marker weiterhin sinnvoll).

**Was wiederverwendbar ist:** alles aus Pfad A bis auf die TTL-Config.

**Risiken / Dependencies:**
- 🔴 **Blaze-Tarif erforderlich.** Scheduled Functions laufen nicht im Spark-Tarif. Projekt muss upgegradet werden, was eine Aktion ausserhalb des Codes ist (Billing-Alert, Peter muss zustimmen).
- Cloud Functions Setup ist **net-new infra** im Projekt — erstes Function-Setup bringt Boilerplate mit (Auth-Imports, Deployment-Pipeline, Logs).
- Hard-Delete-Logik mit `recursiveDelete` ist nicht trivial und muss gut getestet werden (Race Conditions, partial failures).
- Funktioniert nur, solange Function deployed ist und Quotas nicht ausgeschöpft sind.

### Pfad C — Pfad A + `onDelete`-Trigger-Function für Storage (Hybrid)

TTL löscht Firestore-Doc, `firestore.onDelete`-Trigger löscht Storage-Files.

**Was heisst das konkret:**
- Wie Pfad A, plus eine `firestore.onDelete`-Function, die beim Doc-Delete die Storage-Files unter `events/{id}/` aufräumt.
- Setzt ebenfalls **Blaze-Tarif** voraus (jeder Function-Trigger braucht Blaze).

**Risiken / Dependencies:** gleich wie Pfad B (Blaze).

### Pfad D — Client-seitiger Sweep (NICHT empfohlen)

Jeder Client prüft beim Laden, ob Trash-Events älter als 30 Tage sind, und löscht sie. Keine Server-Logik.

**Risiken:** User müssen die App aktiv öffnen, damit Cleanup passiert. Verstösst gegen "don't trust the client"-Prinzip (Client löscht andere Clients' Daten, auch wenn die Rule das absichert). **Verworfen.**

## Empfehlung

**Pfad A** — Soft-Delete mit Firestore TTL Policy.

Begründung:
- **Idiomatisch:** TTL ist genau das, wofür Google diese Funktion gebaut hat. Kein eigener Cron-Job, kein eigener Server.
- **Kostenlos:** Funktioniert im Spark-Tarif — keine Aktion ausserhalb des Codes nötig (Blaze-Upgrade wäre eine organisatorische Hürde).
- **Wenig Net-New:** Tab-Pattern existiert bereits (`DraftsTab`, `MessagesTab`, `FeedbackTab`), Delete-Hook existiert, Image-Cleanup-Helper existiert, Message-Loop-Pattern existiert. Der eigentliche "neu"-Anteil ist überraschend klein.
- **Bilder-beim-Restore-Wegfall** ist der einzige echte Trade-Off. Bei einem Eventkalender für eine regionale Community ist das mMn akzeptabel — die Bilder sind sowieso rekonstruierbar (User hat Original auf dem Gerät), und der Use-Case "versehentlich gelöscht, nach 3 Tagen wiederherstellen" deckt genau das Use-Case-Fenster ab, in dem Bilder noch da wären (was bei Pfad A nicht der Fall ist). Wenn das ein No-Go ist: Pfad C mit Blaze, dann muss aber vorher mit Peter das Billing-Thema geklärt werden.

**Wenn doch Blaze akzeptabel ist:** Pfad C ist die "polierte" Variante — Storage wird sauber aufgeräumt, Restore behält die Bilder bis zum Permanent-Delete.

## Aufwandsschätzung pro Pfad

Annahme: Implementierung mit AI-Coding-Support (Claude Code), gegen Emulator + lokales Playwright.

### Pfad A (empfohlen)

- **Dev-Aufwand:** ~0.5–1 Personentag.
  - Hook-Erweiterung (`trashEvent`, `restoreEvent`, `permanentDelete`): ~1 h.
  - TrashTab-Komponente (Copy/Adapt von `DraftsTab`): ~1 h.
  - AdminPage-Tab-Integration + `useTrashedCount`-Hook: ~0.5 h.
  - Rules-Erweiterung + TTL-Config-Datei: ~0.5 h.
  - EventList/DraftsTab-Buttons auf Trash umstellen: ~0.5 h.
  - Playwright-Integration-Tests (Soft-Delete, Restore, Tab-Visibility, Auto-Delete via Mock-Time): ~2 h.
  - Lint/Typecheck/Fixups: ~0.5 h.
- **Nicht-Dev-Aufwand:** keiner.
- **Total:** ~0.5–1 Personentag.

### Pfad B / C (Cloud Functions)

- **Dev-Aufwand:** ~1.5–2.5 Personentage.
  - Alles aus Pfad A (ausser TTL-Config): ~0.5–1 PT.
  - `functions/`-Setup, TypeScript, Deploy-Pipeline: ~0.25 PT.
  - Scheduled Function (oder `onDelete`-Trigger) mit `recursiveDelete` + Storage-Prefix-Cleanup: ~0.5 PT.
  - Function-Lokaltest gegen Emulator + Integration-Tests: ~0.5 PT.
- **Nicht-Dev-Aufwand:**
  - **Blaze-Upgrade aktivieren + Billing-Alert setzen:** externe Aktion, blockierend, ~ Peter-Klärung. ⚠️ **Sitzt auf dem kritischen Pfad und ist nicht durch Tooling beschleunigbar.**
- **Total:** ~1.5–2.5 PT + organisatorische Abhängigkeit.

## Open Questions

1. **Bilder bei Restore: muss sein, oder akzeptabel?** Wenn "muss sein" → Pfad C mit Blaze. Wenn "akzeptabel dass weg" → Pfad A. ⚠️ Vor Implementation klären, weil es Pfad-Wahl beeinflusst.
2. **Was passiert mit Messages im Papierkorb?** Auch löschen beim Trash-Klick (so Pfad A skizziert)? Oder behalten bis Permanent-Delete? Bei einem Event mit vielen Messages wirft das ggf. eine kleine Cost-of-Storge-Frage auf, aber für ein regionales Tool irrelevant.
3. **Admin-Sicht:** Soll der Admin-Tab alle Trash-Events zeigen, oder nur die eigenen? Aktuell sehen Admins in `EventList` alle Events (`src/components/EventList.jsx:312-365`). Konsistent wäre: Admin sieht im Papierkorb alle Trash-Events und kann sie auch permanent löschen / wiederherstellen.
4. **Tab-Badge:** Badge mit Anzahl Trash-Events anzeigen, analog zu "Entwürfe" / "Nachrichten"? Würde das "verschwindet wenn leer"-Verhalten leicht relativieren (Badge ist auch 0 ok?). Ticket sagt explizit "nur zeigen wenn es tatsächlich einen Event im Papierkorb gibt" → **kein Badge, ganzer Tab weg bei 0.**

## Out of Scope

- GDPR-Compliance-Audit / Auskunfts-Pflichten rund um Trash.
- Bulk-Aktionen im Papierkorb (mehrere gleichzeitig wiederherstellen / löschen).
- Trash für andere Collections (`feedback`, `users`).
- Notification an User vor Permanent-Delete ("Dein Event X wird in 3 Tagen endgültig gelöscht — wiederherstellen?").
- Verschieben in andere Buckets / Cold-Storage-Archivierung (Storage-Lifecycle-Regel auf `events/{id}/` Pfad ist nicht granular genug, daher verworfen).
