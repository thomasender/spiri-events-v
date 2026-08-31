import { test, expect, Locator, Page } from '@playwright/test';
import { generateSlug } from '../helpers/slug';

// WCAG 2.1 AA requires a contrast ratio of at least 4.5:1 for normal-sized text
// (less than 18pt / 14pt bold). On a hovered button, the label must stay legible
// for sighted users — a common regression is to lighten the hover background and
// keep white text on top, which collapses contrast below 2:1.
const WCAG_AA_CONTRAST = 4.5;

// Color transitions in the design system are 150ms; wait long enough for the
// hover state to settle before sampling computed styles, otherwise we read a
// mid-transition color and get a misleading contrast value.
const HOVER_TRANSITION_MS = 250;

function parseRgb(rgb: string): [number, number, number] {
  const match = rgb.match(/\d+/g);
  if (!match || match.length < 3) {
    throw new Error(`Could not parse color: ${rgb}`);
  }
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

function sRGBToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(sRGBToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(parseRgb(fg));
  const l2 = relativeLuminance(parseRgb(bg));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function readContrastOnHover(
  page: Page,
  locator: Locator
): Promise<{ background: string; color: string; contrast: number }> {
  await locator.hover();
  await page.waitForTimeout(HOVER_TRANSITION_MS);
  const styles = await locator.evaluate((node) => {
    const cs = window.getComputedStyle(node);
    return { background: cs.backgroundColor, color: cs.color };
  });
  const contrast = contrastRatio(styles.color, styles.background);
  return { ...styles, contrast };
}

const EVENT_WITH_LINK_SLUG = generateSlug('Event mit Ticketlink', 'Yogastudio Bregenz', 20);

test.describe('Primary button hover keeps text legible (xwMB6HYm)', () => {
  test('event-link button on the event detail page meets WCAG AA contrast on hover', async ({
    page,
  }) => {
    await page.goto(`/event/${EVENT_WITH_LINK_SLUG}`);
    await page
      .waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await expect(page.locator('.event-not-found')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('.event-title')).toContainText('Event mit Ticketlink', {
      timeout: 10000,
    });

    const eventLink = page.locator('.event-link');
    await expect(eventLink).toBeVisible();

    const { contrast, background, color } = await readContrastOnHover(page, eventLink);
    expect(
      contrast,
      `Event-link hover contrast ${contrast.toFixed(2)}:1 must be ≥ ${WCAG_AA_CONTRAST}:1 ` +
        `(background=${background}, color=${color})`
    ).toBeGreaterThanOrEqual(WCAG_AA_CONTRAST);
  });

  test('feedback FAB stays readable on hover across all pages', async ({ page }) => {
    await page.goto('/');
    const fab = page.locator('[data-testid="feedback-fab"]');
    await expect(fab).toBeVisible();

    const { contrast, background, color } = await readContrastOnHover(page, fab);
    expect(
      contrast,
      `Feedback FAB hover contrast ${contrast.toFixed(2)}:1 must be ≥ ${WCAG_AA_CONTRAST}:1 ` +
        `(background=${background}, color=${color})`
    ).toBeGreaterThanOrEqual(WCAG_AA_CONTRAST);
  });

  test('default anchor links stay readable on hover against the page background', async ({
    page,
  }) => {
    await page.goto('/impressum');
    const link = page.locator('main a').first();
    await expect(link).toBeVisible();

    const { contrast, background, color } = await readContrastOnHover(page, link);
    expect(
      contrast,
      `Anchor hover contrast ${contrast.toFixed(2)}:1 must be ≥ ${WCAG_AA_CONTRAST}:1 ` +
        `(background=${background}, color=${color})`
    ).toBeGreaterThanOrEqual(WCAG_AA_CONTRAST);
  });
});
