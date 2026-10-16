import { render, act, cleanup } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const trackPageView = vi.fn();
const setAnalyticsAdminUser = vi.fn();
vi.mock('../../src/lib/analytics', () => ({
  trackPageView: (...a: unknown[]) => trackPageView(...a),
  setAnalyticsAdminUser: (...a: unknown[]) => setAnalyticsAdminUser(...a),
  setAnalyticsConsent: vi.fn(),
  setAnalyticsRegion: vi.fn(),
}));

let auth = { role: null as string | null, loading: false };
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => auth }));

// App.jsx pulls in every page; only the tracker is under test.
vi.mock('../../src/pages/CalendarPage', () => ({ default: () => null }));
vi.mock('../../src/components/Header', () => ({ default: () => null }));

import { AnalyticsRouteTracker, PAGE_VIEW_TITLE_DELAY_MS } from '../../src/App';
import {
  CONSENT_STORAGE_KEY,
  resetConsentMemory,
  writeConsent,
} from '../../src/lib/analyticsConsent';

let go: (to: string) => void = () => {};
function Nav() {
  go = useNavigate();
  return null;
}

function setup(initial: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[initial]}>
        <AnalyticsRouteTracker />
        <Nav />
      </MemoryRouter>
    </StrictMode>
  );
}

const flush = () => act(() => vi.advanceTimersByTime(PAGE_VIEW_TITLE_DELAY_MS + 10));

describe('AnalyticsRouteTracker', () => {
  beforeEach(() => {
    // Not `performance`: faking it makes Vitest's hook timer time out.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    window.localStorage.clear();
    resetConsentMemory();
    trackPageView.mockClear();
    setAnalyticsAdminUser.mockClear();
    auth = { role: null, loading: false };
    document.title = 'Test Titel';
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('sends nothing without consent', () => {
    setup('/');
    flush();
    expect(trackPageView).not.toHaveBeenCalled();
  });

  it('sends exactly one page_view per navigation, without query or hash', () => {
    writeConsent(true);
    setup('/auth-action?oobCode=SECRET&mode=resetPassword#x');
    flush();
    expect(trackPageView).toHaveBeenCalledTimes(1);
    expect(trackPageView).toHaveBeenCalledWith('/auth-action', 'Test Titel');

    act(() => go('/verzeichnis?q=abc#top'));
    flush();
    expect(trackPageView).toHaveBeenCalledTimes(2);
    expect(trackPageView).toHaveBeenLastCalledWith('/verzeichnis', 'Test Titel');

    act(() => go('/verzeichnis?q=other'));
    flush();
    expect(trackPageView).toHaveBeenCalledTimes(2);
  });

  it('sends the current page once when consent is granted later', () => {
    setup('/ueber-uns');
    flush();
    expect(trackPageView).not.toHaveBeenCalled();
    act(() => {
      writeConsent(true);
    });
    flush();
    expect(trackPageView).toHaveBeenCalledTimes(1);
    expect(trackPageView).toHaveBeenCalledWith('/ueber-uns', 'Test Titel');
  });

  it('sends nothing for admins and marks the user as admin', () => {
    writeConsent(true);
    auth = { role: 'Admin', loading: false };
    setup('/admin');
    flush();
    expect(trackPageView).not.toHaveBeenCalled();
    expect(setAnalyticsAdminUser).toHaveBeenLastCalledWith(true);
  });

  it('waits for the auth role before the first page_view', () => {
    writeConsent(true);
    auth = { role: null, loading: true };
    const view = setup('/');
    flush();
    expect(trackPageView).not.toHaveBeenCalled();
    expect(setAnalyticsAdminUser).toHaveBeenLastCalledWith(true);
    auth = { role: null, loading: false };
    view.rerender(
      <StrictMode>
        <MemoryRouter initialEntries={['/']}>
          <AnalyticsRouteTracker />
          <Nav />
        </MemoryRouter>
      </StrictMode>
    );
    flush();
    expect(trackPageView).toHaveBeenCalledTimes(1);
    expect(setAnalyticsAdminUser).toHaveBeenLastCalledWith(false);
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toContain('granted');
  });
});
