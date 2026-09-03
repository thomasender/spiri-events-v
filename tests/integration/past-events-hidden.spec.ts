import { test, expect, Page, request } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8181';
const PROJECT_ID = 'spirieventsvbg';

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

async function seedEventViaFirestoreApi(
  apiContext: request.APIRequestContext,
  event: Record<string, unknown>
): Promise<void> {
  const fields: Record<string, { stringValue: string }> = {};
  for (const [key, value] of Object.entries(event)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') {
      // Skip complex nested fields (organizer etc.); we only need scalar
      // fields for this test.
      continue;
    }
    fields[key] = { stringValue: String(value) };
  }
  const url = `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/events/${event.id}`;
  const res = await apiContext.patch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer owner',
    },
    data: { fields },
  });
  if (!res.ok()) {
    throw new Error(`Failed to seed event ${event.id}: ${res.status()} ${await res.text()}`);
  }
}

async function navigateToMonth(
  page: Page,
  year: number,
  month: number,
  direction: 'forward' | 'backward'
): Promise<void> {
  const target = `${MONTHS_DE[month]} ${year}`;
  const header = page.locator('.events-section-month h2');
  const navButtonIndex = direction === 'forward' ? 1 : 0;
  for (let attempts = 0; attempts < 36; attempts++) {
    const current = (await header.textContent())?.trim() ?? '';
    if (current === target) return;
    await page.locator('.events-section-month-nav button').nth(navButtonIndex).click();
    await page.waitForTimeout(150);
  }
  throw new Error(`Failed to navigate to ${target}`);
}

const PAST_SINGLE_DAY_ID = 'test-past-single-day-nUoA0Wbx';
const PAST_MULTI_DAY_ID = 'test-past-multi-day-nUoA0Wbx';
const ONGOING_MULTI_DAY_ID = 'test-ongoing-multi-day-nUoA0Wbx';

test.describe('Calendar hides past events (nUoA0Wbx)', () => {
  test.beforeAll(async ({ playwright }) => {
    const apiContext = await request.newContext({
      baseURL: FIRESTORE_EMULATOR,
    });
    try {
      await seedEventViaFirestoreApi(apiContext, {
        id: PAST_SINGLE_DAY_ID,
        title: 'Vergangenes Einzelevent',
        date: isoDate(-7),
        time: '10:00',
        endTime: '11:30',
        place: 'Vergangenheitsraum Bregenz',
        description: 'Dieses Event ist vorbei und sollte nicht im Kalender angezeigt werden.',
        category: 'Yoga',
        bezirk: 'Bregenz',
        kontakt: '0676 0000001',
        status: 'approved',
        recurrence: 'none',
      });
      await seedEventViaFirestoreApi(apiContext, {
        id: PAST_MULTI_DAY_ID,
        title: 'Vergangenes Mehrtagesretreat',
        date: isoDate(-10),
        endDate: isoDate(-8),
        time: '08:00',
        endTime: '17:00',
        place: 'Kloster Vergangenheit',
        description: 'Dieses mehrtägige Retreat ist seit drei Tagen vorbei.',
        category: 'Meditation',
        bezirk: 'Bregenz',
        kontakt: '0676 0000002',
        status: 'approved',
        recurrence: 'none',
      });
      await seedEventViaFirestoreApi(apiContext, {
        id: ONGOING_MULTI_DAY_ID,
        title: 'Laufendes Mehrtagesretreat',
        date: isoDate(-2),
        endDate: isoDate(2),
        time: '08:00',
        endTime: '17:00',
        place: 'Kloster Gegenwart',
        description: 'Dieses mehrtägige Retreat läuft gerade noch und sollte sichtbar bleiben.',
        category: 'Meditation',
        bezirk: 'Bregenz',
        kontakt: '0676 0000003',
        status: 'approved',
        recurrence: 'none',
      });
    } finally {
      await apiContext.dispose();
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForCalendarToLoad(page);
  });

  test('a month well in the past shows no events', async ({ page }) => {
    const today = new Date();
    today.setMonth(today.getMonth() - 3);
    const year = today.getFullYear();
    const month = today.getMonth();

    await navigateToMonth(page, year, month, 'backward');

    await expect(page.locator('.events-section-empty')).toBeVisible();
  });

  test('an ongoing multi-day event that started 2 days ago is visible', async ({ page }) => {
    const today = new Date();
    today.setDate(today.getDate() - 2);
    const year = today.getFullYear();
    const month = today.getMonth();

    await navigateToMonth(page, year, month, 'forward');

    const ongoing = page
      .locator('.event-row, .event-tile', { hasText: 'Laufendes Mehrtagesretreat' })
      .first();
    await expect(ongoing).toBeVisible();
  });

  test('the past single-day and past multi-day events are not in the events list', async ({
    page,
  }) => {
    // Even when navigating to the month in which they ended, the past
    // events must not appear.
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    await navigateToMonth(page, year, month, 'forward');

    const pastSingle = page.locator('.event-row, .event-tile', {
      hasText: 'Vergangenes Einzelevent',
    });
    const pastMulti = page.locator('.event-row, .event-tile', {
      hasText: 'Vergangenes Mehrtagesretreat',
    });
    await expect(pastSingle).toHaveCount(0);
    await expect(pastMulti).toHaveCount(0);
  });
});
