import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InstagramConsentCard from '../../src/components/InstagramConsentCard';

describe('InstagramConsentCard', () => {
  it('shows the stored value and is off by default', () => {
    const { rerender } = render(<InstagramConsentCard checked={false} onSave={vi.fn()} />);
    expect(screen.getByTestId('instagram-consent-default-checkbox')).not.toBeChecked();
    rerender(<InstagramConsentCard checked onSave={vi.fn()} />);
    expect(screen.getByTestId('instagram-consent-default-checkbox')).toBeChecked();
  });

  it('saves instagramConsentDefault when toggled', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InstagramConsentCard checked={false} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('instagram-consent-default-checkbox'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ instagramConsentDefault: true }));
    expect(await screen.findByTestId('instagram-consent-saved')).toBeInTheDocument();
  });

  it('shows an error when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    render(<InstagramConsentCard checked onSave={onSave} />);
    fireEvent.click(screen.getByTestId('instagram-consent-default-checkbox'));
    expect(await screen.findByTestId('instagram-consent-error')).toBeInTheDocument();
  });
});
