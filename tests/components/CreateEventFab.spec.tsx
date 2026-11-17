import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import CreateEventFab from '../../src/components/CreateEventFab';
import { RegionContext, DEFAULT_REGION_CONTEXT } from '../../src/hooks/useRegion';

const mockAuth = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  canCreateEvents: false,
}));

function renderFab(initialPath = '/') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<CreateEventFab />} />
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

  // Everybody goes straight into the wizard: guests and unconfirmed members are
  // asked to log in / confirm only at its end (docs/guest-event-draft.md).
  it('opens the wizard directly for everybody, signed in or not', () => {
    renderFab();

    const fab = screen.getByTestId('create-event-fab');
    expect(fab.tagName).toBe('A');
    expect(fab.getAttribute('href')).toBe('/admin/new');

    fireEvent.click(fab);
    expect(screen.getByTestId('admin-new-page')).toBeInTheDocument();
  });
});

describe('CreateEventFab on a coming-soon region page (yA90Y5W1)', () => {
  it('links to the event form of that region, not the default one', () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/']}>
          <RegionContext.Provider
            value={{ ...DEFAULT_REGION_CONTEXT, regionId: 'tirol', comingSoon: true }}
          >
            <CreateEventFab />
          </RegionContext.Provider>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(screen.getByTestId('create-event-fab').getAttribute('href')).toBe(
      '/admin/new?region=tirol'
    );
  });
});
