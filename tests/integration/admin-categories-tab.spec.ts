import { test, expect } from '@playwright/test';
import { waitForCalendarToLoad } from '../helpers/auth';

import { STORAGE_STATE } from '../helpers/roles';

// Signed in as `admin` via the session captured once by tests/auth.setup.ts,
// instead of driving the login form in every test.
test.use({ storageState: STORAGE_STATE.admin });

const PROJECT_ID = 'spirieventsvbg';
const FIRESTORE_BASE = `http://127.0.0.1:8181/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const SEED_NAMES = [
  'Yoga',
  'Breathwork',
  'Meditation',
  'Tanz',
  'Singen',
  'Soundhealing',
  'Sonstiges',
];

const SEED_CATEGORIES = [
  { id: 'breathwork', name: 'Breathwork', color: '#bf5b4e', order: 100 },
  { id: 'meditation', name: 'Meditation', color: '#5c6b3f', order: 200 },
  { id: 'singen', name: 'Singen', color: '#9a5f38', order: 400 },
  { id: 'sonstiges', name: 'Sonstiges', color: '#605e5e', order: 600 },
  { id: 'soundhealing', name: 'Soundhealing', color: '#6b568b', order: 500 },
  { id: 'tanz', name: 'Tanz', color: '#8a6d2f', order: 300 },
  { id: 'yoga', name: 'Yoga', color: '#c48e6a', order: 0 },
];

const DOC_ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`;

