import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DonationPopup from '../../src/components/DonationPopup';
import * as popup from '../../src/lib/donationPopup';
import { writeConsent } from '../../src/lib/analyticsConsent';
import { DEFAULT_REGION_CONTEXT, RegionContext } from '../../src/hooks/useRegion';
import { mergeRegions } from '../../src/utils/regions';

const auth = {
  role: null as string | null,
  loading: false,
  user: null as { metadata: { creationTime?: string } } | null,
};
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
    auth.user = null;
    flags.enabled = false;
    writeConsent(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays hidden when the feature flag is off', () => {
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

  it('holds the pop-up back for accounts younger than a week, shows it after', () => {
    flags.enabled = true;
    auth.user = { metadata: { creationTime: new Date(Date.now() - 60 * 60 * 1000).toUTCString() } };
    const first = renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.queryByTestId('donation-popup')).toBeNull();
    first.unmount();

    auth.user = {
      metadata: {
        creationTime: new Date(Date.now() - popup.DONATION_POPUP_INTERVAL_MS - 1000).toUTCString(),
      },
    };
    renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.getByTestId('donation-popup')).toBeTruthy();
  });

  it('treats a missing or invalid creation time as an old account', () => {
    const now = Date.now();
    expect(popup.isAccountOldEnough(undefined, now)).toBe(true);
    expect(popup.isAccountOldEnough('garbage', now)).toBe(true);
    expect(popup.isAccountOldEnough(new Date(now - 1000).toISOString(), now)).toBe(false);
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

  it('never shows again once "Jetzt unterstützen" was clicked', () => {
    flags.enabled = true;
    const first = renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    fireEvent.click(screen.getByTestId('donation-popup-donate'));
    first.unmount();

    popup.markShown(Date.now() - popup.DONATION_POPUP_INTERVAL_MS * 3);
    renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.queryByTestId('donation-popup')).toBeNull();
  });

  it('keeps asking weekly when the visitor only dismissed it', () => {
    flags.enabled = true;
    const first = renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    fireEvent.click(screen.getByTestId('donation-popup-later'));
    first.unmount();

    popup.markShown(Date.now() - popup.DONATION_POPUP_INTERVAL_MS - 1000);
    renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.getByTestId('donation-popup')).toBeTruthy();
  });

  it('links to the donation section of the about page', () => {
    flags.enabled = true;
    renderAt('/');
    act(() => {
      vi.advanceTimersByTime(popup.DONATION_POPUP_DELAY_MS + 1);
    });
    expect(screen.getByTestId('donation-popup-donate').getAttribute('href')).toBe(
      '/ueber-uns#spenden'
    );
  });

  it("links to the donation section of the visitor's region", () => {
    auth.role = 'Admin';
    const ctx = {
      ...DEFAULT_REGION_CONTEXT,
      regionId: 'tirol',
      allRegions: mergeRegions([{ id: 'tirol', active: true }]),
    };
    render(
      <RegionContext.Provider value={ctx}>
        <MemoryRouter initialEntries={['/?spendenpopup=1']}>
          <DonationPopup />
        </MemoryRouter>
      </RegionContext.Provider>
    );
    expect(screen.getByTestId('donation-popup-donate').getAttribute('href')).toBe(
      '/tirol/ueber-uns#spenden'
    );
  });

  it('an admin preview click does not count as a donation click', () => {
    auth.role = 'Admin';
    renderAt('/?spendenpopup=1');
    fireEvent.click(screen.getByTestId('donation-popup-donate'));
    expect(popup.hasClickedDonate()).toBe(false);
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
