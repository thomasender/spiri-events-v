import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';
import {
  LAST_REGION_STORAGE_KEY,
  REGION_CHOOSER_SEEN_KEY,
  regionSwitchSubpath,
} from '../../src/utils/regionRouting';
import { PLACE_SELECTION_KEY } from '../../src/utils/placeSelection';

const mocks = vi.hoisted(() => ({
  regions: { regions: [] as unknown[], loading: false },
  trackFilter: vi.fn(),
  // A handful of places is enough: the real list is pinned in placeSearch.spec.ts.
  rawIndex: {
    states: [
      ['vorarlberg', 47.25, 9.9],
      ['tirol', 47.25, 11.4],
      ['bayern', 48.9, 11.4],
      ['zuerich', 47.4, 8.6],
    ],
    districts: [
      ['AT|Bregenz', 47.5, 9.75],
      ['AT|Innsbruck', 47.27, 11.4],
    ],
    places: [
      ['Bregenz', 47.503, 9.747, 0, 0],
      ['Dornbirn', 47.413, 9.744, 0, -1],
      ['Innsbruck', 47.269, 11.404, 1, 1],
      ['München', 48.137, 11.575, 2, -1],
      ['Zürich', 47.377, 8.54, 3, -1],
    ],
  },
}));

vi.mock('../../src/hooks/useRegions', () => ({ useRegions: () => mocks.regions }));
vi.mock('../../src/lib/analyticsEvents', () => ({ trackFilter: mocks.trackFilter }));
vi.mock('../../src/lib/placeData', async () => {
  const search = await import('../../src/utils/placeSearch');
  return {
    buildRegionEntries: search.buildRegionEntries,
    loadPlaceIndex: () => Promise.resolve(search.preparePlaceIndex(mocks.rawIndex)),
    loadGeoShapes: () => Promise.reject(new Error('no border shapes in this test')),
  };
});

import RegionProvider from '../../src/components/RegionProvider';
import RegionSwitcher, { RegionMenuList } from '../../src/components/RegionSwitcher';
import RegionChooser from '../../src/components/RegionChooser';
import { useRegionTexts } from '../../src/hooks/useRegionTexts';

const TWO_ACTIVE = mergeRegions([{ id: 'tirol', active: true }]);
// Vorarlberg (AT) + Bayern (DE): "Alle Tribes" is available, the country views are not.
const AT_AND_DE = mergeRegions([{ id: 'bayern', active: true }]);
// Vorarlberg + Tirol (AT) + Bayern (DE): "Ganz Österreich" and "Alle Tribes".
const THREE_ACTIVE = mergeRegions([
  { id: 'tirol', active: true },
  { id: 'bayern', active: true },
]);

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

// The title the site header shows top left.
function HeaderTitle() {
  return <output data-testid="header-title">{useRegionTexts().headerTitle}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RegionProvider>
        <RegionSwitcher />
        <RegionChooser />
        <Where />
        <HeaderTitle />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </RegionProvider>
    </MemoryRouter>
  );
}

const key = (k: string, shiftKey = false) =>
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: k, shiftKey });
const where = () => screen.getByTestId('where').textContent;
const headerTitle = () => screen.getByTestId('header-title').textContent;
const stored = () => JSON.parse(window.localStorage.getItem(PLACE_SELECTION_KEY) ?? 'null');

beforeEach(() => {
  mocks.regions = { regions: STATIC_REGIONS, loading: false };
  mocks.trackFilter.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('regionSwitchSubpath', () => {
  it('keeps the directory, everything else goes to the calendar', () => {
    expect(regionSwitchSubpath('/verzeichnis')).toBe('/verzeichnis');
    expect(regionSwitchSubpath('/vorarlberg/verzeichnis')).toBe('/verzeichnis');
    expect(regionSwitchSubpath('/oesterreich/verzeichnis')).toBe('/verzeichnis');
    expect(regionSwitchSubpath('/')).toBe('/');
    expect(regionSwitchSubpath('/tirol')).toBe('/');
    expect(regionSwitchSubpath('/event/some-event')).toBe('/');
  });
});

describe('with one active region', () => {
  it('renders no switcher and no chooser', () => {
    const { container } = renderAt('/');
    expect(screen.queryByTestId('region-switcher')).toBeNull();
    expect(screen.queryByTestId('region-chooser')).toBeNull();
    expect(container.querySelector('.region-switcher, .region-chooser')).toBeNull();
  });
});

const openPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: /Ort und Umkreis wählen, aktuell/ }));
  return screen.getByTestId('region-picker');
};
// Types into the search field and clicks the suggestion with this name.
const searchAndPick = async (scope: HTMLElement, query: string, name: string) => {
  fireEvent.change(within(scope).getByRole('combobox'), { target: { value: query } });
  const options = await within(scope).findAllByTestId('place-search-option');
  const option = options.find(
    (o) => o.querySelector('.place-search-option-label')!.textContent === name
  )!;
  fireEvent.click(option);
};
// Makes `(pointer: coarse)` match (a phone) or not (a mouse); restored after each test.
const realMatchMedia = window.matchMedia;
const stubPointer = (coarse: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};
afterEach(() => {
  window.matchMedia = realMatchMedia;
});
// Focuses the search field (as the keyboard would), picks a place, returns the field.
const pickWithFocus = async (scope: HTMLElement) => {
  const input = within(scope).getByRole('combobox');
  input.focus();
  expect(input).toHaveFocus();
  await searchAndPick(scope, 'innsbruck', 'Innsbruck');
  return input;
};
const apply = (scope: HTMLElement) =>
  fireEvent.click(within(scope).getByTestId('place-picker-apply'));

