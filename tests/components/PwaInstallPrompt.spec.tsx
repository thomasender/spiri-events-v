import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import PwaInstallPrompt, { PWA_OPEN_REQUEST_EVENT } from '../../src/components/PwaInstallPrompt';
import Footer from '../../src/components/Footer';
import { _resetPwaInstallStateForTests } from '../../src/hooks/usePwaInstall';

const STORAGE_KEY = 'pwa-install-pref';
const MOBILE_QUERY = '(max-width: 800px)';
const DELAY = 15000;

function setMobileViewport(matches) {
  // happy-dom's matchMedia returns a static, query-independent stub by
  // default, which would falsely satisfy `(display-mode: standalone)` checks
  // and break the standalone gating. Provide a tiny implementation that
  // only honours the mobile breakpoint and reports false for every other
  // query — close enough for the gate tests we run here.
  const listeners = new Map();
  const make = (query) => {
    const matchesFor = (query) => (query === MOBILE_QUERY ? matches : false);
    return {
      get matches() {
        return matchesFor(query);
      },
      media: query,
      onchange: null,
      addEventListener: (_event, cb) => listeners.set(query, cb),
      removeEventListener: () => listeners.delete(query),
      addListener: (cb) => listeners.set(query, cb),
      removeListener: () => listeners.delete(query),
      dispatchEvent: (event) => {
        const cb = listeners.get(query);
        if (cb) cb(event);
        return true;
      },
    };
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: make,
  });
}

function setIOS(enabled) {
  if (enabled) {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
  } else {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  }
}

function fireBeforeInstallPrompt(overrides = {}) {
  const event = new Event('beforeinstallprompt');
  event.preventDefault = () => {};
  event.prompt = overrides.prompt ?? (() => {});
  event.userChoice = overrides.userChoice ?? Promise.resolve({ outcome: 'accepted' });
  Object.assign(event, overrides);
  // Dispatching a custom event that triggers a React state update outside of
  // an act() block can leave React with pending work, which then fights with
  // fake-timer advancement and renders the assertion flaky. Wrap the
  // dispatch so all follow-up effects flush before the test continues.
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

function renderWithRouter(children, { initialPath = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<>{children}</>} />
        <Route path="/impressum" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );
}

function NavigationHarness() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/impressum')} data-testid="nav-impressum">
      go
    </button>
  );
}

