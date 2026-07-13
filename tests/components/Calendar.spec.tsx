import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Calendar from '../../src/components/Calendar'

const currentMonth = new Date()

describe('Calendar', () => {
  it('renders calendar header', () => {
    render(
      <Calendar
        events={[]}
        onEventClick={() => {}}
        currentMonth={currentMonth}
        onMonthChange={() => {}}
      />
    )
    expect(screen.getByText('Heute')).toBeInTheDocument()
  })

  it('renders navigation buttons', () => {
    render(
      <Calendar
        events={[]}
        onEventClick={() => {}}
        currentMonth={currentMonth}
        onMonthChange={() => {}}
      />
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
