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
  it('shows Umkreis only after a place, the apply button only after a radius', () => {
    render(<PlacePicker progressive onApply={() => {}} afterApply={<p>Moderator:in werden</p>} />);
    expect(screen.queryByText('Umkreis')).toBeNull();
    expect(screen.queryByTestId('place-picker-apply')).toBeNull();
    expect(screen.queryByText('Moderator:in werden')).toBeNull();
    fireEvent.click(screen.getByText('pick'));
    expect(screen.getByText('Umkreis')).toBeInTheDocument();
    expect(screen.queryByTestId('place-picker-apply')).toBeNull();
    fireEvent.click(screen.getByLabelText('10 km'));
    expect(screen.getByTestId('place-picker-apply')).toBeEnabled();
    expect(screen.getByText('Moderator:in werden')).toBeInTheDocument();
  });
});
