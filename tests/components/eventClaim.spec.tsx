import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

// Event import, claim: client helpers, the "Meine Events" banner, the
// /uebernehmen page and the event wizard hint, with mocked callables.

const claimApi = vi.hoisted(() => ({
  claimCuratedEvents: vi.fn(),
  listMyClaimableEvents: vi.fn(),
  findCuratedMatches: vi.fn(),
}));
vi.mock('../../src/lib/eventClaim', () => claimApi);

const authState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => authState.value,
  verificationEmailErrorMessage: () => 'Fehler',
}));

vi.mock('../../src/components/SeoMeta', () => ({ default: () => null }));

import {
  PENDING_CLAIM_KEY,
  PENDING_CLAIM_MAX_AGE_MS,
  claimErrorMessage,
  claimResultMessage,
  clearPendingClaimToken,
  dismissClaimBanner,
  hasPendingClaimToken,
  isClaimBannerDismissed,
  readPendingClaimToken,
  savePendingClaimToken,
} from '../../src/utils/eventClaim';
import ClaimableEventsBanner from '../../src/components/ClaimableEventsBanner';
import CuratedMatchHint, { MATCH_DEBOUNCE_MS } from '../../src/components/CuratedMatchHint';
import ClaimEventsPage from '../../src/pages/ClaimEventsPage';

const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345';
const verifiedUser = { uid: 'u1', email: 'info@yoga-tirol.at', emailVerified: true };

function signedIn(over: Record<string, unknown> = {}) {
  authState.value = {
    user: verifiedUser,
    loading: false,
    emailVerified: true,
    refreshEmailVerified: vi.fn(async () => {}),
    resendVerificationEmail: vi.fn(async () => {}),
    ...over,
  };
}

function LoginProbe() {
  const location = useLocation();
  return <div data-testid="login">{JSON.stringify(location.state)}</div>;
}

beforeEach(() => {
  localStorage.clear();
  claimApi.claimCuratedEvents.mockReset();
  claimApi.listMyClaimableEvents.mockReset();
  claimApi.findCuratedMatches.mockReset();
  signedIn();
});

