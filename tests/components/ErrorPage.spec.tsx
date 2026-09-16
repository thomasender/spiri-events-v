import { render, screen, act, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi } from 'vitest';
import ErrorPage from '../../src/pages/ErrorPage';

function HomeStub() {
  return <h1>Home stub</h1>;
}

function renderNotFound(initialPath = '/some-missing-page') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<HomeStub />} />
          <Route path="*" element={<ErrorPage type="not-found" />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

function renderError(error = new Error('Boom'), onRetry = vi.fn()) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/some-page']}>
        <Routes>
          <Route path="/" element={<HomeStub />} />
          <Route path="/*" element={<ErrorPage type="error" error={error} onRetry={onRetry} />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('ErrorPage', () => {
  describe('404 / not-found', () => {
    it('renders a German 404 headline and a link back home', () => {
      renderNotFound();

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seite nicht gefunden');

      const homeLink = screen.getByRole('link', { name: /zurück zur startseite/i });
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('shows a countdown at 8 seconds that can be cancelled to stop the auto-redirect', () => {
      vi.useFakeTimers();
      try {
        renderNotFound();

        expect(screen.getByText(/automatisch zur startseite weitergeleitet/i)).toHaveTextContent(
          '8 Sekunden'
        );

        const cancelButton = screen.getByRole('button', { name: /abbrechen/i });
        act(() => {
          cancelButton.click();
        });

        expect(
          screen.queryByText(/automatisch zur startseite weitergeleitet/i)
        ).not.toBeInTheDocument();
      } finally {
        vi.clearAllTimers();
        vi.useRealTimers();
        cleanup();
      }
    });
  });

  describe('runtime error', () => {
    it('renders the Oops headline and a link back home', () => {
      renderError();

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Oops, da ist etwas schief gelaufen!'
      );

      const homeLink = screen.getByRole('link', { name: /zurück zur startseite/i });
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('shows a retry button when an onRetry handler is provided and invokes it on click', () => {
      const onRetry = vi.fn();
      renderError(new Error('Boom'), onRetry);

      const retryButton = screen.getByRole('button', { name: /erneut versuchen/i });
      expect(retryButton).toBeInTheDocument();

      retryButton.click();
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('does not show a countdown or a retry button when no onRetry handler is provided', () => {
      renderError(new Error('Boom'), null);

      expect(
        screen.queryByText(/automatisch zur startseite weitergeleitet/i)
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /erneut versuchen/i })).not.toBeInTheDocument();
    });
  });
});
