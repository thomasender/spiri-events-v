import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';
import { LAST_REGION_STORAGE_KEY } from '../../src/utils/regionRouting';

const mocks = vi.hoisted(() => ({
  regions: { regions: [] as unknown[], loading: false },
  trackFilter: vi.fn(),
}));

vi.mock('../../src/hooks/useRegions', () => ({ useRegions: () => mocks.regions }));
vi.mock('../../src/lib/analyticsEvents', () => ({ trackFilter: mocks.trackFilter }));

import LocateRegionButton from '../../src/components/LocateRegionButton';
import RegionProvider from '../../src/components/RegionProvider';
import RegionChooser from '../../src/components/RegionChooser';
import RegionPickerModal from '../../src/components/RegionPickerModal';

// Vorarlberg + Tirol open: the first-visit chooser is shown. Bayern is not open yet.
const TWO_ACTIVE = mergeRegions([{ id: 'tirol', active: true }]);
const MUNICH = { latitude: 48.1374, longitude: 11.5755 };
const BREGENZ = { latitude: 47.5031, longitude: 9.7471 };

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
    const onChoose = vi.fn();
    render(<LocateRegionButton regions={STATIC_REGIONS} onChoose={onChoose} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    clickUseLocation();
    expect(screen.getByText(/nur ein einziges Mal, um deine Region zu finden/)).toBeTruthy();
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
  ])('error code %i shows a friendly hint and chooses nothing', async (code, text) => {
    failWith(code);
    const onChoose = vi.fn();
    render(<LocateRegionButton regions={STATIC_REGIONS} onChoose={onChoose} />);
    clickUseLocation();
    confirm();
    expect(screen.getByRole('status').textContent).toMatch(text);
    expect(screen.getByRole('status').textContent).toMatch(/Bitte wähle deine Region selbst/);
    expect(onChoose).not.toHaveBeenCalled();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    // The button is back, nothing retries by itself.
    expect(screen.getByRole('button', { name: /Meinen Standort verwenden/ })).toBeTruthy();
  });

  it('a browser without geolocation gets a hint', () => {
    setGeolocation(undefined);
    const onChoose = vi.fn();
    render(<LocateRegionButton regions={STATIC_REGIONS} onChoose={onChoose} />);
    clickUseLocation();
    confirm();
    expect(screen.getByRole('status').textContent).toMatch(/Dein Browser kann deinen Standort/);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('outside Germany (Vorarlberg) it does not guess a region', async () => {
    answerWith(BREGENZ);
    const onChoose = vi.fn();
    render(<LocateRegionButton regions={STATIC_REGIONS} onChoose={onChoose} />);
    clickUseLocation();
    confirm();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Wir konnten deinen Standort keiner Region zuordnen. Bitte wähle deine Region selbst.'
      )
    );
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe('in the region chooser', () => {
  it('a position in Munich chooses Bayern like a click, which is not open yet: coming soon', async () => {
    answerWith(MUNICH);
    renderChooser();
    expect(screen.getByTestId('region-chooser')).toBeTruthy();
    clickUseLocation();
    confirm();
    await waitFor(() => expect(where()).toBe('/bayern'));
    expect(mocks.trackFilter).toHaveBeenCalledWith('region', 'bayern');
    expect(mocks.trackFilter).toHaveBeenCalledTimes(1);
    // Only the region is remembered, never the position.
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('bayern');
    const stored = Object.keys(window.localStorage)
      .map((k) => `${k}=${window.localStorage.getItem(k)}`)
      .join(';');
    expect(stored).not.toMatch(/48\.1|11\.5/);
  });

  it('a position in a cultural region of the current assignment chooses that region', async () => {
    mocks.regions = {
      regions: mergeRegions([
        { id: 'tirol', active: true },
        { id: 'ostfriesland', bezirke: ['Leer'], mappingUpdatedAt: 1 },
        {
          id: 'niedersachsen',
          bezirke: STATIC_REGIONS.find((r) => r.slug === 'niedersachsen')!.bezirke.filter(
            (b) => b !== 'Leer'
          ),
          mappingUpdatedAt: 1,
        },
      ]),
      loading: false,
    };
    answerWith({ latitude: 53.2316, longitude: 7.461 });
    renderChooser();
    clickUseLocation();
    confirm();
    await waitFor(() => expect(where()).toBe('/ostfriesland'));
  });

  it('outside Germany the chooser stays open and usable', async () => {
    answerWith(BREGENZ);
    renderChooser();
    clickUseLocation();
    confirm();
    await screen.findByText(/keiner Region zuordnen/);
    expect(screen.getByTestId('region-chooser')).toBeTruthy();
    expect(where()).toBe('/');
    fireEvent.click(screen.getByRole('button', { name: 'Vorarlberg' }));
    expect(where()).toBe('/vorarlberg');
  });

  it('is offered in the region pop-up as well', async () => {
    answerWith(MUNICH);
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/vorarlberg']}>
        <RegionProvider>
          <RegionPickerModal open onClose={onClose} />
          <Where />
        </RegionProvider>
      </MemoryRouter>
    );
    clickUseLocation();
    confirm();
    await waitFor(() => expect(where()).toBe('/bayern'));
    expect(onClose).toHaveBeenCalled();
  });
});