describe('RegionSwitcher with two active regions', () => {
  beforeEach(() => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
    window.localStorage.setItem(REGION_CHOOSER_SEEN_KEY, '1');
  });

  it('opens a pop-up with search, location button and radius, but no map and no region chips', () => {
    renderAt('/');
    const trigger = screen.getByRole('button', {
      name: /Ort und Umkreis wählen, aktuell Vorarlberg/,
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('region-picker')).toBeNull();
    const dialog = openPicker();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: /Meinen Standort verwenden/ })).toBeTruthy();
    expect(within(dialog).getByRole('combobox')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('radio')).toHaveLength(4);
    expect(within(dialog).queryByRole('button', { name: /Karte/ })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Tirol' })).toBeNull();
  });

  it('"Übernehmen" waits for a place; the radius defaults to 25 km', async () => {
    renderAt('/');
    const dialog = openPicker();
    expect(within(dialog).getByTestId('place-picker-apply')).toBeDisabled();
    expect(within(dialog).getByRole('radio', { name: '25 km' })).toBeChecked();
    await searchAndPick(dialog, 'bregenz', 'Bregenz');
    expect(within(dialog).getByTestId('place-picker-chosen')).toHaveTextContent('Bregenz');
    expect(within(dialog).getByTestId('place-picker-chosen')).toHaveTextContent('Vorarlberg');
    expect(within(dialog).getByTestId('place-picker-apply')).toBeEnabled();
  });

  it('a place in another region navigates there, remembers place and radius, tells analytics', async () => {
    renderAt('/vorarlberg/verzeichnis');
    const dialog = openPicker();
    await searchAndPick(dialog, 'innsbruck', 'Innsbruck');
    fireEvent.click(within(dialog).getByRole('radio', { name: '50 km' }));
    apply(dialog);
    expect(where()).toBe('/tirol/verzeichnis');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('tirol');
    expect(stored()).toMatchObject({
      label: 'Innsbruck',
      radiusKm: 50,
      regionId: 'tirol',
      source: 'search',
    });
    expect(mocks.trackFilter).toHaveBeenCalledWith('region', 'tirol');
    expect(screen.queryByTestId('region-picker')).toBeNull();
    // The button now names place and radius.
    expect(screen.getByRole('button', { name: /aktuell Innsbruck · 50 km/ })).toBeInTheDocument();
  });

  it('a place in the current region only closes the pop-up and keeps the address', async () => {
    renderAt('/');
    const dialog = openPicker();
    await searchAndPick(dialog, 'dornbirn', 'Dornbirn');
    apply(dialog);
    expect(where()).toBe('/');
    expect(screen.queryByTestId('region-picker')).toBeNull();
    expect(stored()).toMatchObject({ label: 'Dornbirn', radiusKm: 25, regionId: 'vorarlberg' });
  });

  it('on a touch device picking a place closes the on-screen keyboard (input loses focus)', async () => {
    stubPointer(true);
    renderAt('/');
    const input = await pickWithFocus(openPicker());
    expect(input).not.toHaveFocus();
  });

  it('with a fine pointer picking a place keeps the focus in the search field', async () => {
    stubPointer(false);
    renderAt('/');
    const input = await pickWithFocus(openPicker());
    expect(input).toHaveFocus();
  });

  it('a place of a region that is not open yet leads to its coming-soon address', async () => {
    renderAt('/');
    const dialog = openPicker();
    await searchAndPick(dialog, 'münchen', 'München');
    apply(dialog);
    expect(where()).toBe('/bayern');
  });

  it('finds a region by its name too, and uses it as the place', async () => {
    renderAt('/');
    const dialog = openPicker();
    await searchAndPick(dialog, 'tirol', 'Tirol');
    apply(dialog);
    expect(where()).toBe('/tirol');
    expect(stored()).toMatchObject({ label: 'Tirol', regionId: 'tirol' });
  });

  it('from an event page the choice leads to the region calendar', async () => {
    renderAt('/event/some-event');
    const dialog = openPicker();
    await searchAndPick(dialog, 'innsbruck', 'Innsbruck');
    apply(dialog);
    expect(where()).toBe('/tirol');
  });

  it('closes with the X, Escape or a click next to it, and focus returns to the button', () => {
    renderAt('/');
    const trigger = screen.getByRole('button', { name: /Ort und Umkreis wählen, aktuell/ });
    fireEvent.click(within(openPicker()).getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByTestId('region-picker')).toBeNull();
    expect(trigger).toHaveFocus();
    openPicker();
    key('Escape');
    expect(screen.queryByTestId('region-picker')).toBeNull();
    expect(trigger).toHaveFocus();
    openPicker();
    fireEvent.mouseDown(document.querySelector('.region-picker-backdrop')!);
    expect(screen.queryByTestId('region-picker')).toBeNull();
    // a click inside the dialog keeps it open
    const dialog = openPicker();
    fireEvent.mouseDown(dialog);
    expect(screen.getByTestId('region-picker')).toBeInTheDocument();
    expect(stored()).toBeNull();
  });

  it('keeps Tab focus inside the pop-up', () => {
    renderAt('/');
    const dialog = openPicker();
    const stops = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')
    );
    stops[stops.length - 1].focus();
    key('Tab');
    expect(stops[0]).toHaveFocus();
    key('Tab', true);
    expect(stops[stops.length - 1]).toHaveFocus();
  });

  it('does not crash when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt('/');
    const dialog = openPicker();
    await searchAndPick(dialog, 'innsbruck', 'Innsbruck');
    apply(dialog);
    expect(where()).toBe('/tirol');
  });
});

