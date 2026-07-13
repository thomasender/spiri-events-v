import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('homepage loads calendar', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.calendar')).toBeVisible()
  })

  test('header navigation works', async ({ page }) => {
    await page.goto('/')
    await page.locator('.logo').click()
    await expect(page).toHaveURL('/')
  })

  test('calendar navigation changes month', async ({ page }) => {
    await page.goto('/')
    const initialMonth = await page.locator('.calendar-title h2').textContent()
    await page.locator('.btn-nav').last().click()
    const newMonth = await page.locator('.calendar-title h2').textContent()
    expect(newMonth).not.toBe(initialMonth)
  })

  test('today button returns to current month', async ({ page }) => {
    await page.goto('/')
    await page.locator('.btn-nav').last().click()
    await page.locator('.btn-today').click()
    await expect(page.locator('.btn-today')).toBeVisible()
  })
})
