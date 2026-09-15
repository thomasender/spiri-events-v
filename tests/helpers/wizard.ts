import { expect, Page } from '@playwright/test';

/**
 * Which wizard step is currently shown (1-based).
 *
 * The indicator marks every step before the current one as `.completed`, so
 * the count of completed markers + 1 is the active step. Used to wait for a
 * real step transition instead of sleeping a fixed second after each click.
 */
async function currentStep(page: Page): Promise<number> {
  return (await page.locator('.wizard-step.completed').count()) + 1;
}

export async function waitForWizardToLoad(page: Page) {
  await page.waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 });
  await expect(page.locator('.wizard-step-content')).toBeVisible({ timeout: 10000 });
}

async function clickStepButton(page: Page, label: 'Weiter' | 'Zurück') {
  const button = page.locator(`button:has-text("${label}")`);
  await button.waitFor({ timeout: 5000 });

  const before = await currentStep(page);
  await button.click();

  // Either the step changed, or validation refused to advance and surfaced an
  // error. Both are legitimate outcomes — several specs click Weiter precisely
  // to assert that it is blocked — so wait for whichever happens first.
  await expect
    .poll(
      async () =>
        (await currentStep(page)) !== before || (await page.locator('.error-text').count()) > 0,
      { timeout: 5000 }
    )
    .toBe(true);
}

export async function clickWeiter(page: Page) {
  await clickStepButton(page, 'Weiter');
}

export async function clickZurueck(page: Page) {
  await clickStepButton(page, 'Zurück');
}

export async function navigateToStep2(page: Page) {
  await waitForWizardToLoad(page);
  await clickWeiter(page);
}

export async function navigateToStep3(page: Page) {
  await clickWeiter(page);
}

export async function navigateToStep4(page: Page) {
  await clickWeiter(page);
}

export async function fillStep1Organizer(
  page: Page,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    kontakt?: string;
  }
) {
  if (data.firstName !== undefined) {
    await page.fill('#organizer\\.firstName', data.firstName);
  }
  if (data.lastName !== undefined) {
    await page.fill('#organizer\\.lastName', data.lastName);
  }
  if (data.email !== undefined) {
    await page.fill('#organizer\\.email', data.email);
  }
  if (data.kontakt !== undefined) {
    await page.fill('#kontakt', data.kontakt);
  }
}

export async function fillStep2EventInfo(
  page: Page,
  data: {
    title?: string;
    description?: string;
    link?: string;
  }
) {
  if (data.title !== undefined) {
    await page.fill('#title', data.title);
  }
  if (data.description !== undefined) {
    const editor = page.locator('[data-testid="description-editor"] .rte-content');
    await editor.click();
    await editor.fill(data.description);
  }
  if (data.link !== undefined) {
    await page.fill('#link', data.link);
  }
}

export async function fillStep3Details(
  page: Page,
  data: {
    date?: string;
    time?: string;
    endDate?: string;
    bezirk?: string;
    place?: string;
    isOnline?: boolean;
    category?: string;
    contribution?: 'free' | 'fee' | 'donation';
    fee?: string;
  }
) {
  if (data.date !== undefined) {
    await page.fill('#date', data.date);
  }
  if (data.time !== undefined) {
    await page.fill('#time', data.time);
  }
  if (data.endDate !== undefined) {
    await page.fill('#endDate', data.endDate);
  }
  if (data.place !== undefined) {
    await page.fill('#place', data.place);
  }
  if (data.isOnline !== undefined) {
    const checkbox = page.getByTestId('is-online-checkbox');
    const isChecked = await checkbox.isChecked();
    if (isChecked !== data.isOnline) {
      await checkbox.check();
    }
  }
  if (data.category !== undefined) {
    await page.click('.kategorie-select');
    const option = page.locator(`.kategorie-select__option:has-text("${data.category}")`);
    await option.click();
    await expect(option).toBeHidden();
  }
  if (data.contribution !== undefined) {
    const labelMap: Record<'free' | 'fee' | 'donation', string> = {
      free: 'Kostenlos',
      fee: 'Gebühr',
      donation: 'Freie Spende',
    };
    await page.click(`.radio-label:has-text("${labelMap[data.contribution]}")`);
  }
  if (data.fee !== undefined) {
    await page.fill('#fee', data.fee);
  }
}

export async function enableRecurrence(page: Page) {
  const yesRadio = page.getByTestId('recurrence-yes-radio');
  if ((await yesRadio.count()) === 0) return;
  if (await yesRadio.isChecked()) return;
  await page.locator('.radio-label:has-text("Ja")').first().click();
  await expect(yesRadio).toBeChecked();
}