describe('RegionMenuList (burger menu on the phone)', () => {
  function renderList(onNavigate = vi.fn()) {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
    render(
      <MemoryRouter initialEntries={['/']}>
        <RegionProvider>
          <RegionMenuList onNavigate={onNavigate} />
          <Where />
        </RegionProvider>
      </MemoryRouter>
    );
    return onNavigate;
  }

  it('is one button naming the place; it closes the menu and opens the same pop-up', async () => {
    const onNavigate = renderList();
    const button = screen.getByRole('button', { name: /Ort: Vorarlberg/ });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalled();
    const dialog = screen.getByTestId('region-picker');
    await searchAndPick(dialog, 'innsbruck', 'Innsbruck');
    apply(dialog);
    expect(where()).toBe('/tirol');
    expect(screen.queryByTestId('region-picker')).toBeNull();
  });

  describe('on a coming-soon page', () => {
    const koeln = {
      label: 'Köln',
      lat: 50.94,
      lon: 6.96,
      radiusKm: 25,
      regionId: 'koeln-bonn-eifel',
      source: 'search',
      updatedAt: 1,
    };
    function renderListAt(path: string) {
      mocks.regions = { regions: TWO_ACTIVE, loading: false };
      window.localStorage.setItem(REGION_CHOOSER_SEEN_KEY, '1');
      render(
        <MemoryRouter initialEntries={[path]}>
          <RegionProvider>
            <RegionMenuList />
          </RegionProvider>
        </MemoryRouter>
      );
    }

    it('names the searched place of that region', () => {
      window.localStorage.setItem(PLACE_SELECTION_KEY, JSON.stringify(koeln));
      renderListAt('/koeln-bonn-eifel');
      expect(screen.getByRole('button', { name: 'Ort: Köln · 25 km' })).toBeInTheDocument();
    });

    it('keeps the old text when the place belongs to another region', () => {
      window.localStorage.setItem(PLACE_SELECTION_KEY, JSON.stringify(koeln));
      renderListAt('/bayern');
      expect(screen.getByRole('button', { name: /Ort: Vorarlberg/ })).toBeInTheDocument();
    });

    it('keeps the old text without a remembered place', () => {
      renderListAt('/koeln-bonn-eifel');
      expect(screen.getByRole('button', { name: /Ort: Vorarlberg/ })).toBeInTheDocument();
    });
  });

  it('renders nothing with only Vorarlberg active (dark launch)', () => {
    mocks.regions = { regions: STATIC_REGIONS, loading: false };
    render(
      <MemoryRouter>
        <RegionProvider>
          <RegionMenuList />
        </RegionProvider>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('region-menu-list')).toBeNull();
  });
});

