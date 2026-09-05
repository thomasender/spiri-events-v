import { test, expect } from '@playwright/test';
import { generateSlug } from '../helpers/slug';

const EVENT_WITH_LINK_SLUG = generateSlug('Event mit Ticketlink', 'Yogastudio Bregenz', 20);
const EVENT_WITH_LINK_HREF = 'https://tickets.example.com/yoga-bregenz';
const EVENT_WITHOUT_LINK_SLUG = generateSlug('Yoga heute', 'Yogastudio Dornbirn', 0);

test.describe('Event link shown in details section (pYXBNkID)', () => {
  test('event detail page shows the organizer link in the general info section', async ({
    page,
  }) => {
    test.setTimeout(75000);
    await page.goto(`/event/${EVENT_WITH_LINK_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('Event mit Ticketlink', {
      timeout: 10000,
    });

    const detailLink = page.locator('[data-testid="event-detail-link"]');
    await expect(detailLink).toBeVisible();

    const label = detailLink.locator('.detail-label');
    await expect(label).toHaveText('Webseite');

    const anchor = detailLink.locator('a.detail-link');
    await expect(anchor).toHaveAttribute('href', EVENT_WITH_LINK_HREF);
    await expect(anchor).toHaveAttribute('target', '_blank');
    await expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(anchor).toContainText(EVENT_WITH_LINK_HREF);

    const contactSection = page.locator('[data-testid="event-kontakt"]');
    const linkSection = page.locator('[data-testid="event-detail-link"]');

    const linkIsInsideEventDetails = await page.evaluate(() => {
      const details = document.querySelector('.event-details');
      const link = document.querySelector('[data-testid="event-detail-link"]');
      return Boolean(details && link && details.contains(link));
    });

    expect(linkIsInsideEventDetails).toBe(true);

    const contactOrder = await contactSection.evaluate((el) =>
      Array.from(el.parentElement?.children ?? []).indexOf(el)
    );
    const linkOrder = await linkSection.evaluate((el) =>
      Array.from(el.parentElement?.children ?? []).indexOf(el)
    );
    expect(linkOrder).toBeGreaterThan(contactOrder);

    const primaryButton = page.locator('a.event-link');
    await expect(primaryButton).toBeVisible();
    await expect(primaryButton).toHaveAttribute('href', EVENT_WITH_LINK_HREF);

    await expect(page.getByTestId('similar-events')).toBeVisible({ timeout: 60000 });
    const linkIsBeforeSimilarEvents = await page.evaluate(() => {
      const link = document.querySelector('a.event-link');
      const similarEvents = document.querySelector('[data-testid="similar-events"]');
      return Boolean(
        link &&
        similarEvents &&
        link.compareDocumentPosition(similarEvents) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    });
    expect(linkIsBeforeSimilarEvents).toBe(true);
  });

  test('event detail page does not show the link section when the event has no link', async ({
    page,
  }) => {
    await page.goto(`/event/${EVENT_WITHOUT_LINK_SLUG}`);

    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('Yoga heute', {
      timeout: 10000,
    });

    await expect(page.locator('[data-testid="event-detail-link"]')).toHaveCount(0);
    await expect(page.locator('a.event-link')).toHaveCount(0);
  });
});
