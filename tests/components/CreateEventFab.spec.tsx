import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import CreateEventFab from '../../src/components/CreateEventFab';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  canCreateEvents: false,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuth.user,
    canCreateEvents: mockAuth.canCreateEvents,
    logout: () => {},
  }),
}));

// The verification modal pulls in EmailVerificationModal which talks to
// Firebase Auth. Stub it out so the unit tests stay hermetic — the
// FAB's behaviour when this modal opens is exercised by an integration
// spec, not here.
vi.mock('../../src/components/EmailVerificationModal', () => ({
  default: ({ open }: { open: boolean }) => (
    <div data-testid="email-verification-modal-stub" data-open={open} />
  ),
}));

beforeEach(() => {
  mockAuth.user = null;
  mockAuth.canCreateEvents = false;
});

function renderFab(initialPath = '/') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<CreateEventFab />} />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/admin/new" element={<div data-testid="admin-new-page">Admin New</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('CreateEventFab (zh4jJzje)', () => {
  it('renders a floating action button with a plus icon and the German "Event erstellen" label', () => {
    renderFab();

    const fab = screen.getByTestId('create-event-fab');
    expect(fab).toBeInTheDocument();
    expect(fab.getAttribute('aria-label')).toBe('Event erstellen');
    expect(fab.textContent).toContain('Event erstellen');
  });

  it('routes signed-in verified users directly to /admin/new', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockAuth.canCreateEvents = true;

    renderFab();

    const fab = screen.getByTestId('create-event-fab');
    expect(fab.tagName).toBe('A');
    expect(fab.getAttribute('href')).toBe('/admin/new');
  });

  it('opens the verification modal for signed-in unverified users instead of navigating', () => {
    mockAuth.user = { uid: 'test-uid' };
    mockAuth.canCreateEvents = false;

    renderFab();

    const fab = screen.getByTestId('create-event-fab');
    expect(fab.tagName).toBe('BUTTON');

    fireEvent.click(fab);

    const modal = screen.getByTestId('email-verification-modal-stub');
    expect(modal.getAttribute('data-open')).toBe('true');
    expect(screen.queryByTestId('admin-new-page')).toBeNull();
  });

  it('routes logged-out users to /login', () => {
    mockAuth.user = null;
    mockAuth.canCreateEvents = false;

    renderFab();

    const fab = screen.getByTestId('create-event-fab');
    expect(fab.tagName).toBe('BUTTON');

    fireEvent.click(fab);

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-new-page')).toBeNull();
  });
});
