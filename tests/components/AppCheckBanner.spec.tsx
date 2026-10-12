import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import AppCheckBanner from '../../src/components/AppCheckBanner';
import { APP_CHECK_FAILED_EVENT } from '../../src/lib/appCheck';

const fail = () => act(() => void window.dispatchEvent(new CustomEvent(APP_CHECK_FAILED_EVENT)));

describe('AppCheckBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('is hidden until App Check reports a failure', () => {
    render(<AppCheckBanner />);
    expect(screen.queryByTestId('app-check-banner')).toBeNull();
  });

  it('explains the problem after a failure and can be closed', () => {
    render(<AppCheckBanner />);
    fail();

    expect(screen.getByRole('alert')).toHaveTextContent('Sicherheitsprüfung');
    fireEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }));
    expect(screen.queryByTestId('app-check-banner')).toBeNull();
  });

  it('shows only once per session', () => {
    const first = render(<AppCheckBanner />);
    fail();
    first.unmount();

    render(<AppCheckBanner />);
    fail();
    expect(screen.queryByTestId('app-check-banner')).toBeNull();
  });

  it('does not react to ordinary errors', () => {
    render(<AppCheckBanner />);
    act(() => void window.dispatchEvent(new CustomEvent('something-else')));
    expect(screen.queryByTestId('app-check-banner')).toBeNull();
  });

  it('still works when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<AppCheckBanner />);
    expect(() => fail()).not.toThrow();
    expect(screen.getByTestId('app-check-banner')).toBeInTheDocument();
  });
});
