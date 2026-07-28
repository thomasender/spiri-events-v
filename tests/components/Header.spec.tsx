import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../../src/components/Header';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    logout: () => {},
  }),
}));

describe('Header', () => {
  it('renders logo with title', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('Spirituelle Events')).toBeInTheDocument();
  });

  it('renders navigation link when logged out', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('Kalender')).toBeInTheDocument();
  });
});
