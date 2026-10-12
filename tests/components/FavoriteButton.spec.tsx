import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import FavoriteButton from '../../src/components/FavoriteButton';

const state = vi.hoisted(() => ({
  ready: true,
  isSignedIn: false,
  ids: new Set<string>(),
  toggleFavorite: vi.fn(),
}));

vi.mock('../../src/hooks/useFavorites', () => ({
  useFavorites: () => ({
    ready: state.ready,
    isSignedIn: state.isSignedIn,
    favoriteIds: state.ids,
    isFavorite: (id: string) => state.ids.has(id),
    toggleFavorite: state.toggleFavorite,
  }),
}));

const setPendingFavorite = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/favoritesStore', () => ({ setPendingFavorite }));

const renderButton = () =>
  render(
    <MemoryRouter initialEntries={['/?month=10']}>
      <Link to="/event/x">
        <FavoriteButton eventId="evt-1" />
      </Link>
    </MemoryRouter>
  );

beforeEach(() => {
  state.ready = true;
  state.isSignedIn = false;
  state.ids = new Set();
  state.toggleFavorite = vi.fn().mockResolvedValue(undefined);
});

describe('FavoriteButton', () => {
  it('toggles the favorite for a signed-in user', () => {
    state.isSignedIn = true;
    renderButton();
    const btn = screen.getByTestId('favorite-button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(state.toggleFavorite).toHaveBeenCalledWith('evt-1');
    expect(screen.queryByTestId('login-prompt-modal')).toBeNull();
  });

  it('shows as pressed for a favorited event', () => {
    state.isSignedIn = true;
    state.ids = new Set(['evt-1']);
    renderButton();
    expect(screen.getByTestId('favorite-button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the login prompt for visitors and remembers the event', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('favorite-button'));
    expect(state.toggleFavorite).not.toHaveBeenCalled();
    expect(screen.getByTestId('login-prompt-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('login-prompt-login'));
    expect(setPendingFavorite).toHaveBeenCalledWith('evt-1');
  });
});
