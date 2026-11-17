import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const applyActionCode = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  applyActionCode,
}));

vi.mock('../../src/lib/firebase', () => ({ auth: {}, callable: vi.fn() }));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ refreshEmailVerified: vi.fn(async () => {}) }),
  MIN_PASSWORD_LENGTH: 8,
}));

import AuthActionPage from '../../src/pages/AuthActionPage';

function Landing() {
  const location = useLocation();
  return (
    <div data-testid="landing" data-path={location.pathname}>
      {JSON.stringify(location.state)}
    </div>
  );
}

function renderAt(url: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/auth-action" element={<AuthActionPage />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

async function confirmAndWait(url: string) {
  renderAt(url);
  await act(async () => {});
  expect(screen.getByText('E-Mail-Adresse bestätigt!')).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(2600);
  });
  return screen.getByTestId('landing');
}

describe('AuthActionPage after confirming the e-mail', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    applyActionCode.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('leads back to the event wizard (last page) for next=/admin/new', async () => {
    const landing = await confirmAndWait(
      '/auth-action?mode=verifyEmail&oobCode=abc&next=%2Fadmin%2Fnew'
    );
    expect(applyActionCode).toHaveBeenCalledWith({}, 'abc');
    expect(landing.getAttribute('data-path')).toBe('/admin/new');
    expect(landing.textContent).toContain('"afterVerify":true');
  });

  it('goes home without next', async () => {
    const landing = await confirmAndWait('/auth-action?mode=verifyEmail&oobCode=abc');
    expect(landing.getAttribute('data-path')).toBe('/');
  });

  it('ignores a next that is not on the whitelist', async () => {
    const landing = await confirmAndWait(
      '/auth-action?mode=verifyEmail&oobCode=abc&next=https%3A%2F%2Fevil.example'
    );
    expect(landing.getAttribute('data-path')).toBe('/');
  });
});
