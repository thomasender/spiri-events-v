import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';
import { PLACE_SELECTION_KEY } from '../../src/utils/placeSelection';

const mocks = vi.hoisted(() => ({
  regions: { regions: [] as unknown[], loading: false },
  trackFilter: vi.fn(),
}));

vi.mock('../../src/hooks/useRegions', () => ({ useRegions: () => mocks.regions }));
vi.mock('../../src/lib/analyticsEvents', () => ({ trackFilter: mocks.trackFilter }));

import LocateRegionButton from '../../src/components/LocateRegionButton';
import RegionProvider from '../../src/components/RegionProvider';
import RegionChooser from '../../src/components/RegionChooser';

// Vorarlberg + Tirol open: the first-visit chooser is shown. Innerschweiz is not open yet.
const TWO_ACTIVE = mergeRegions([{ id: 'tirol', active: true }]);
const LUZERN = { latitude: 47.0502, longitude: 8.3093 };
const BREGENZ = { latitude: 47.5031, longitude: 9.7471 };
const MADRID = { latitude: 40.4168, longitude: -3.7038 };

type Success = (p: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (e: { code: number }) => void;
const getCurrentPosition = vi.fn();

function setGeolocation(value: unknown) {
  Object.defineProperty(window.navigator, 'geolocation', { value, configurable: true });
}
function answerWith(coords: { latitude: number; longitude: number }) {
  getCurrentPosition.mockImplementation((ok: Success) => ok({ coords }));
}
function failWith(code: number) {
  getCurrentPosition.mockImplementation((_ok: Success, fail: Failure) => fail({ code }));
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}
const where = () => screen.getByTestId('where').textContent;

function renderChooser() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <RegionProvider>
        <RegionChooser />
        <Where />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </RegionProvider>
    </MemoryRouter>
  );
}

const clickUseLocation = () =>
  fireEvent.click(screen.getByRole('button', { name: /Meinen Standort verwenden/ }));
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Standort abfragen' }));

beforeEach(() => {
  mocks.regions = { regions: TWO_ACTIVE, loading: false };
  mocks.trackFilter.mockClear();
  getCurrentPosition.mockReset();
  setGeolocation({ getCurrentPosition });
  window.localStorage.clear();
});

afterEach(() => {
  setGeolocation(undefined);
  vi.restoreAllMocks();
});

describe('LocateRegionButton', () => {
  it('asks the browser only after the explanation was shown and confirmed', () => {
    render(<LocateRegionButton onLocate={vi.fn()} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    clickUseLocation();
    expect(screen.getByText(/nur ein einziges Mal, um den nächsten Ort zu finden/)).toBeTruthy();
    expect(
      screen.getByText(/nicht gespeichert und nicht an uns oder andere gesendet/)
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Standort abfragen' }));
    expect(getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Meinen Standort verwenden/ })).toBeTruthy();
  });

  it.each([
    [1, /nicht erlaubt/],
    [2, /konnte gerade nicht bestimmt werden/],
    [3, /zu lange gedauert/],
  ])('error code %i shows a friendly hint and locates nothing', (code, text) => {
    failWith(code);
    const onLocate = vi.fn();
    render(<LocateRegionButton onLocate={onLocate} />);
    clickUseLocation();
    confirm();
    expect(screen.getByRole('status').textContent).toMatch(text);
    expect(screen.getByRole('status').textContent).toMatch(/Bitte gib deinen Ort selbst ein/);
    expect(onLocate).not.toHaveBeenCalled();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    // The button is back, nothing retries by itself.
    expect(screen.getByRole('button', { name: /Meinen Standort verwenden/ })).toBeTruthy();
  });

  it('a browser without geolocation gets a hint', () => {
    setGeolocation(undefined);
    const onLocate = vi.fn();
    render(<LocateRegionButton onLocate={onLocate} />);
    clickUseLocation();
    confirm();
    expect(screen.getByRole('status').textContent).toMatch(/Dein Browser kann deinen Standort/);
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('hands the position to onLocate once, and stays quiet when a place was found', async () => {
    answerWith(BREGENZ);
    const onLocate = vi.fn().mockResolvedValue(true);
    render(<LocateRegionButton onLocate={onLocate} />);
    clickUseLocation();
    confirm();
    await waitFor(() => expect(onLocate).toHaveBeenCalledWith({ lat: 47.5031, lon: 9.7471 }));
    expect(onLocate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(''));
  });

  it('says so when no place was found, or when finding it fails', async () => {
    answerWith(BREGENZ);
    const onLocate = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('x'));
    render(<LocateRegionButton onLocate={onLocate} />);
    clickUseLocation();
    confirm();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Wir konnten deinen Standort keinem Ort zuordnen. Bitte gib deinen Ort selbst ein.'
      )
    );
    clickUseLocation();
    confirm();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/konnte gerade nicht bestimmt/)
    );
  });
});

describe('in the region chooser (real place list and border shapes)', () => {
  const useMyLocation = async (coords: { latitude: number; longitude: number }) => {
    answerWith(coords);
    renderChooser();
    clickUseLocation();
    confirm();
    await screen.findByTestId('place-picker-chosen');
  };
  const apply = () => fireEvent.click(screen.getByTestId('place-picker-apply'));
  const storedSelection = () => JSON.parse(window.localStorage.getItem(PLACE_SELECTION_KEY)!);

  it('a position in Austria snaps to the nearest place and chooses its region', async () => {
    await useMyLocation(BREGENZ);
    expect(screen.getByTestId('place-picker-chosen')).toHaveTextContent('Bregenz');
    apply();
    expect(where()).toBe('/vorarlberg');
    expect(storedSelection()).toMatchObject({
      label: 'Bregenz',
      regionId: 'vorarlberg',
      source: 'device',
    });
  });

  it('a position in Luzern chooses the Innerschweiz, which is not open yet: coming soon', async () => {
    await useMyLocation(LUZERN);
    apply();
    expect(where()).toBe('/innerschweiz');
    expect(mocks.trackFilter).toHaveBeenCalledWith('region', 'innerschweiz');
  });

  it('remembers the place, never the exact position', async () => {
    await useMyLocation(BREGENZ);
    apply();
    const stored = Object.keys(window.localStorage)
      .map((k) => `${k}=${window.localStorage.getItem(k)}`)
      .join(';');
    expect(stored).not.toMatch(/47\.5031|9\.7471/);
    expect(storedSelection().lat).toBeCloseTo(47.503, 2);
  });

  it('a position in Liechtenstein chooses the region Liechtenstein', async () => {
    await useMyLocation({ latitude: 47.141, longitude: 9.521 });
    apply();
    expect(where()).toBe('/liechtenstein');
  });

  it('a position far from every place leaves the chooser open and usable', async () => {
    answerWith(MADRID);
    renderChooser();
    clickUseLocation();
    confirm();
    await screen.findByText(/keinem Ort zuordnen/);
    expect(screen.getByTestId('region-chooser')).toBeTruthy();
    expect(where()).toBe('/');
    expect(
      within(screen.getByTestId('region-chooser')).getByTestId('place-picker-apply')
    ).toBeDisabled();
  });
});