describe('claim helpers', () => {
  it('keeps a valid token in localStorage until it expires', () => {
    savePendingClaimToken('nope');
    expect(hasPendingClaimToken()).toBe(false);
    savePendingClaimToken(TOKEN, 1000);
    expect(readPendingClaimToken(1000 + PENDING_CLAIM_MAX_AGE_MS - 1)).toBe(TOKEN);
    expect(readPendingClaimToken(1000 + PENDING_CLAIM_MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.getItem(PENDING_CLAIM_KEY)).toBeNull();
    savePendingClaimToken(TOKEN);
    clearPendingClaimToken();
    expect(hasPendingClaimToken()).toBe(false);
  });

  it('remembers the dismissed banner per account', () => {
    expect(isClaimBannerDismissed('u1')).toBe(false);
    dismissClaimBanner('u1');
    expect(isClaimBannerDismissed('u1')).toBe(true);
    expect(isClaimBannerDismissed('u2')).toBe(false);
  });

  it('turns results and errors into German sentences', () => {
    expect(claimResultMessage({ status: 'claimed', eventCount: 3 })).toContain('3 Events');
    expect(claimResultMessage({ status: 'claimed', eventCount: 1 })).toContain('Ein Event');
    expect(claimResultMessage({ status: 'requested' })).toContain('prüfen');
    expect(claimErrorMessage({ details: { reason: 'already-claimed' } })).toContain(
      'anderen Konto'
    );
    expect(claimErrorMessage({ details: { reason: 'token-expired' } })).toContain('abgelaufen');
    expect(claimErrorMessage({ code: 'functions/resource-exhausted' })).toContain('Zu viele');
    expect(claimErrorMessage(new Error('x'))).toContain('nicht geklappt');
  });
});

describe('ClaimableEventsBanner', () => {
  const listing = {
    events: [
      { title: 'Kakaozeremonie', date: '2026-12-05' },
      { title: 'Yin Yoga', date: '2026-12-06' },
    ],
    total: 2,
  };

  it('shows the waiting events and claims them', async () => {
    claimApi.listMyClaimableEvents.mockResolvedValue(listing);
    claimApi.claimCuratedEvents.mockResolvedValue({ status: 'claimed', eventCount: 2 });
    render(<ClaimableEventsBanner />);
    expect(await screen.findByText(/Kakaozeremonie/)).toBeInTheDocument();
    expect(screen.getByText(/Yin Yoga/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('claim-banner-claim'));
    expect(await screen.findByTestId('claim-banner-success')).toHaveTextContent('2 Events');
    expect(claimApi.claimCuratedEvents).toHaveBeenCalledWith({});
    // Shown once: not again after the claim.
    expect(isClaimBannerDismissed('u1')).toBe(true);
  });

  it('shows an error in German when the claim fails', async () => {
    claimApi.listMyClaimableEvents.mockResolvedValue(listing);
    claimApi.claimCuratedEvents.mockRejectedValue({ details: { reason: 'already-claimed' } });
    render(<ClaimableEventsBanner />);
    fireEvent.click(await screen.findByTestId('claim-banner-claim'));
    expect(await screen.findByRole('alert')).toHaveTextContent('anderen Konto');
  });

  it('"Später" hides it for good', async () => {
    claimApi.listMyClaimableEvents.mockResolvedValue(listing);
    render(<ClaimableEventsBanner />);
    fireEvent.click(await screen.findByText('Später'));
    expect(screen.queryByTestId('claim-banner')).not.toBeInTheDocument();
    expect(isClaimBannerDismissed('u1')).toBe(true);
  });

  it('stays hidden without a confirmed address, when dismissed, or with nothing to claim', async () => {
    claimApi.listMyClaimableEvents.mockResolvedValue({ events: [], total: 0 });
    const { unmount } = render(<ClaimableEventsBanner />);
    await act(async () => {});
    expect(screen.queryByTestId('claim-banner')).not.toBeInTheDocument();
    unmount();

    claimApi.listMyClaimableEvents.mockClear();
    signedIn({ emailVerified: false });
    const second = render(<ClaimableEventsBanner />);
    await act(async () => {});
    second.unmount();

    signedIn();
    dismissClaimBanner('u1');
    render(<ClaimableEventsBanner />);
    await act(async () => {});
    expect(claimApi.listMyClaimableEvents).not.toHaveBeenCalled();
  });
});

describe('CuratedMatchHint (event wizard)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const props = { enabled: true, title: 'Kakaozeremonie', date: '2026-12-05', regionId: 'tirol' };
  const match = { organizerId: 'org1', title: 'Kakaozeremonie', date: '2026-12-05' };

  it('asks only once after the debounce and offers the claim', async () => {
    claimApi.findCuratedMatches.mockResolvedValue({ matches: [match] });
    claimApi.claimCuratedEvents.mockResolvedValue({ status: 'claimed', eventCount: 1 });
    const { rerender } = render(
      <MemoryRouter>
        <CuratedMatchHint {...props} title="Kakao" />
      </MemoryRouter>
    );
    rerender(
      <MemoryRouter>
        <CuratedMatchHint {...props} />
      </MemoryRouter>
    );
    await act(async () => {
      vi.advanceTimersByTime(MATCH_DEBOUNCE_MS - 1);
    });
    expect(claimApi.findCuratedMatches).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(claimApi.findCuratedMatches).toHaveBeenCalledTimes(1);
    expect(claimApi.findCuratedMatches).toHaveBeenCalledWith({
      title: 'Kakaozeremonie',
      date: '2026-12-05',
      regionId: 'tirol',
    });
    expect(screen.getByTestId('curated-match-hint')).toHaveTextContent(
      'Dieses Event haben wir schon für dich eingetragen. Übernehmen statt neu anlegen?'
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('curated-match-claim'));
    });
    expect(claimApi.claimCuratedEvents).toHaveBeenCalledWith({ organizerId: 'org1' });
    expect(screen.getByTestId('curated-match-result')).toHaveTextContent('Ein Event');
  });

  it('is hidden for guests / unconfirmed accounts and without title + date', async () => {
    claimApi.findCuratedMatches.mockResolvedValue({ matches: [match] });
    render(
      <MemoryRouter>
        <CuratedMatchHint {...props} enabled={false} />
        <CuratedMatchHint {...props} date="" />
        <CuratedMatchHint {...props} title="ab" />
      </MemoryRouter>
    );
    await act(async () => {
      vi.advanceTimersByTime(MATCH_DEBOUNCE_MS * 2);
    });
    expect(claimApi.findCuratedMatches).not.toHaveBeenCalled();
    expect(screen.queryByTestId('curated-match-hint')).not.toBeInTheDocument();
  });

  it('ignores lookup errors silently', async () => {
    claimApi.findCuratedMatches.mockRejectedValue(new Error('offline'));
    render(
      <MemoryRouter>
        <CuratedMatchHint {...props} />
      </MemoryRouter>
    );
    await act(async () => {
      vi.advanceTimersByTime(MATCH_DEBOUNCE_MS);
    });
    expect(screen.queryByTestId('curated-match-hint')).not.toBeInTheDocument();
  });
});

