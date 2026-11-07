import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DirectMessageSetting from '../../src/components/messenger/DirectMessageSetting';

const state = vi.hoisted(() => ({
  allow: true,
  loaded: true,
  update: vi.fn(async (_next: boolean) => {}),
}));

vi.mock('../../src/hooks/useMessenger', () => ({
  useMyDmSetting: () => ({ allow: state.allow, loaded: state.loaded, update: state.update }),
}));

describe('DirectMessageSetting', () => {
  it('shows the current value and saves the change', async () => {
    render(<DirectMessageSetting testId="dm" />);
    const box = screen.getByTestId('dm') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(state.update).toHaveBeenCalledWith(false));
  });

  it('shows an error when saving fails', async () => {
    state.update.mockRejectedValueOnce(new Error('denied'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<DirectMessageSetting testId="dm" />);
    fireEvent.click(screen.getByTestId('dm'));
    expect(await screen.findByTestId('dm-error')).toBeInTheDocument();
  });

  it('is disabled until the setting is loaded', () => {
    state.loaded = false;
    render(<DirectMessageSetting testId="dm" />);
    expect(screen.getByTestId('dm')).toBeDisabled();
    state.loaded = true;
  });
});
