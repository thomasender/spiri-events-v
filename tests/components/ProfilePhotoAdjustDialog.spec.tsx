// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProfilePhotoAdjustDialog from '../../src/components/ProfilePhotoAdjustDialog';

const base = { open: true, photoURL: 'https://example.com/a.jpg', focalPoint: null, zoom: 1 };

describe('ProfilePhotoAdjustDialog', () => {
  it('applies the draft zoom only when "Übernehmen" is pressed', () => {
    const onApply = vi.fn();
    render(<ProfilePhotoAdjustDialog {...base} onApply={onApply} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('profile-photo-zoom'), { target: { value: '2' } });
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('photo-adjust-apply'));
    expect(onApply).toHaveBeenCalledWith({ focalPoint: null, zoom: 2 });
  });

  it('discards the draft on "Abbrechen"', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<ProfilePhotoAdjustDialog {...base} onApply={onApply} onClose={onClose} />);
    fireEvent.change(screen.getByTestId('profile-photo-zoom'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
