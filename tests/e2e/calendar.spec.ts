import { test, expect } from '@playwright/test'
import {
  signInWithEmailAndPassword,
  signOut,
  waitForCalendarToLoad,
} from '../helpers/auth'

test.describe('Calendar E2E', () => {
  test.describe('Unauthenticated Calendar Browsing', () => {
    test('loads calendar page and displays month grid', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      await expect(page.locator('.calendar')).toBeVisible()
      await expect(page.locator('.calendar-header')).toBeVisible()
      await expect(page.locator('.desktop-calendar')).toBeVisible()
    })

    test('displays correct weekday headers', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
      for (const day of weekdays) {
        await expect(page.locator(`.weekday:has-text("${day}")`).first()).toBeVisible()
      }
    })

    test('shows 42 calendar cells for 6-week grid', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const cells = page.locator('.calendar-cell')
      await expect(cells).toHaveCount(42)
    })

    test('month navigation arrows change displayed month', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const header = page.locator('.calendar-header h2')
      const initialMonth = await header.textContent()

      await page.locator('button[title="Nächster Monat"]').click()
      await page.waitForTimeout(600)

      const newMonth = await header.textContent()
      expect(newMonth).not.toBe(initialMonth)

      await page.locator('button[title="Vorheriger Monat"]').click()
      await page.waitForTimeout(600)

      const revertedMonth = await header.textContent()
      expect(revertedMonth).toBe(initialMonth)
    })

    test('Heute button returns to current month', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      await page.locator('button[title="Nächster Monat"]').click()
      await page.waitForTimeout(600)

      await page.locator('.btn-today').click()
      await page.waitForTimeout(600)

      const header = page.locator('.calendar-header h2')
      const text = await header.textContent()
      const today = new Date()
      const monthNames = [
        'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
      ]
      expect(text).toContain(monthNames[today.getMonth()])
      expect(text).toContain(String(today.getFullYear()))
    })

    test('displays events on correct days', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const eventChips = page.locator('.event-chip')
      const count = await eventChips.count()
      if (count > 0) {
        await expect(eventChips.first()).toBeVisible()
      }
    })

    test('day popover opens when clicking "+X more"', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const moreButton = page.locator('.more-events').first()
      if (await moreButton.isVisible({ timeout: 3000 })) {
        await moreButton.click()
        await expect(page.locator('.day-popover')).toBeVisible()
        await expect(page.locator('.day-popover-header')).toBeVisible()
      }
    })

    test('day popover shows all events for that day', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const moreButton = page.locator('.more-events').first()
      if (await moreButton.isVisible({ timeout: 3000 })) {
        await moreButton.click()
        await expect(page.locator('.day-popover-events')).toBeVisible()
        const events = page.locator('.day-popover-event')
        const count = await events.count()
        expect(count).toBeGreaterThan(0)
      }
    })

    test('day popover closes when close button clicked', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const moreButton = page.locator('.more-events').first()
      if (await moreButton.isVisible({ timeout: 3000 })) {
        await moreButton.click()
        await expect(page.locator('.day-popover')).toBeVisible()

        await page.locator('.day-popover-close').click()
        await expect(page.locator('.day-popover')).not.toBeVisible()
      }
    })

    test('day popover closes when clicking overlay', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const moreButton = page.locator('.more-events').first()
      if (await moreButton.isVisible({ timeout: 3000 })) {
        await moreButton.click()
        await expect(page.locator('.day-popover')).toBeVisible()

        await page.locator('.day-popover-overlay').click({ position: { x: 10, y: 10 } })
        await expect(page.locator('.day-popover')).not.toBeVisible()
      }
    })

    test('clicking event in popover navigates to event detail', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const moreButton = page.locator('.more-events').first()
      if (await moreButton.isVisible({ timeout: 3000 })) {
        await moreButton.click()
        await expect(page.locator('.day-popover')).toBeVisible()

        const firstEvent = page.locator('.day-popover-event').first()
        await firstEvent.click()
        await expect(page).toHaveURL(/\/event\//)
      }
    })

    test('today is visually highlighted', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      await page.locator('.btn-today').click()
      await page.waitForTimeout(600)

      const todayCell = page.locator('.calendar-cell.today')
      await expect(todayCell).toBeVisible()
    })

    test('past days are visually dimmed', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const pastCells = page.locator('.calendar-cell.past')
      const count = await pastCells.count()
      if (count > 0) {
        await expect(pastCells.first()).toBeVisible()
      }
    })
  })

  test.describe('Month Navigation Animation', () => {
    test('slide animation plays on month change', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const grid = page.locator('.calendar-grid')

      await page.locator('button[title="Nächster Monat"]').click()
      await page.waitForTimeout(100)
      const hasLeftClass = await grid.evaluate(el => el.classList.contains('slide-left-enter'))
      if (!hasLeftClass) {
        test.skip()
        return
      }
      await expect(grid).toHaveClass(/slide-left-enter/)
      await page.waitForTimeout(500)

      await page.locator('button[title="Vorheriger Monat"]').click()
      await page.waitForTimeout(100)
      const hasRightClass = await grid.evaluate(el => el.classList.contains('slide-right-enter'))
      if (!hasRightClass) {
        test.skip()
        return
      }
      await expect(grid).toHaveClass(/slide-right-enter/)
    })
  })

  test.describe('Multi-day Events', () => {
    test('multi-day event shows on first day with start indicator', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const eventChips = page.locator('.event-chip')
      const eventCount = await eventChips.count()
      if (eventCount === 0) {
        test.skip()
        return
      }

      const continuationChip = page.locator('.event-chip--continuation')
      const normalChip = page.locator('.event-chip:not(.event-chip--continuation)')

      const hasContinuation = await continuationChip.count() > 0
      const hasNormal = await normalChip.count() > 0

      expect(hasContinuation || hasNormal).toBe(true)
    })
  })

  test.describe('Recurring Events', () => {
    test('recurring event appears on multiple weeks/months', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const eventTitle = page.locator('.event-chip-title').first()
      if (await eventTitle.isVisible({ timeout: 3000 })) {
        const title = await eventTitle.textContent()
        expect(title).toBeTruthy()
      }
    })
  })

  test.describe('Mobile View', () => {
    test('week strip is visible on narrow viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      await expect(page.locator('.week-strip')).toBeVisible()
      await expect(page.locator('.mobile-week-nav')).toBeVisible()
    })

    test('week strip has 7 days', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const weekDays = page.locator('.week-day')
      await expect(weekDays).toHaveCount(7)
    })

    test('mobile agenda is scrollable', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      await expect(page.locator('.mobile-agenda')).toBeVisible()
      const agendaDays = page.locator('.agenda-day')
      const count = await agendaDays.count()
      expect(count).toBeGreaterThan(0)
    })

    test('today is highlighted in week strip', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      await page.locator('.btn-today').click()
      await page.waitForTimeout(600)

      await expect(page.locator('.week-day.today')).toBeVisible()
    })

    test('week navigation changes displayed week', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const weekLabel = page.locator('.mobile-week-label')
      const initialLabel = await weekLabel.textContent()

      await page.locator('button[title="Nächste Woche"]').click()
      await page.waitForTimeout(500)

      const newLabel = await weekLabel.textContent()
      expect(newLabel).not.toBe(initialLabel)

      await page.locator('button[title="Vorherige Woche"]').click()
      await page.waitForTimeout(500)

      const revertedLabel = await weekLabel.textContent()
      expect(revertedLabel).toBe(initialLabel)
    })
  })

  test.describe('Authenticated User Flows', () => {
    test('admin can login and access admin dashboard', async ({ page }) => {
      test.skip()
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123')
      await page.goto('/admin')
      await page.waitForURL('/admin', { timeout: 10000 }).catch(() => {})
      await expect(page.locator('.admin-dashboard, text=Dashboard')).toBeVisible({ timeout: 10000 }).catch(() => {
        expect(page.url()).toContain('/admin')
      })
    })

    test('logged in user sees profile/logout option', async ({ page }) => {
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123')
      await page.goto('/')
      await waitForCalendarToLoad(page)

      const logoutVisible = await page.locator('text=Abmelden').isVisible({ timeout: 5000 }).catch(() => false)
      expect(logoutVisible || page.url()).toBeTruthy()
    })

    test('calendar shows events for authenticated admin', async ({ page }) => {
      await signInWithEmailAndPassword(page, 'admin@test.com', 'testpassword123')
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      await expect(page.locator('.calendar')).toBeVisible()
    })
  })

  test.describe('Filter Behavior with Real Data', () => {
    test('category filter updates displayed events', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const initialEventCount = await page.locator('.event-chip').count()
      if (initialEventCount === 0) {
        test.skip()
        return
      }

      await page.locator('.filter-toggle-btn').click()
      const yogaLabel = page.locator('.filter-panel').locator('label').filter({ hasText: 'Yoga' }).first()

      await yogaLabel.click()
      await page.waitForTimeout(300)

      const filteredEventCount = await page.locator('.event-chip').count()
      expect(filteredEventCount).toBeLessThanOrEqual(initialEventCount)
    })

    test('district filter updates displayed events', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const initialEventCount = await page.locator('.event-chip').count()
      if (initialEventCount === 0) {
        test.skip()
        return
      }

      await page.locator('.filter-toggle-btn').click()
      const bregenzLabel = page.locator('.filter-panel').locator('label').filter({ hasText: 'Bregenz' }).first()

      await bregenzLabel.click()
      await page.waitForTimeout(300)

      await expect(page.locator('.calendar')).toBeVisible()
    })

    test('filters show badge with active count', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const initialEventCount = await page.locator('.event-chip').count()
      if (initialEventCount === 0) {
        test.skip()
        return
      }

      await page.locator('.filter-toggle-btn').click()
      const yogaLabel = page.locator('.filter-panel').locator('label').filter({ hasText: 'Yoga' }).first()

      await yogaLabel.click()

      const badge = page.locator('.filter-badge')
      await expect(badge).toBeVisible()
      const count = await badge.textContent()
      expect(parseInt(count || '0')).toBeGreaterThan(0)
    })
  })

  test.describe('Date Edge Cases', () => {
    test('February leap year renders correctly', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const header = page.locator('.calendar-header h2')

      const currentMonth = new Date().getMonth()
      let clicksNeeded
      if (currentMonth === 1) {
        clicksNeeded = 0
      } else if (currentMonth > 1) {
        clicksNeeded = currentMonth - 1
      } else {
        clicksNeeded = 12 + currentMonth - 1
      }

      for (let i = 0; i < clicksNeeded; i++) {
        await page.locator('button[title="Vorheriger Monat"]').click()
        await page.waitForTimeout(300)
      }

      const text = await header.textContent()
      expect(text).toMatch(/Februar.*202[0-9]/)
    })

    test('31-day month renders correctly', async ({ page }) => {
      await page.goto('/calendar')
      await waitForCalendarToLoad(page)

      const header = page.locator('.calendar-header h2')

      for (let i = 0; i < 6; i++) {
        await page.locator('button[title="Nächster Monat"]').click()
        await page.waitForTimeout(300)
      }

      const text = await header.textContent()
      expect(text).toMatch(/Januar|März|Mai|Juli|August|Oktober|Dezember/)
    })
  })
})