async function listDocIds(collectionName: string): Promise<string[]> {
  const response = await fetch(`${FIRESTORE_BASE}/${collectionName}?pageSize=500`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { documents?: Array<{ name: string }> };
  // doc.name is the full resource path; the id is its last segment.
  return (payload.documents ?? []).map((doc) => doc.name.split('/').pop() as string);
}

async function deleteDocs(collectionName: string, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      fetch(`${FIRESTORE_BASE}/${collectionName}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer owner' },
      }).catch(() => {})
    )
  );
}

async function clearCollection(collectionName: string): Promise<void> {
  await deleteDocs(collectionName, await listDocIds(collectionName));
}

/**
 * Brings the `categories` collection to the canonical seed state.
 *
 * Deliberately *reconciles* rather than wipe-then-reseed, and writes the seven
 * documents in a single atomic commit. Both details matter:
 *
 * The app mounts `SeedBootstrap` on every page load, which calls
 * `seedCategoriesIfEmpty()`: it reads the collection and, if it finds it empty,
 * batch-writes the seven canonical categories itself. A wipe-then-reseed leaves
 * a window where the collection really is empty, so the app writes against the
 * test — which showed up as the row order collapsing to alphabetical (the
 * `order` field not yet landed) and as "element is not stable" click failures,
 * because the resulting snapshot bursts kept re-rendering the list under the
 * open dialog.
 *
 * Reconciling means the collection is never empty, so `seedCategoriesIfEmpty`
 * always short-circuits; the single commit means a reader never observes a
 * half-seeded set.
 */
async function resetCategories(): Promise<void> {
  const writes = SEED_CATEGORIES.map((cat) => ({
    update: {
      name: `${DOC_ROOT}/categories/${cat.id}`,
      fields: {
        name: { stringValue: cat.name },
        color: { stringValue: cat.color },
        order: { integerValue: String(cat.order) },
        createdBy: { stringValue: 'system' },
      },
    },
  }));

  await fetch(`http://127.0.0.1:8181/v1/${DOC_ROOT}:commit`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });

  // Remove anything this or an earlier run added on top of the seed set
  // (TestCat-* from the create/rename tests), but never the seed docs
  // themselves — that is what would open the empty window again.
  const seedIds = new Set(SEED_CATEGORIES.map((c) => c.id));
  const strays = (await listDocIds('categories')).filter((id) => !seedIds.has(id));
  await deleteDocs('categories', strays);
}

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const newCategoryName = (suffix: string) => `TestCat-${RUN_ID}-${suffix}`;

// This spec rewrites the shared `categories` registry — briefly renaming or
// deleting a seed category, which the wizard's category picker and the
// calendar's filter chips both read. It therefore runs in the dedicated
// `destructive` Playwright project, which starts only after the parallel suite
// has finished (see playwright.config.ts), and is not part of @smoke.
//
// It no longer wipes the `events` collection: that was only needed while the
// reset raced the app's own category bootstrap (see resetCategories above).
test.describe('Admin Kategorien tab', () => {
  test.beforeEach(async () => {
    await resetCategories();
  });

  test.afterEach(async ({ page }) => {});

  test('seeds the 7 canonical categories on first visit when the collection is empty', async ({
    page,
  }) => {
    await clearCollection('categories');
    await page.goto('/');
    await waitForCalendarToLoad(page);

    for (const name of SEED_NAMES) {
      await expect(page.locator(`.filter-chip--category:has-text("${name}")`)).toBeVisible({
        timeout: 15000,
      });
    }
  });

  test('admin can open the Kategorien tab and see all 7 seed categories', async ({ page }) => {
    await page.goto('/admin?tab=categories');

    await expect(page.getByTestId('admin-tab-categories')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('categories-tab')).toBeVisible();

    for (const name of SEED_NAMES) {
      await expect(
        page.locator('[data-testid="category-row"]').filter({ hasText: name })
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('admin can create a new category via the dialog', async ({ page }) => {
    const name = newCategoryName('create');
    await page.goto('/admin?tab=categories');

    await page.getByTestId('categories-tab-add').click();
    await expect(page.getByTestId('category-edit-dialog')).toBeVisible();

    await page.getByTestId('category-edit-name').fill(name);
    await page.getByTestId('color-picker-hex').fill('#4a7572');
    await page.getByTestId('category-edit-save').click();

    await expect(page.getByTestId('category-edit-dialog')).toBeHidden();

    await expect(
      page.locator(`[data-testid="category-row"]`).filter({ hasText: name })
    ).toBeVisible();

    await page.goto('/');
    await waitForCalendarToLoad(page);
    await expect(page.locator(`.filter-chip--category:has-text("${name}")`)).toBeVisible();
  });

  test('admin can recolor an existing category and the calendar updates', async ({ page }) => {
    await page.goto('/admin?tab=categories');

    const yogaRow = page.locator('[data-testid="category-row"]').filter({ hasText: 'Yoga' });
    await yogaRow.getByTestId('category-row-edit').click();
    await expect(page.getByTestId('category-edit-dialog')).toBeVisible();
    await page.getByTestId('color-picker-hex').fill('#4a7572');
    await page.getByTestId('category-edit-save').click();

    await expect(page.getByTestId('category-edit-dialog')).toBeHidden();

    await page.goto('/');
    await waitForCalendarToLoad(page);
    const yogaChip = page.locator('.filter-chip--category', { hasText: 'Yoga' });
    await expect(yogaChip).toHaveAttribute('style', /4a7572/i);
  });

  test('admin can delete an unused category after confirmation', async ({ page }) => {
    await page.goto('/admin?tab=categories');

    const row = page.locator('[data-testid="category-row"]').filter({ hasText: 'Soundhealing' });
    await row.getByTestId('category-row-delete').click();

    // The confirm dialog's text differs based on whether the category is
    // in use; match either form.
    await expect(page.getByText(/(wirklich gelöscht|wird aktuell)/)).toBeVisible();
    // Scope the confirm button to the dialog (category rows also have
    // "Löschen" buttons, which would trigger the strict-mode violation).
    await page.locator('.confirm-dialog').getByRole('button', { name: 'Löschen' }).click();

    await expect(
      page.locator('[data-testid="category-row"]').filter({ hasText: 'Soundhealing' })
    ).toHaveCount(0);

    await page.goto('/');
    await waitForCalendarToLoad(page);
    await expect(page.locator('.filter-chip--category', { hasText: 'Soundhealing' })).toHaveCount(
      0
    );
  });

  test('admin can rename a category and the row text updates', async ({ page }) => {
    const newName = newCategoryName('renamed');
    await page.goto('/admin?tab=categories');

    const row = page.locator('[data-testid="category-row"]').filter({ hasText: 'Singen' });
    await row.getByTestId('category-row-edit').click();
    await page.getByTestId('category-edit-name').fill(newName);
    await page.getByTestId('category-edit-save').click();

    await expect(page.getByTestId('category-edit-dialog')).toBeHidden();

    await expect(
      page.locator('[data-testid="category-row"]').filter({ hasText: 'Singen' })
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="category-row"]').filter({ hasText: newName })
    ).toBeVisible();
  });

  test('rejects saving a category with an invalid hex code', async ({ page }) => {
    await page.goto('/admin?tab=categories');

    await page.getByTestId('categories-tab-add').click();
    await page.getByTestId('category-edit-name').fill(newCategoryName('badhex'));

    const hex = page.getByTestId('color-picker-hex');
    await hex.fill('not-a-color');
    await expect(hex).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('category-edit-save')).toBeDisabled();
  });

  test('admin can reorder categories and the new order is reflected on the admin page', async ({
    page,
  }) => {
    await page.goto('/admin?tab=categories');
    await expect(page.getByTestId('categories-tab')).toBeVisible();
    await expect(page.locator('[data-testid="category-row"]')).toHaveCount(7, { timeout: 15000 });

    // Capture Yoga's current index. After clicking "down" once, Yoga swaps
    // with the row immediately below it — that row's id will be left at
    // Yoga's original index, so we assert against the row at yogaIdx.
    const yogaIdx = await page.locator('[data-testid="category-row"]').evaluateAll((rows) => {
      return rows.findIndex((row) => {
        const id = row.getAttribute('data-category-id');
        return id === 'yoga' || (row.textContent && row.textContent.includes('Yoga'));
      });
    });
    expect(yogaIdx).toBeGreaterThanOrEqual(0);
    const yogaNeighbourId = await page
      .locator('[data-testid="category-row"]')
      .nth(yogaIdx + 1)
      .getAttribute('data-category-id');

    await page
      .locator('[data-testid="category-row"]')
      .filter({ hasText: 'Yoga' })
      .getByTestId('category-row-down')
      .click();

    await expect(page.locator('[data-testid="category-row"]').nth(yogaIdx)).toHaveAttribute(
      'data-category-id',
      yogaNeighbourId,
      { timeout: 15000 }
    );

    // Yoga should now sit one row below where it started.
    await expect(page.locator('[data-testid="category-row"]').nth(yogaIdx + 1)).toHaveAttribute(
      'data-category-id',
      'yoga',
      { timeout: 15000 }
    );
  });

  test('the first row has its up button disabled and the last row its down button', async ({
    page,
  }) => {
    await page.goto('/admin?tab=categories');

    const rows = page.locator('[data-testid="category-row"]');
    // Wait for the full seeded set before asserting on order: the registry
    // renders incrementally as the Firestore snapshot arrives, and a row read
    // mid-stream sorts alphabetically because `order` has not landed yet.
    await expect(rows).toHaveCount(SEED_CATEGORIES.length, { timeout: 15000 });
    await expect(rows.first()).toHaveAttribute('data-category-id', 'yoga', { timeout: 15000 });
    await expect(rows.first().getByTestId('category-row-up')).toBeDisabled();
    await expect(rows.last().getByTestId('category-row-down')).toBeDisabled();
  });
});
