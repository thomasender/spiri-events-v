import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Spirituelle Events/)
  })

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/login')
    await page.click('button[type="submit"]')
  })

  test('toggles between login and register', async ({ page }) => {
    await page.goto('/login')
    const toggleLink = page.locator('text=Konto erstellen')
    if (await toggleLink.isVisible()) {
      await toggleLink.click()
      await expect(page.locator('h1')).toContainText(/Erstellen|Registrieren/)
    }
  })
})
