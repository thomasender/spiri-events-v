import { test, expect } from '@playwright/test';
import { signInWithEmailAndPassword, signOut, waitForCalendarToLoad } from '../helpers/auth';

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
  { id: 'breathwork', name: 'Breathwork', color: '#bf5b4e' },
  { id: 'meditation', name: 'Meditation', color: '#5c6b3f' },
  { id: 'singen', name: 'Singen', color: '#9a5f38' },
  { id: 'sonstiges', name: 'Sonstiges', color: '#605e5e' },
  { id: 'soundhealing', name: 'Soundhealing', color: '#6b568b' },
  { id: 'tanz', name: 'Tanz', color: '#8a6d2f' },
  { id: 'yoga', name: 'Yoga', color: '#c48e6a' },
];

async function clearCollection(collectionName: string): Promise<void> {
  const response = await fetch(`${FIRESTORE_BASE}/${collectionName}?pageSize=500`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (!response.ok) return;
  const payload = (await response.json()) as { documents?: Array<{ name: string }> };
  const docs = payload.documents || [];
  await Promise.all(
    docs.map((doc) =>
      fetch(doc.name.replace(/^.*\/v1/, FIRESTORE_BASE), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer owner' },
      }).catch(() => {})
    )
  );
}

async function seedCategories(): Promise<void> {
  await Promise.all(
    SEED_CATEGORIES.map((cat) =>
      fetch(`${FIRESTORE_BASE}/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            name: { stringValue: cat.name },
            color: { stringValue: cat.color },
            createdBy: { stringValue: 'system' },
          },
        }),
      })
    )
  );
}

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const newCategoryName = (suffix: string) => `TestCat-${RUN_ID}-${suffix}`;

test.describe('Admin Kategorien tab (Uu0EoNra)', () => {
  test.beforeEach(async () => {
    // Wipe categories and pre-seed via the REST API so the registry has
    // a known state before the browser opens. Skips the SeedBootstrap
    // path entirely — the bootstrap is covered by the seed test below.
    await clearCollection('categories');
    await seedCategories();
    await clearCollection('events');
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

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
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
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
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
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
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
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
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
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
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
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
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123');
    await page.goto('/admin?tab=categories');

    await page.getByTestId('categories-tab-add').click();
    await page.getByTestId('category-edit-name').fill(newCategoryName('badhex'));

    const hex = page.getByTestId('color-picker-hex');
    await hex.fill('not-a-color');
    await expect(hex).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('category-edit-save')).toBeDisabled();
  });
});
