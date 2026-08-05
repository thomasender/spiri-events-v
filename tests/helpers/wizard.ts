import { Page } from '@playwright/test';

export async function waitForWizardToLoad(page: Page) {
  await page
    .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

export async function clickWeiter(page: Page) {
  const weiterButton = page.locator('button:has-text("Weiter")');
  await weiterButton.waitFor({ timeout: 5000 }).catch(() => {});
  await weiterButton.click();
  await page.waitForTimeout(1000);
}

export async function clickZurueck(page: Page) {
  const zurueckButton = page.locator('button:has-text("Zurück")');
  await zurueckButton.waitFor({ timeout: 5000 }).catch(() => {});
  await zurueckButton.click();
  await page.waitForTimeout(1000);
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
    await page.fill('#description', data.description);
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
    category?: string;
    contribution?: 'free' | 'fee';
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
  if (data.category !== undefined) {
    await page.click('.kategorie-select');
    await page.waitForTimeout(300);
    await page.click(`.kategorie-select__option:has-text("${data.category}")`);
    await page.waitForTimeout(300);
  }
  if (data.contribution !== undefined) {
    await page.click(
      `.radio-label:has-text("${data.contribution === 'free' ? 'Kostenlos' : 'Gebühr'}")`
    );
  }
  if (data.fee !== undefined) {
    await page.fill('#fee', data.fee);
  }
}

export async function selectBezirk(page: Page, bezirk: string) {
  await page.click('.filter-accordion .filter-accordion-summary');
  await page.waitForTimeout(300);
  await page.click(`.filter-accordion button:has-text("${bezirk}")`);
  await page.waitForTimeout(300);
}

export async function submitWizard(page: Page) {
  await page.click(
    'button:has-text("Event erstellen"), button:has-text("Einreichen zur Genehmigung")'
  );
  await page.waitForTimeout(500);
}

export async function confirmSubmission(page: Page) {
  await page.click('button:has-text("Einreichen"), button:has-text("Bestätigen")');
  await page.waitForTimeout(2000);
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
  await page.click(`#${fieldId}`);
  await page.selectText(`#${fieldId}`);
  await page.keyboard.press('Backspace');
}