describe('the remembered place', () => {
  beforeEach(() => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
  });

  it('is the region of / and the first-visit chooser stays away', () => {
    window.localStorage.setItem(
      PLACE_SELECTION_KEY,
      JSON.stringify({
        label: 'Innsbruck',
        lat: 47.269,
        lon: 11.404,
        radiusKm: 25,
        regionId: 'tirol',
        source: 'search',
        updatedAt: 1,
      })
    );
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
    expect(screen.getByRole('button', { name: /aktuell Innsbruck · 25 km/ })).toBeInTheDocument();
    // No chooser, so the header names the region again.
    expect(headerTitle()).toBe('Dein Tiroler Kalender');
  });

  it('is ignored for another region address: Tirol by hand is Tirol, not a circle', () => {
    window.localStorage.setItem(
      PLACE_SELECTION_KEY,
      JSON.stringify({
        label: 'Bregenz',
        lat: 47.503,
        lon: 9.747,
        radiusKm: 25,
        regionId: 'vorarlberg',
        source: 'search',
        updatedAt: 1,
      })
    );
    renderAt('/tirol');
    expect(screen.getByRole('button', { name: /aktuell Tirol/ })).toBeInTheDocument();
  });

  it('is not used with only Vorarlberg active (dark launch)', () => {
    mocks.regions = { regions: STATIC_REGIONS, loading: false };
    window.localStorage.setItem(
      PLACE_SELECTION_KEY,
      JSON.stringify({
        label: 'Bregenz',
        lat: 47.503,
        lon: 9.747,
        radiusKm: 25,
        regionId: 'vorarlberg',
        source: 'search',
        updatedAt: 1,
      })
    );
    renderAt('/');
    expect(screen.queryByTestId('region-switcher')).toBeNull();
  });
});

describe('combined views in switcher and chooser (ticket 33)', () => {
  beforeEach(() => {
    window.localStorage.setItem(REGION_CHOOSER_SEEN_KEY, '1');
  });

  it('an unavailable combined view address does not become the current view', () => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
    renderAt('/deutschland');
    expect(screen.getByRole('button', { name: /aktuell Vorarlberg/ })).toBeInTheDocument();
  });

  it('the chooser offers no combined views (for now)', () => {
    window.localStorage.clear();
    mocks.regions = { regions: THREE_ACTIVE, loading: false };
    renderAt('/');
    const chooser = screen.getByTestId('region-chooser');
    expect(within(chooser).queryByText(/Oder alles auf einmal/)).toBeNull();
    expect(
      within(chooser).queryByRole('button', { name: /Ganz Österreich|Alle Tribes/ })
    ).toBeNull();
  });

  it('opening a combined view address counts as a choice', () => {
    window.localStorage.clear();
    mocks.regions = { regions: AT_AND_DE, loading: false };
    renderAt('/alle-tribes');
    expect(window.localStorage.getItem(REGION_CHOOSER_SEEN_KEY)).toBe('1');
  });

  it('stays invisible with only Vorarlberg active (dark launch)', () => {
    window.localStorage.clear();
    mocks.regions = { regions: STATIC_REGIONS, loading: false };
    renderAt('/');
    expect(screen.queryByTestId('region-switcher')).toBeNull();
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });
});

