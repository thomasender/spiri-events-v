import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DonationPopup from '../../src/components/DonationPopup';
import * as popup from '../../src/lib/donationPopup';
import { writeConsent } from '../../src/lib/analyticsConsent';

const auth = { role: null as string | null, loading: false };
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => auth }));

const flags = vi.hoisted(() => ({ enabled: false }));
vi.mock('../../src/lib/donationPopup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/donationPopup')>();
  return {
    ...actual,
    get DONATION_POPUP_ENABLED() {
      return flags.enabled;
    },
  };
});

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DonationPopup />
    </MemoryRouter>
  );
}

describe('DonationPopup', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    window.localStorage.clear();
    auth.role = null;
    auth.loading = false;
    flags.enabled = false;
    writeConsent(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays hidden while the feature is switched off', () => {
    renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1000);
    });
    expect(screen.queryByTestId('donation-popup')).toBeNull();
  });

  it('shows once after the delay when enabled, then not again within a week', () => {
    flags.enabled = true;
    const first = renderAt('/');
    expect(screen.queryByTestId('donation-popup')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.getByTestId('donation-popup')).toBeTruthy();
    first.unmount();

    renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.queryByTestId('donation-popup')).toBeNull();
  });

  it('shows again after a week', () => {
    flags.enabled = true;
    popup.markShown(Date.now() - popup.DONATION_POPUP_INTERVAL_MS - 1000);
    renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.getByTestId('donation-popup')).toBeTruthy();
  });

  it('does not show on the donation page', () => {
    flags.enabled = true;
    renderAt('/spenden');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.queryByTestId('donation-popup')).toBeNull();
  });

  it('lets an admin preview it with the URL parameter even when switched off', () => {
    auth.role = 'Admin';
    renderAt('/?spendenpopup=1');
    expect(screen.getByTestId('donation-popup')).toBeTruthy();
    fireEvent.click(screen.getByTestId('donation-popup-later'));
    expect(screen.queryByTestId('donation-popup')).toBeNull();
  });

  it('ignores the URL parameter for non-admins', () => {
    renderAt('/?spendenpopup=1');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.queryByTestId('donation-popup')).toBeNull();
  });
});
