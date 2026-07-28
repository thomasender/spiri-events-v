import { test, expect } from '@playwright/test'
import {
  signInWithEmailAndPassword,
  signOut,
} from '../helpers/auth'

const PENDING_EVENT_ID = 'test-event-pending'

test.describe('Admin Edit Pending Event', () => {
  test.afterEach(async ({ page }) => {
    await signOut(page)
  })

  test('admin can edit pending event directly via URL', async ({ page }) => {
    test.skip()
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123')

    await page.goto('/admin/edit/test-event-pending')
    await page.waitForTimeout(3000)

    const url = page.url()
    console.log('Current URL:', url)

    const h1 = await page.locator('h1').textContent()
    console.log('h1:', h1)

    await expect(page.locator('h1')).toContainText('Event bearbeiten', { timeout: 10000 })
  })

  test('admin sees pending event in edit list and can navigate to edit', async ({ page }) => {
    test.skip()
    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123')

    await page.goto('/admin')

    await page.waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 }).catch(() => {})

    const pendingSection = page.locator('text=Ausstehende Genehmigungen')
    await expect(pendingSection).toBeVisible({ timeout: 10000 })

    const editButton = page.locator(`a[href="/admin/edit/${PENDING_EVENT_ID}"]`).first()
    await expect(editButton).toBeVisible()

    await editButton.click()

    await page.waitForURL(/\/admin\/edit\//)
    await page.waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 }).catch(() => {})

    await expect(page.locator('h1')).toContainText('Event bearbeiten', { timeout: 10000 })
  })

  test('mobile: admin can edit pending event directly via URL', async ({ page }) => {
    test.skip()
    await page.setViewportSize({ width: 375, height: 667 })

    await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123')

    await page.goto(`/admin/edit/${PENDING_EVENT_ID}`)

    await page.waitForURL(/\/admin\/edit\//)
    await page.waitForSelector('.loading-spinner', { state: 'hidden', timeout: 15000 }).catch(() => {})

    await expect(page.locator('h1')).toContainText('Event bearbeiten', { timeout: 10000 })
  })
})