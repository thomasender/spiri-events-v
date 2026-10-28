import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let auth = { role: null as string | null, loading: false };
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => auth }));
// The editor itself is a lazy chunk; here only the launcher's gating is under test.
vi.mock('../../src/components/design/DesignModeApp', () => ({
  default: () => <div data-testid="design-mode-app" />,
}));

import DesignModeLauncher from '../../src/components/design/DesignModeLauncher';

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  auth = { role: null, loading: false };
});

describe('DesignModeLauncher', () => {
  it.each([null, 'User', 'Regions-Moderator'])('renders nothing for role %s', (role) => {
    auth = { role, loading: false };
    const { container } = render(<DesignModeLauncher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the button to admins', () => {
    auth = { role: 'Admin', loading: false };
    render(<DesignModeLauncher />);
    expect(screen.getByRole('button', { name: /Design-Modus/ })).toBeInTheDocument();
  });

  it('opens the editor on click and remembers it for the tab', async () => {
    auth = { role: 'Admin', loading: false };
    render(<DesignModeLauncher />);
    screen.getByRole('button', { name: /Design-Modus/ }).click();
    expect(await screen.findByTestId('design-mode-app')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('design-mode:on')).toBe('1');
  });

  it('keeps the mode on while the session is still loading (reload bug)', () => {
    window.sessionStorage.setItem('design-mode:on', '1');
    auth = { role: null, loading: true };
    render(<DesignModeLauncher />);
    expect(window.sessionStorage.getItem('design-mode:on')).toBe('1');
  });

  it('switches the mode off for good once the user is known not to be an admin', () => {
    window.sessionStorage.setItem('design-mode:on', '1');
    auth = { role: null, loading: false };
    render(<DesignModeLauncher />);
    expect(window.sessionStorage.getItem('design-mode:on')).toBeNull();
  });

  it('is not offered on mobile viewports', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      auth = { role: 'Admin', loading: false };
      const { container } = render(<DesignModeLauncher />);
      expect(container).toBeEmptyDOMElement();
    } finally {
      window.matchMedia = original;
    }
  });
});
