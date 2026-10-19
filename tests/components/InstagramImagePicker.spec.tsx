import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InstagramImagePicker from '../../src/components/InstagramImagePicker';

describe('InstagramImagePicker', () => {
  it('shows the no-text/flyer notice without photos', () => {
    render(<InstagramImagePicker candidates={[]} value={null} onChange={() => {}} />);
    expect(screen.getByTestId('instagram-no-text-notice')).toHaveTextContent(
      'Bitte kein Foto mit Text oder Flyer verwenden'
    );
  });

  it('shows the no-text/flyer notice with photos', () => {
    const candidates = [{ source: 'main', label: 'Foto', previewUrl: 'x.jpg' }];
    render(
      <InstagramImagePicker
        candidates={candidates}
        value={{ source: 'main', focalPoint: { x: 0.5, y: 0.5 }, zoom: 1 }}
        onChange={() => {}}
      />
    );
    expect(screen.getByTestId('instagram-no-text-notice')).toBeInTheDocument();
  });

  it('asks for a no-text confirmation checkbox when photos exist', () => {
    const onConfirm = vi.fn();
    const candidates = [{ source: 'main', label: 'Foto', previewUrl: 'x.jpg' }];
    render(
      <InstagramImagePicker
        candidates={candidates}
        value={{ source: 'main', focalPoint: { x: 0.5, y: 0.5 }, zoom: 1 }}
        onChange={() => {}}
        noTextConfirmed={false}
        onNoTextConfirmedChange={onConfirm}
        noTextError="Bitte bestätigen"
      />
    );
    expect(screen.queryByTestId('instagram-no-text-notice')).not.toBeInTheDocument();
    expect(screen.getByTestId('instagram-no-text-error')).toHaveTextContent('Bitte bestätigen');
    fireEvent.click(screen.getByTestId('instagram-no-text-checkbox'));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });
});
