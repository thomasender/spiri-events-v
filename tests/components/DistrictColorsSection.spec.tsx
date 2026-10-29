import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import DistrictColorsSection from '../../src/components/DistrictColorsSection';

const mocks = vi.hoisted(() => ({
  role: 'Admin',
  overrides: {} as Record<string, string>,
  activeDistricts: ['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Grenznahe', 'Imst', 'Landeck'],
  autoColors: { Imst: '#A47551', Landeck: '#9A7B4F' } as Record<string, string>,
  save: vi.fn(async (_next: Record<string, string>) => {}),
}));

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ role: mocks.role }) }));
vi.mock('../../src/hooks/useDistrictColors', () => ({
  useDistrictColors: () => ({
    overrides: mocks.overrides,
    loading: false,
    activeDistricts: mocks.activeDistricts,
    autoColors: mocks.autoColors,
  }),
  saveDistrictColors: (next: Record<string, string>) => mocks.save(next),
}));

const field = (name: string) =>
  screen
    .getAllByTestId('district-color-field')
    .find((el) => el.getAttribute('data-district') === name)!;

const setHex = (name: string, value: string) =>
  fireEvent.change(within(field(name)).getByTestId('color-picker-hex'), { target: { value } });

beforeEach(() => {
  mocks.role = 'Admin';
  mocks.overrides = {};
  mocks.save.mockClear();
});

describe('DistrictColorsSection', () => {
  it('shows the six main fields and the other districts in a collapsed accordion', () => {
    render(<DistrictColorsSection />);
    const more = screen.getByTestId('district-colors-more') as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(within(more).getByText('Weitere Bezirke (2)')).toBeInTheDocument();
    const main = screen
      .getAllByTestId('district-color-field')
      .filter((el) => !more.contains(el))
      .map((el) => el.getAttribute('data-district'));
    expect(main).toEqual(['Bregenz', 'Dornbirn', 'Feldkirch', 'Bludenz', 'Umgebung', 'Online']);
    expect(within(field('Imst')).getByTestId('color-picker-hex')).toHaveValue('#A47551');
    // Legacy "Grenznahe" is the Umgebung field, not a second one.
    expect(screen.queryByText('Grenznahe')).toBeNull();
  });

  it('saves only the changed colours and resets a field to its default', async () => {
    render(<DistrictColorsSection />);
    const save = screen.getByTestId('district-colors-save');
    expect(save).toBeDisabled();

    setHex('Bregenz', '#112233');
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ Bregenz: '#112233' }));

    mocks.save.mockClear();
    fireEvent.click(within(field('Bregenz')).getByTestId('district-color-reset'));
    expect(within(field('Bregenz')).getByTestId('color-picker-hex')).toHaveValue('#B97860');
    expect(save).toBeDisabled();
  });

  it('never shows colour names', () => {
    render(<DistrictColorsSection />);
    expect(screen.queryByText(/terrakotta|sand|ocker/i)).toBeNull();
  });

  it('is read-only for non-admins', () => {
    mocks.role = 'User';
    render(<DistrictColorsSection />);
    expect(screen.queryAllByTestId('color-picker-hex')).toHaveLength(0);
    expect(screen.getByTestId('district-colors-save')).toBeDisabled();
  });
});
