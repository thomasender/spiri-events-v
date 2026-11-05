# Finanzen (Buchhaltung)

Admin-Tab „Finanzen“, Collection `ledger`, nur Super-Admins.

- Buchung: Art (Einnahme/Ausgabe), Datum, Betrag, Beschreibung, Kategorie, Notiz (Freitext), Belege.
- Mollie-Spenden werden automatisch als Einnahme angelegt (`source: 'mollie'`).
- **Ersteller:** Jede Buchung zeigt read-only „Angelegt von <Name> am <Datum>" (Liste + Bearbeiten-Dialog).
  - Manuelle Buchungen speichern `createdBy` (uid), `createdByName`, `createdByEmail` (falls vorhanden; wird in der Anzeige bevorzugt) und `createdAt` beim Anlegen.
  - Diese Felder sind per Firestore-Rules nicht änderbar.
  - Mollie-Buchungen: „Mollie (automatisch)". Ältere Buchungen ohne Namen: „Admin".
