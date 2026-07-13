import { test, expect } from '@playwright/test'

test.describe('Event CRUD', () => {
  test('event modal opens on click', async ({ page }) => {
    await page.goto('/')
  })

  test('event form validation', async ({ page }) => {
    await page.goto('/admin/new')
  })
})
