import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setAnalyticsConsent = vi.fn();
vi.mock('../../src/lib/analytics', () => ({
  setAnalyticsConsent: (...a: unknown[]) => setAnalyticsConsent(...a),
}));

import CookieConsent from '../../src/components/CookieConsent';
import Footer from '../../src/components/Footer';
import { CONSENT_STORAGE_KEY, resetConsentMemory } from '../../src/lib/analyticsConsent';

vi.mock('../../src/hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({
    installAvailable: false,
    isStandalone: false,
    isMobileViewport: false,
    requestInstall: vi.fn(),
  }),
  isIOSDevice: () => false,
}));

function renderApp() {
  return render(
    <MemoryRouter>
      <CookieConsent />
      <Footer />
    </MemoryRouter>
  );
}

const stored = () => JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY) || 'null');

describe('CookieConsent', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetConsentMemory();
    setAnalyticsConsent.mockClear();
    vi.restoreAllMocks();
  });

  it('shows without a stored decision and applies "denied" by default', () => {
    renderApp();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Datenschutzerklärung' })).toHaveAttribute(
      'href',
      '/datenschutz'
    );
    expect(setAnalyticsConsent).toHaveBeenCalledWith(false);
  });

  it('stores "granted" with a timestamp on Akzeptieren', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Akzeptieren' }));
    expect(stored().value).toBe('granted');
    expect(typeof stored().timestamp).toBe('number');
    expect(setAnalyticsConsent).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stores "denied" on Ablehnen', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));
    expect(stored().value).toBe('denied');
    expect(setAnalyticsConsent).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays hidden and applies a fresh stored decision', () => {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ value: 'granted', timestamp: Date.now() })
    );
    renderApp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(setAnalyticsConsent).toHaveBeenCalledWith(true);
  });

  it('asks again after 12 months', () => {
    const old = Date.now() - 366 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ value: 'granted', timestamp: old })
    );
    renderApp();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(setAnalyticsConsent).toHaveBeenCalledWith(false);
  });

  it('reopens from the footer link and revocation stops collection', () => {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ value: 'granted', timestamp: Date.now() })
    );
    renderApp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cookie-Einstellungen' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));
    expect(setAnalyticsConsent).toHaveBeenLastCalledWith(false);
    expect(stored().value).toBe('denied');
  });

  it('does not crash when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderApp();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Akzeptieren' }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(setAnalyticsConsent).toHaveBeenLastCalledWith(true);
  });
});