describe('PwaInstallPrompt', () => {
  beforeEach(() => {
    _resetPwaInstallStateForTests();
    localStorage.clear();
    setMobileViewport(true);
    setIOS(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render before the delay elapses', () => {
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
  });

  it('renders the popup after the delay when eligible', () => {
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(screen.getByTestId('pwa-install-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('pwa-install-install')).toBeInTheDocument();
    expect(screen.getByTestId('pwa-install-later')).toBeInTheDocument();
  });

  it('does not render when pref is already "dismissed"', () => {
    localStorage.setItem(STORAGE_KEY, 'dismissed');
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
  });

  it('does not render when pref is "accepted"', () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
  });

  it('does not render on iOS even after the delay', () => {
    setIOS(true);
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
  });

  it('does not render on desktop viewport', () => {
    setMobileViewport(false);
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
  });

  it('clicking "Nicht jetzt" persists dismissed and closes the popup', () => {
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    fireEvent.click(screen.getByTestId('pwa-install-later'));
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dismissed');
  });

  it('clicking the close button persists dismissed and closes', () => {
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    fireEvent.click(screen.getByTestId('pwa-install-close'));
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dismissed');
  });

  it('Escape key persists dismissed and closes', () => {
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dismissed');
  });

  it('clicking the overlay persists dismissed and closes', () => {
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    fireEvent.click(screen.getByTestId('pwa-install-overlay'));
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dismissed');
  });

  it('clicking "Installieren" closes the popup and calls the native prompt', async () => {
    const prompt = vi.fn();
    const userChoice = Promise.resolve({ outcome: 'accepted' });
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt({ prompt, userChoice });
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    // The click handler awaits the userChoice promise — fake timers would
    // freeze the microtask queue, so let real timers run for the promise
    // resolution while keeping the surrounding setTimeout fake.
    vi.useRealTimers();
    try {
      fireEvent.click(screen.getByTestId('pwa-install-install'));
      expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(prompt).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(localStorage.getItem(STORAGE_KEY)).toBe('accepted');
      });
    } finally {
      vi.useFakeTimers();
    }
  });

  it('resets the delay when the route changes', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <PwaInstallPrompt />
        <Routes>
          <Route path="/" element={<NavigationHarness />} />
          <Route path="/impressum" element={<div>impressum</div>} />
        </Routes>
      </MemoryRouter>
    );
    fireBeforeInstallPrompt();

    // Advance past the delay — popup should appear on the first route.
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(screen.getByTestId('pwa-install-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pwa-install-close'));
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
  });

  it('does not show the popup again after dismissal even if beforeinstallprompt fires', () => {
    renderWithRouter(<PwaInstallPrompt />);
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    fireEvent.click(screen.getByTestId('pwa-install-later'));
    fireBeforeInstallPrompt();
    act(() => {
      vi.advanceTimersByTime(DELAY + 1000);
    });
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
  });

  it('opens the iOS instructions in the popup when pwa-install-open-requested fires', () => {
    setIOS(true);
    renderWithRouter(<PwaInstallPrompt />);
    act(() => {
      window.dispatchEvent(new CustomEvent(PWA_OPEN_REQUEST_EVENT, { detail: { mode: 'ios' } }));
    });
    const sheet = screen.getByTestId('pwa-install-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveAttribute('data-mode', 'ios');
    expect(screen.getByTestId('pwa-install-ios-steps')).toBeInTheDocument();
    expect(screen.queryByTestId('pwa-install-install')).not.toBeInTheDocument();
  });

  it('ignores pwa-install-open-requested when the mode is not ios', () => {
    setIOS(true);
    renderWithRouter(<PwaInstallPrompt />);
    act(() => {
      window.dispatchEvent(new CustomEvent(PWA_OPEN_REQUEST_EVENT, { detail: { mode: 'native' } }));
    });
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
  });

  it('does not persist dismissed when the iOS popup is closed via Escape', () => {
    setIOS(true);
    renderWithRouter(<PwaInstallPrompt />);
    act(() => {
      window.dispatchEvent(new CustomEvent(PWA_OPEN_REQUEST_EVENT, { detail: { mode: 'ios' } }));
    });
    expect(screen.getByTestId('pwa-install-sheet')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
    // iOS has no programmatic install — closing shouldn't burn the pref.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('Footer install link', () => {
  beforeEach(() => {
    _resetPwaInstallStateForTests();
    localStorage.clear();
    setMobileViewport(true);
    setIOS(false);
  });

  it('does not render on desktop', () => {
    setMobileViewport(false);
    renderWithRouter(<Footer />);
    expect(screen.queryByTestId('footer-install-link')).not.toBeInTheDocument();
  });

  it('renders the link on mobile', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByTestId('footer-install-link')).toBeInTheDocument();
  });

  it('triggers requestInstall when the link is clicked and a prompt is available', async () => {
    const prompt = vi.fn();
    const userChoice = Promise.resolve({ outcome: 'accepted' });
    renderWithRouter(<Footer />);
    fireBeforeInstallPrompt({ prompt, userChoice });
    // userChoice is a real Promise — letting fake timers run would freeze
    // the microtask queue and the test would hang. Swap to real timers for
    // the click + assertion, then restore so afterEach stays consistent.
    vi.useRealTimers();
    try {
      await act(async () => {
        fireEvent.click(screen.getByTestId('footer-install-link'));
      });
      expect(prompt).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(localStorage.getItem(STORAGE_KEY)).toBe('accepted');
      });
    } finally {
      vi.useFakeTimers();
    }
  });

  it('opens the iOS instructions in the popup when the link is clicked on iOS', () => {
    setIOS(true);
    renderWithRouter(
      <>
        <Footer />
        <PwaInstallPrompt />
      </>
    );
    fireEvent.click(screen.getByTestId('footer-install-link'));
    const sheet = screen.getByTestId('pwa-install-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveAttribute('data-mode', 'ios');
    expect(screen.getByTestId('pwa-install-ios-steps')).toBeInTheDocument();
  });

  it('does nothing on non-iOS when clicked before beforeinstallprompt has fired', () => {
    renderWithRouter(
      <>
        <Footer />
        <PwaInstallPrompt />
      </>
    );
    fireEvent.click(screen.getByTestId('footer-install-link'));
    // No popup should open — the auto-popup will handle the ask later.
    expect(screen.queryByTestId('pwa-install-sheet')).not.toBeInTheDocument();
  });

  it('marks the link as opening a dialog for assistive tech', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByTestId('footer-install-link')).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('hides the link when the app is already running standalone', () => {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    renderWithRouter(<Footer />);
    expect(screen.queryByTestId('footer-install-link')).not.toBeInTheDocument();
  });
});