describe('ClaimEventsPage (/uebernehmen)', () => {
  function renderPage(url: string) {
    window.history.replaceState(null, '', url);
    return render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/uebernehmen']}>
          <Routes>
            <Route path="/uebernehmen" element={<ClaimEventsPage />} />
            <Route path="/login" element={<LoginProbe />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
  }

  it('takes the token out of the address bar and claims for a confirmed account', async () => {
    claimApi.claimCuratedEvents.mockResolvedValue({
      status: 'claimed',
      eventCount: 2,
      organizers: [],
    });
    renderPage(`/uebernehmen?claim=${TOKEN}&x=1`);
    expect(window.location.search).toBe('?x=1');
    expect(await screen.findByTestId('claim-result')).toHaveTextContent('2 Events');
    expect(claimApi.claimCuratedEvents).toHaveBeenCalledWith({ token: TOKEN });
    expect(hasPendingClaimToken()).toBe(false);
  });

  it('guests go to the login / registration without the token in `from`', async () => {
    authState.value = { user: null, loading: false, emailVerified: false };
    renderPage(`/uebernehmen?claim=${TOKEN}`);
    expect(window.location.search).toBe('');
    expect(readPendingClaimToken()).toBe(TOKEN);
    fireEvent.click(screen.getByTestId('claim-register'));
    const state = screen.getByTestId('login').textContent ?? '';
    expect(JSON.parse(state)).toEqual({ from: '/uebernehmen', authMode: 'register' });
    expect(state).not.toContain(TOKEN);
    expect(claimApi.claimCuratedEvents).not.toHaveBeenCalled();
  });

  it('back from the login, the stored token is used', async () => {
    savePendingClaimToken(TOKEN);
    claimApi.claimCuratedEvents.mockResolvedValue({ status: 'requested', requestId: 'r' });
    renderPage('/uebernehmen');
    expect(await screen.findByTestId('claim-result')).toHaveTextContent('prüfen');
    expect(claimApi.claimCuratedEvents).toHaveBeenCalledWith({ token: TOKEN });
  });

  it('asks an unconfirmed account to confirm first (link back to /uebernehmen)', async () => {
    signedIn({ user: { ...verifiedUser, emailVerified: false }, emailVerified: false });
    renderPage(`/uebernehmen?claim=${TOKEN}`);
    expect(screen.getByTestId('email-verification-banner')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('email-verification-resend'));
    await act(async () => {});
    expect(authState.value.resendVerificationEmail).toHaveBeenCalledWith({
      afterVerify: 'claimEvents',
    });
    expect(claimApi.claimCuratedEvents).not.toHaveBeenCalled();
  });

  it('shows refusals in German and forgets a dead link', async () => {
    claimApi.claimCuratedEvents.mockRejectedValue({ details: { reason: 'token-expired' } });
    renderPage(`/uebernehmen?claim=${TOKEN}`);
    expect(await screen.findByTestId('claim-error')).toHaveTextContent('abgelaufen');
    expect(hasPendingClaimToken()).toBe(false);
  });

  it('without a token it says the link is incomplete', () => {
    renderPage('/uebernehmen?claim=bad');
    expect(screen.getByText('Link nicht gefunden')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('sets referrer no-referrer', async () => {
    claimApi.claimCuratedEvents.mockResolvedValue({ status: 'claimed', eventCount: 0 });
    renderPage(`/uebernehmen?claim=${TOKEN}`);
    await screen.findByTestId('claim-result');
    await act(async () => {});
    expect(document.head.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe(
      'no-referrer'
    );
  });
});
