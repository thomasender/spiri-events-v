import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NetworkBanner from '../../src/components/NetworkBanner';
import {
  NETWORK_SLOW_EVENT,
  OFFLINE_MIN_VISIBLE_MS,
  OFFLINE_SHOW_DELAY_MS,
  RECONNECTED_VISIBLE_MS,
} from '../../src/utils/networkStatus';

const OFFLINE_TEXT = 'Du bist gerade offline. Manche Inhalte sind vielleicht nicht aktuell.';
const SLOW_TEXT = 'Deine Internetverbindung ist gerade langsam, das Laden kann etwas dauern.';

let online = true;

function goOffline() {
  online = false;
  act(() => void window.dispatchEvent(new Event('offline')));
}
function goOnline() {
  online = true;
  act(() => void window.dispatchEvent(new Event('online')));
}
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const reportSlow = () =>
  act(() => void window.dispatchEvent(new CustomEvent(NETWORK_SLOW_EVENT, { detail: {} })));

describe('NetworkBanner', () => {
  beforeEach(() => {
    online = true;
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Tests that set `navigator.connection` remove it again.
    delete (navigator as unknown as { connection?: unknown }).connection;
  });

  it('renders nothing while the connection is fine (also without navigator.connection, as in Safari)', () => {
    expect('connection' in navigator).toBe(false);
    const { container } = render(<NetworkBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says so politely after a moment offline, then "Wieder verbunden." and disappears', () => {
    render(<NetworkBanner />);
    goOffline();
    expect(screen.queryByTestId('network-banner')).toBeNull();
    advance(OFFLINE_SHOW_DELAY_MS);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(OFFLINE_TEXT);
    expect(banner).toHaveAttribute('aria-live', 'polite');

    goOnline();
    advance(OFFLINE_MIN_VISIBLE_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Wieder verbunden.');
    advance(RECONNECTED_VISIBLE_MS);
    expect(screen.queryByTestId('network-banner')).toBeNull();
  });

  it('shows nothing for a very short drop', () => {
    render(<NetworkBanner />);
    goOffline();
    advance(OFFLINE_SHOW_DELAY_MS / 2);
    goOnline();
    advance(10_000);
    expect(screen.queryByTestId('network-banner')).toBeNull();
  });

  it('notices a page opened while already offline', () => {
    online = false;
    render(<NetworkBanner />);
    advance(OFFLINE_SHOW_DELAY_MS);
    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_TEXT);
  });

  it('shows the slow hint after a slow load, can be closed and comes only once per session', () => {
    const first = render(<NetworkBanner />);
    reportSlow();
    expect(screen.getByRole('status')).toHaveTextContent(SLOW_TEXT);
    fireEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }));
    expect(screen.queryByTestId('network-banner')).toBeNull();
    reportSlow();
    expect(screen.queryByTestId('network-banner')).toBeNull();
    first.unmount();

    render(<NetworkBanner />);
    reportSlow();
    expect(screen.queryByTestId('network-banner')).toBeNull();
  });

  it('does not use up the slow hint for loads that failed while offline', () => {
    online = false;
    render(<NetworkBanner />);
    reportSlow();
    expect(screen.queryByText(SLOW_TEXT)).toBeNull();
    online = true;
    reportSlow();
    expect(screen.getByRole('status')).toHaveTextContent(SLOW_TEXT);
  });

  it('shows the slow hint on a 2G connection (Chromium) but not for saveData alone', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '4g', saveData: true },
    });
    const first = render(<NetworkBanner />);
    expect(screen.queryByTestId('network-banner')).toBeNull();
    first.unmount();

    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '2g', addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    render(<NetworkBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(SLOW_TEXT);
  });

  it('offline replaces the slow hint', () => {
    render(<NetworkBanner />);
    reportSlow();
    goOffline();
    advance(OFFLINE_SHOW_DELAY_MS);
    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_TEXT);
    goOnline();
    advance(OFFLINE_MIN_VISIBLE_MS + RECONNECTED_VISIBLE_MS);
    expect(screen.queryByTestId('network-banner')).toBeNull();
  });
});