export async function selectBezirk(page: Page, bezirk: string) {
  await page.click('.filter-accordion .filter-accordion-summary');
  const option = page.locator(`.filter-accordion button:has-text("${bezirk}")`);
  await option.waitFor({ state: 'visible', timeout: 5000 });
  await option.click();
}

export async function submitWizard(page: Page) {
  await page.click(
    'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
  );
  // Submitting opens a ConfirmDialog. Wait for it before returning, otherwise
  // confirmSubmission() races the dialog and its text selector can re-match
  // the wizard's own submit button instead.
  await expect(page.locator('.confirm-dialog')).toBeVisible({ timeout: 10000 });
}

export async function confirmSubmission(page: Page) {
  const dialog = page.locator('.confirm-dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  // Scope to the dialog: unscoped, "Einreichen" also matches the wizard's own
  // "Einreichen zur Genehmigung" button sitting behind the overlay.
  await dialog
    .locator('button:has-text("Einreichen"), button:has-text("Bestätigen")')
    .first()
    .click();
  // The dialog closes once the write completes.
  await expect(dialog).toBeHidden({ timeout: 15000 });
}

// Picks the first enabled swatch in the category color picker. Walks the
// full 20-color palette in order and clicks the first swatch that is not
// disabled. On a freshly cleared emulator every swatch is free; earlier test
// runs may have consumed slots, so we always pick whichever is currently
// enabled. Throws if every swatch is greyed out.
export async function pickEnabledCategoryColor(page: Page): Promise<string> {
  const palette = [
    '#4a7572',
    '#6b8e7f',
    '#8b6b8e',
    '#5e7a8a',
    '#b08a6e',
    '#b87a4e',
    '#7a6b8a',
    '#5a7a5a',
    '#a06b8a',
    '#8a5a4a',
    '#6b8a8e',
    '#a85a4a',
    '#5a6b7a',
    '#9a8a4e',
    '#a67c52',
    '#8e7a6b',
    '#6b8a6b',
    '#4a6b8a',
    '#a08a6b',
    '#d4a574',
  ];
  const picker = page.getByTestId('category-color-picker');
  await picker.waitFor({ state: 'visible', timeout: 5000 });
  for (const color of palette) {
    const swatch = picker.locator(`[data-color="${color}"]`);
    if (await swatch.isEnabled().catch(() => false)) {
      await swatch.click();
      await picker.waitFor({ state: 'hidden', timeout: 5000 });
      return color;
    }
  }
  throw new Error('No enabled swatch in the category color picker — all 20 colors are used.');
}

export async function confirmCopyrightCheckbox(page: Page) {
  const checkbox = page.getByTestId('rights-confirmed-checkbox');
  await checkbox.waitFor({ state: 'visible', timeout: 5000 });
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }
}

export async function getValidationError(page: Page) {
  const errorLocator = page.locator(
    '.validation-error, .wizard-validation-error, [data-testid="validation-error"]'
  );
  if (await errorLocator.isVisible()) {
    return await errorLocator.textContent();
  }
  const formError = page.locator('.error-text').first();
  if (await formError.isVisible()) {
    return await formError.textContent();
  }
  return null;
}

export async function hasValidationErrors(page: Page) {
  const errorTexts = await page.locator('.error-text').count();
  return errorTexts > 0;
}

export async function clearField(page: Page, fieldId: string) {
  // `page.selectText()` does not exist in Playwright — this helper silently
  // threw and left the field untouched. `fill('')` clears it properly and
  // fires the same input events the app listens for.
  await page.fill(`#${fieldId}`, '');
}

/**
 * Dismisses the post-submit success dialog and waits until the app is back on
 * /admin.
 *
 * Probing `successDialog.isVisible()` straight after the submit does not work:
 * the dialog has not rendered at that point, the probe returns false, the
 * confirm click is skipped and the app never navigates. Wait for it instead.
 */
export async function completeSubmissionAndReturnToAdmin(page: Page) {
  const successDialog = page.getByTestId('success-dialog');
  await expect(successDialog).toBeVisible({ timeout: 15000 });
  await successDialog.getByTestId('success-dialog-confirm').click();
  await page.waitForURL('/admin', { timeout: 15000 });
}

/**
 * Opens the Verwaltung "Review" tab and returns its panel.
 *
 * Admin-created events start as `pending` (ticket hGxrS6gp) and pending events
 * deliberately do not appear under "Meine Events" — see admin-review-tab.spec.ts.
 * Click the tab rather than cold-loading `/admin?tab=review`, which does not
 * reliably land on the populated panel.
 */
export async function openReviewTab(page: Page) {
  await page.goto('/admin');
  await page.waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 });
  await page.getByTestId('admin-tab-review').click();
  const panel = page.locator('#admin-tab-review');
  await expect(panel).toBeVisible();
  return panel;
}
