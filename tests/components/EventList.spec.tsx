import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EventList from '../../src/components/EventList'

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test' }, role: null }),
}))

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => ({
    events: [],
    loading: false,
    deleteEvent: vi.fn(),
  }),
  usePendingEvents: () => ({
    pendingEvents: [],
    loading: false,
    approveEvent: vi.fn(),
  }),
}))

describe('EventList', () => {
  it('renders empty state when no events', () => {
    render(
      <MemoryRouter>
        <EventList />
      </MemoryRouter>
    )
    expect(screen.getByText(/noch keine events/i)).toBeInTheDocument()
  })
})
