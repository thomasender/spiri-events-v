import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PasswordInput from '../../src/components/PasswordInput';

describe('PasswordInput', () => {
  it('toggles visibility, updates the accessible state and never submits the form', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <label htmlFor="pw">Passwort</label>
        <PasswordInput id="pw" defaultValue="geheim123" autoComplete="current-password" />
      </form>
    );

    const input = screen.getByLabelText('Passwort', { exact: true });
    const toggle = screen.getByRole('button', { name: 'Passwort anzeigen' });
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(input).toHaveAttribute('autocomplete', 'current-password');

    fireEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Passwort verbergen' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(hide);
    expect(input).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Passwort anzeigen' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
