import { test, expect } from '@playwright/test';

test.describe('Datenschutzerklärung Formatierung (cO5bFAro)', () => {
  test('renders bold markers as <strong> instead of literal asterisks', async ({ page }) => {
    await page.goto('/datenschutz');

    await expect(page.locator('.legal-title')).toHaveText('Datenschutzerklärung');

    const content = page.locator('.legal-content');

    // "*Account-Daten:*" should be rendered as bold "Account-Daten:"
    const accountDataStrong = content.locator('strong', { hasText: 'Account-Daten:' });
    await expect(accountDataStrong).toBeVisible();

    // The "*...*" markers must not leak through into the rendered text.
    await expect(content).not.toContainText('*Account-Daten:*');
    await expect(content).not.toContainText('*Events:*');
    await expect(content).not.toContainText('*Bei der Registrierung:*');

    // Section 10 headers should be bolded.
    await expect(content.locator('strong', { hasText: 'Was bedeutet das für Sie?' })).toBeVisible();
    await expect(content.locator('strong', { hasText: 'Löschen von Bildern:' })).toBeVisible();
  });

  test('renders dash-prefixed lines as <ul> bullet lists', async ({ page }) => {
    await page.goto('/datenschutz');

    const content = page.locator('.legal-content');

    // At least one bullet list should exist on the page.
    const lists = content.locator('.legal-list');
    expect(await lists.count()).toBeGreaterThan(0);

    // First bullet list under section 2 should contain the registration bullets.
    const firstList = lists.first();
    await expect(firstList).toContainText('E-Mail-Adresse (für die Authentifizierung)');
    await expect(firstList).toContainText(
      'Passwort (verschlüsselt gespeichert, Firebase Authentication)'
    );

    // No literal "- " prefixes should leak into rendered text.
    await expect(content).not.toContainText('- E-Mail-Adresse (für die Authentifizierung)');
  });

  test('preserves text content while reformatting', async ({ page }) => {
    await page.goto('/datenschutz');

    const content = page.locator('.legal-content');

    // Section 1: contact info still readable.
    await expect(content).toContainText(
      'Verantwortlicher für die Verarbeitung personenbezogener Daten im Sinne der DSGVO ist:'
    );
    await expect(content).toContainText('tribe Vorarlberg');
    await expect(content).toContainText('E-Mail: thomas@blissofkundalini.yoga');

    // Section 3: rights basis bullets still readable.
    await expect(content).toContainText('Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO):');
    await expect(content).toContainText('Berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO):');
    await expect(content).toContainText('Bereitstellung der App-Funktionalität');

    // Section 5: storage duration bullets still readable, inline bold preserved.
    await expect(content).toContainText('Account-Daten:');
    await expect(content).toContainText('Werden gelöscht, sobald Sie Ihr Konto löschen');

    // Section 10: bullets still readable.
    await expect(content).toContainText(
      'Das hochgeladene Bild wird auf Servern innerhalb der EU/des EWR gespeichert'
    );
    await expect(content).toContainText(
      'Wenn Sie ein Event bearbeiten und das Bild entfernen oder ersetzen'
    );
  });
});
