import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EventForm from '../../src/components/EventForm'

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test' } }),
}))

vi.mock('../../src/hooks/useEvents', () => ({
  useEvents: () => ({
    addEvent: vi.fn(),
    updateEvent: vi.fn(),
  }),
  KATEGORIEN: ['Yoga', 'Meditation', 'Tanz', 'Singen', 'Atemarbeit', 'Sonstiges'],
  BEZIRKE: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz'],
}))

describe('EventForm', () => {
  it('renders form title', () => {
    render(
      <MemoryRouter>
        <EventForm />
      </MemoryRouter>
    )
    expect(screen.getByText('Neues Event erstellen')).toBeInTheDocument()
  })

  it('renders submit button', () => {
    render(
      <MemoryRouter>
        <EventForm />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: /speichern/i })).toBeInTheDocument()
  })
})
