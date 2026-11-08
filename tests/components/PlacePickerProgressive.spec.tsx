import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlacePicker from '../../src/components/PlacePicker';

vi.mock('../../src/hooks/useRegion', () => ({
  useRegion: () => ({ allRegions: [], placeSelection: null }),
}));
vi.mock('../../src/hooks/usePlaceIndexOnDemand', () => ({
  usePlaceIndexOnDemand: () => ({ index: null, failed: false, request: () => {} }),
}));
vi.mock('../../src/components/PlaceSearch', () => ({
  default: ({ onChoose }: { onChoose: (e: unknown) => void }) => (
    <button onClick={() => onChoose({ name: 'Bregenz', lat: 47.5, lon: 9.7 })}>pick</button>
  ),
}));
vi.mock('../../src/components/LocateRegionButton', () => ({ default: () => null }));

describe('PlacePicker progressive', () => {
  it('shows Umkreis and the apply button as soon as a place is chosen', () => {
    render(<PlacePicker progressive onApply={() => {}} afterApply={<p>Danach</p>} />);
    expect(screen.queryByText('Umkreis')).toBeNull();
    expect(screen.queryByTestId('place-picker-apply')).toBeNull();
    fireEvent.click(screen.getByText('pick'));
    expect(screen.getByText('Umkreis')).toBeInTheDocument();
    expect(screen.getByTestId('place-picker-apply')).toBeEnabled();
    expect(screen.getByText('Danach')).toBeInTheDocument();
  });

  it('applies 20 km when no radius was picked, else the picked one', () => {
    const onApply = vi.fn();
    render(<PlacePicker progressive onApply={onApply} />);
    fireEvent.click(screen.getByText('pick'));
    fireEvent.click(screen.getByTestId('place-picker-apply'));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ radiusKm: 20 }));
    fireEvent.click(screen.getByLabelText('10 km'));
    fireEvent.click(screen.getByTestId('place-picker-apply'));
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ radiusKm: 10 }));
  });
});
