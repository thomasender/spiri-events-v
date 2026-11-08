import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import RegionChooser from '../../src/components/RegionChooser';

vi.mock('../../src/hooks/useRegion', () => ({
  useRegion: () => ({
    regions: [],
    loading: false,
    setRegion: () => {},
    setPlaceSelection: () => {},
    regionChooserOpen: true,
    regionChooserPending: false,
  }),
}));
vi.mock('../../src/components/PlacePicker', () => ({ default: () => <div /> }));

describe('RegionChooser intro', () => {
  it('shows the headline and the calendar line before any input', () => {
    render(
      <MemoryRouter>
        <RegionChooser />
      </MemoryRouter>
    );
    const intro = screen.getByTestId('region-chooser-intro');
    expect(intro.textContent).toContain('Finde Events.');
    expect(intro.querySelector('em')?.textContent).toBe('Menschen.');
    expect(intro.textContent).toContain('Dein Kalender für Yoga, Breathwork, Meditation,');
    expect(intro.textContent).toContain('weitere Veranstaltungen.');
  });
});
