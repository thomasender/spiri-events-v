import { EVENTS } from '../../src/lib/analytics';
import { Component } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi } from 'vitest';
import ErrorBoundary from '../../src/components/ErrorBoundary';

function Boom() {
  throw new Error('Kaboom');
}

class ToggleableBoom extends Component {
  constructor(props) {
    super(props);
    this.state = { shouldThrow: props.shouldThrow ?? true };
  }
  render() {
    if (this.state.shouldThrow) {
      throw new Error('Kaboom');
    }
    return <p>Recovered content</p>;
  }
}

function renderWithRouter(node) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={node} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('ErrorBoundary', () => {
  it('renders its children when no error happens', () => {
    renderWithRouter(
      <ErrorBoundary>
        <p>Happy child</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('Happy child')).toBeInTheDocument();
  });

  it('catches a render-time error and shows the error page', () => {
    renderWithRouter(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Oops, da ist etwas schief gelaufen!'
    );
    expect(screen.getByRole('link', { name: /zurück zur startseite/i })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('exposes a retry button after catching an error', () => {
    renderWithRouter(
      <ErrorBoundary>
        <ToggleableBoom shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /erneut versuchen/i })).toBeInTheDocument();
  });

  it('hides the retry button when disableRetry is set', () => {
    renderWithRouter(
      <ErrorBoundary disableRetry>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.queryByRole('button', { name: /erneut versuchen/i })).not.toBeInTheDocument();
  });
});

const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/analytics')>()),
  trackEvent: track,
}));

describe('ErrorBoundary analytics', () => {
  it('reports a truncated exception without e-mail addresses', () => {
    track.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Leaky() {
      throw new Error(`${'x'.repeat(200)} anna@example.com`);
    }
    renderWithRouter(
      <ErrorBoundary>
        <Leaky />
      </ErrorBoundary>
    );
    expect(track).toHaveBeenCalledTimes(1);
    const [name, params] = track.mock.calls[0];
    expect(name).toBe(EVENTS.EXCEPTION);
    expect(params.description.length).toBeLessThanOrEqual(100);
    expect(params.description).not.toContain('@');
  });

  it('replaces e-mail addresses in short messages', () => {
    track.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Leaky() {
      throw new Error('failed for anna@example.com');
    }
    renderWithRouter(
      <ErrorBoundary>
        <Leaky />
      </ErrorBoundary>
    );
    expect(track.mock.calls[0][1].description).toBe('failed for [email]');
  });
});
