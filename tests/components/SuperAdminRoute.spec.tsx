import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let auth: Record<string, unknown> = { role: null, loading: false };
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => auth }));

// App.jsx pulls in every page; only the route guard is under test.
vi.mock('../../src/pages/CalendarPage', () => ({ default: () => null }));
vi.mock('../../src/components/Header', () => ({ default: () => null }));

import { SuperAdminRoute } from '../../src/App';

function setup() {
  return render(
    <MemoryRouter initialEntries={['/admin/theme-editor']}>
      <SuperAdminRoute>
        <div data-testid="theme-editor">Theme-Editor</div>
      </SuperAdminRoute>
    </MemoryRouter>
  );
}

describe('SuperAdminRoute (e.g. /admin/theme-editor)', () => {
  beforeEach(() => {
    auth = { role: null, loading: false };
  });

  it('lets Super-Admins through', () => {
    auth = { role: 'Admin', loading: false };
    setup();
    expect(screen.getByTestId('theme-editor')).toBeInTheDocument();
  });

  it.each([
    ['a Regions-Moderator:in', { role: 'RegionModerator', staffRegionIds: ['tirol'] }],
    ['an organizer', { role: null }],
  ])('shows "Kein Zugriff" to %s instead of the page', (_who, over) => {
    auth = { ...over, loading: false };
    setup();
    expect(screen.queryByTestId('theme-editor')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-access')).toHaveTextContent('Kein Zugriff');
    expect(screen.getByRole('link', { name: 'Zurück zur Verwaltung' })).toHaveAttribute(
      'href',
      '/admin'
    );
  });

  it('waits while the role is loading', () => {
    auth = { role: null, loading: true };
    setup();
    expect(screen.queryByTestId('no-access')).not.toBeInTheDocument();
    expect(screen.queryByTestId('theme-editor')).not.toBeInTheDocument();
  });
});
