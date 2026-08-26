import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword } from '../helpers/auth';
import { waitForWizardToLoad, clickWeiter, fillStep2EventInfo } from '../helpers/wizard';

test.describe('Event wizard: Zusammenfassung Datumsformat', () => {
  test('shows the event date as DD.MM.YYYY in the summary step', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Datumsformat Test Event',
      description: 'Beschreibung für den Datumsformat-Test.',
    });
    await clickWeiter(page);

    await page.fill('#date', '2026-09-15');
    await page.fill('#time', '18:00');
    await page.fill('#place', 'Testort');
    await page.selectOption('#bezirk', 'Bregenz');
    await page.click('.kategorie-select');
    await page.waitForTimeout(300);
    await page.getByText('Yoga', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.click('.radio-label:has-text("Kostenlos")');
    await clickWeiter(page);

    const summary = page.locator('.summary-card');
    await expect(summary).toBeVisible();

    const summaryText = await summary.textContent();
    expect(summaryText).toContain('15.09.2026');
    expect(summaryText).not.toContain('2026-09-15');
  });

  test('shows the participant contact without the account email in the summary', async ({
    page,
  }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    const participantContact = '+43 664 1234567';
    await page.fill('#kontakt', participantContact);
    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Kontakt Test Event',
      description: 'Beschreibung für den Kontakt-Test.',
    });
    await clickWeiter(page);
    await page.fill('#date', '2026-10-10');
    await page.fill('#time', '17:00');
    await page.fill('#place', 'Testort');
    await page.selectOption('#bezirk', 'Bregenz');
    await page.click('.kategorie-select');
    await page.getByText('Yoga', { exact: true }).click();
    await page.click('.radio-label:has-text("Kostenlos")');
    await clickWeiter(page);

    const contactSummary = page
      .locator('.summary-section')
      .filter({ hasText: 'Veranstalter & Kontakt' });
    await expect(contactSummary).toContainText(participantContact);
    await expect(contactSummary).not.toContainText('admin@test.com');
  });

  test('shows both start and end date in DD.MM.YYYY in the summary', async ({ page }) => {
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin/new');
    await waitForWizardToLoad(page);

    await clickWeiter(page);
    await fillStep2EventInfo(page, {
      title: 'Mehrtägiges Datumsformat Test Event',
      description: 'Beschreibung für mehrtägigen Datumsformat-Test.',
    });
    await clickWeiter(page);

    await page.fill('#date', '2026-11-03');
    await page.fill('#time', '10:00');
    await page.fill('#endDate', '2026-11-05');
    await page.fill('#place', 'Retreat Ort');
    await page.selectOption('#bezirk', 'Bregenz');
    await page.click('.kategorie-select');
    await page.waitForTimeout(300);
    await page.getByText('Meditation', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.click('.radio-label:has-text("Gebühr")');
    await page.fill('#fee', '120');
    await clickWeiter(page);

    const summary = page.locator('.summary-card');
    await expect(summary).toBeVisible();

    const summaryText = await summary.textContent();
    expect(summaryText).toContain('03.11.2026');
    expect(summaryText).toContain('05.11.2026');
    expect(summaryText).toContain('Bis: 05.11.2026');
    expect(summaryText).not.toContain('2026-11-03');
    expect(summaryText).not.toContain('2026-11-05');
  });
});