describe('region chooser opened on purpose (/regionen)', () => {
  beforeEach(() => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
    // A region is remembered: the first-visit chooser would stay away.
    window.localStorage.setItem(LAST_REGION_STORAGE_KEY, 'vorarlberg');
  });

  it('shows the page although a region is remembered, and can be closed', () => {
    renderAt('/regionen');
    expect(screen.getByTestId('region-chooser')).toBeInTheDocument();
    expect(headerTitle()).toBe('Dein Kalender');
    fireEvent.click(screen.getByTestId('region-chooser-close'));
    expect(where()).toBe('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('closes with Escape', () => {
    renderAt('/regionen');
    key('Escape');
    expect(where()).toBe('/');
  });

  it('has no moderator card and no map', () => {
    renderAt('/regionen');
    expect(screen.getByTestId('place-picker')).toBeInTheDocument();
    expect(document.querySelector('.region-chooser-apply')).toBeNull();
    expect(screen.queryByTestId('region-map')).toBeNull();
  });

  it('choosing a place leaves the page', async () => {
    renderAt('/regionen');
    const chooser = screen.getByTestId('region-chooser');
    await searchAndPick(chooser, 'innsbruck', 'Innsbruck');
    apply(chooser);
    expect(where()).toBe('/tirol');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('is not required on the first-visit path: no close button there', () => {
    window.localStorage.clear();
    renderAt('/');
    expect(screen.queryByTestId('region-chooser-close')).toBeNull();
  });
});

describe('RegionChooser (first visit)', () => {
  beforeEach(() => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
  });

  it('shows as a modal dialog with focus inside, a place search and no map or region lists', () => {
    renderAt('/');
    const dialog = screen.getByRole('dialog', { name: 'Wo suchst du?' });
    // The header above it has the neutral title, without a region.
    expect(headerTitle()).toBe('Dein Kalender');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    expect(dialog.querySelector('.region-chooser-close')).toBeNull();
    expect(within(dialog).getByRole('combobox')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Meinen Standort verwenden/ })).toBeTruthy();
    expect(screen.queryByTestId('region-map')).toBeNull();
    expect(dialog.querySelectorAll('.region-chooser-country-name')).toHaveLength(0);
    expect(within(dialog).queryByRole('button', { name: 'Tirol' })).toBeNull();
  });

  it('shows nothing while the region data is loading', () => {
    mocks.regions = { regions: TWO_ACTIVE, loading: true };
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('a choice navigates, is remembered and the chooser does not come back', async () => {
    const { unmount } = renderAt('/');
    const chooser = screen.getByTestId('region-chooser');
    await searchAndPick(chooser, 'innsbruck', 'Innsbruck');
    apply(chooser);
    expect(where()).toBe('/tirol');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('tirol');
    expect(stored()).toMatchObject({ label: 'Innsbruck', regionId: 'tirol' });
    expect(screen.queryByTestId('region-chooser')).toBeNull();
    unmount();
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('on a touch device picking a place closes the on-screen keyboard (input loses focus)', async () => {
    stubPointer(true);
    renderAt('/');
    const input = await pickWithFocus(screen.getByTestId('region-chooser'));
    expect(input).not.toHaveFocus();
  });

  it('with a fine pointer picking a place keeps the focus in the search field', async () => {
    stubPointer(false);
    renderAt('/');
    const input = await pickWithFocus(screen.getByTestId('region-chooser'));
    expect(input).toHaveFocus();
  });

  it('the directory keeps its address when the choice is made there', async () => {
    renderAt('/verzeichnis');
    const chooser = screen.getByTestId('region-chooser');
    await searchAndPick(chooser, 'innsbruck', 'Innsbruck');
    apply(chooser);
    expect(where()).toBe('/tirol/verzeichnis');
  });

  it('cannot be dismissed with Escape or a backdrop click', () => {
    renderAt('/');
    key('Escape');
    fireEvent.click(document.querySelector('.region-chooser-backdrop')!);
    expect(screen.getByTestId('region-chooser')).toBeInTheDocument();
    expect(where()).toBe('/');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBeNull();
  });

  it('keeps Tab focus inside the dialog', () => {
    renderAt('/');
    const dialog = screen.getByRole('dialog');
    const stops = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')
    );
    stops[stops.length - 1].focus();
    key('Tab');
    expect(stops[0]).toHaveFocus();
    key('Tab', true);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('visiting a region address counts as a choice and the chooser never shows afterwards', () => {
    const { unmount } = renderAt('/tirol');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('tirol');
    unmount();
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('shows again when the remembered region is no longer active', () => {
    window.localStorage.setItem(LAST_REGION_STORAGE_KEY, 'wien');
    renderAt('/');
    expect(screen.getByTestId('region-chooser')).toBeInTheDocument();
  });

  it('stays away with a remembered region', () => {
    window.localStorage.setItem(LAST_REGION_STORAGE_KEY, 'vorarlberg');
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it.each(['/tirol', '/vorarlberg/verzeichnis', '/event/x', '/someprofile'])(
    'is not shown at %s',
    (path) => {
      renderAt(path);
      expect(screen.queryByTestId('region-chooser')).toBeNull();
    }
  );

  it('does not crash when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt('/');
    expect(screen.getByTestId('region-chooser')).toBeInTheDocument();
  });
});
