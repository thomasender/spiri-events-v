import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATIC_REGIONS, mergeRegions } from '../../src/utils/regions';
import {
  LAST_REGION_STORAGE_KEY,
  REGION_CHOOSER_SEEN_KEY,
  regionSwitchSubpath,
} from '../../src/utils/regionRouting';

const mocks = vi.hoisted(() => ({
  regions: { regions: [] as unknown[], loading: false },
  trackFilter: vi.fn(),
}));

vi.mock('../../src/hooks/useRegions', () => ({ useRegions: () => mocks.regions }));
vi.mock('../../src/lib/analyticsEvents', () => ({ trackFilter: mocks.trackFilter }));

import RegionProvider from '../../src/components/RegionProvider';
import RegionSwitcher, { RegionMenuList } from '../../src/components/RegionSwitcher';
import RegionChooser from '../../src/components/RegionChooser';

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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RegionProvider>
        <RegionSwitcher />
        <RegionChooser />
        <Where />
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
  fireEvent.click(screen.getByRole('button', { name: /Region wählen, aktuell/ }));
  return screen.getByTestId('region-picker');
};
// Types into the pop-up's search field and clicks the suggestion with this label.
const searchAndPick = (dialog: HTMLElement, query: string, label: string | RegExp) => {
  fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: query } });
  const option = within(dialog)
    .getAllByTestId('region-search-option')
    .find((o) => {
      const text = o.querySelector('.region-search-option-label')!.textContent ?? '';
      return typeof label === 'string' ? text === label : label.test(text);
    })!;
  fireEvent.click(option);
};

describe('RegionSwitcher with two active regions', () => {
  beforeEach(() => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
    window.localStorage.setItem(REGION_CHOOSER_SEEN_KEY, '1');
  });

  it('opens a pop-up with location button, search and map link, but no region chips', () => {
    renderAt('/');
    const trigger = screen.getByRole('button', { name: /Region wählen, aktuell Vorarlberg/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('region-picker')).toBeNull();
    const dialog = openPicker();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: /Meinen Standort verwenden/ })).toBeTruthy();
    expect(within(dialog).getByRole('combobox')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Auf der Karte wählen/ })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Tirol' })).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: /Ganz Österreich|Alle Tribes/ })
    ).toBeNull();
    expect(within(dialog).queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });

  it('the search finds regions and districts, and marks regions that are not open yet', () => {
    renderAt('/');
    const dialog = openPicker();
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'tirol' } });
    expect(within(dialog).getAllByTestId('region-search-option')[0]).toHaveTextContent('Tirol');
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'bayern' } });
    expect(within(dialog).getAllByTestId('region-search-option')[0]).toHaveTextContent('bald');
  });

  it('"Auf der Karte wählen" closes the pop-up and opens the map page', () => {
    renderAt('/');
    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole('button', { name: /Auf der Karte wählen/ }));
    expect(where()).toBe('/regionen');
    expect(screen.queryByTestId('region-picker')).toBeNull();
  });

  it('navigates to the region, keeps the area and remembers the choice', () => {
    renderAt('/vorarlberg/verzeichnis');
    searchAndPick(openPicker(), 'tirol', 'Tirol');
    expect(where()).toBe('/tirol/verzeichnis');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('tirol');
    expect(mocks.trackFilter).toHaveBeenCalledWith('region', 'tirol');
    expect(screen.queryByTestId('region-picker')).toBeNull();
    expect(screen.getByRole('button', { name: /aktuell Tirol/ })).toBeInTheDocument();
  });

  it('a region that is not open yet leads to its coming-soon address', () => {
    renderAt('/');
    searchAndPick(openPicker(), 'zürich', /^Zürich/);
    expect(where()).toBe('/zuerich');
  });

  it('from an event page the switch leads to the region calendar', () => {
    renderAt('/event/some-event');
    searchAndPick(openPicker(), 'tirol', 'Tirol');
    expect(where()).toBe('/tirol');
  });

  it('choosing the current region only closes the pop-up', () => {
    renderAt('/');
    searchAndPick(openPicker(), 'vorarlberg', 'Vorarlberg');
    expect(where()).toBe('/');
    expect(screen.queryByTestId('region-picker')).toBeNull();
  });

  it('closes with the X, Escape or a click next to it, and focus returns to the button', () => {
    renderAt('/');
    const trigger = screen.getByRole('button', { name: /Region wählen, aktuell/ });
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
  });

  it('keeps Tab focus inside the pop-up', () => {
    renderAt('/');
    const dialog = openPicker();
    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    key('Tab');
    expect(buttons[0]).toHaveFocus();
    key('Tab', true);
    expect(buttons[buttons.length - 1]).toHaveFocus();
  });

  it('does not crash when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt('/');
    searchAndPick(openPicker(), 'tirol', 'Tirol');
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

  it('is one button naming the region; it closes the menu and opens the same pop-up', () => {
    const onNavigate = renderList();
    const button = screen.getByRole('button', { name: /Region: Vorarlberg/ });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalled();
    const dialog = screen.getByTestId('region-picker');
    searchAndPick(dialog, 'tirol', 'Tirol');
    expect(where()).toBe('/tirol');
    expect(screen.queryByTestId('region-picker')).toBeNull();
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

describe('combined views in switcher and chooser (ticket 33)', () => {
  beforeEach(() => {
    window.localStorage.setItem(REGION_CHOOSER_SEEN_KEY, '1');
  });

  it('an unavailable combined view address does not become the current view', () => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
    renderAt('/deutschland');
    expect(screen.getByRole('button', { name: /aktuell Vorarlberg/ })).toBeInTheDocument();
  });

  it('chooser lists the available combined views; choosing one counts as a choice', () => {
    window.localStorage.clear();
    mocks.regions = { regions: THREE_ACTIVE, loading: false };
    const { unmount } = renderAt('/');
    const labels = Array.from(
      document.querySelectorAll('.region-chooser-options--views .region-chooser-option')
    ).map((b) => b.textContent);
    // All four views are always offered; unavailable ones are marked "(bald)".
    expect(labels).toEqual([
      'Ganz Österreich',
      'Ganz Deutschland (bald)',
      'Ganz Schweiz (bald)',
      'Alle Tribes',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Alle Tribes' }));
    expect(where()).toBe('/alle-tribes');
    expect(window.localStorage.getItem(REGION_CHOOSER_SEEN_KEY)).toBe('1');
    unmount();
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
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

  it('shows the map page although a region is remembered, and can be closed', () => {
    renderAt('/regionen');
    expect(screen.getByTestId('region-chooser')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('region-chooser-close'));
    expect(where()).toBe('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('closes with Escape', () => {
    renderAt('/regionen');
    key('Escape');
    expect(where()).toBe('/');
  });

  it('Escape in the search field only closes the suggestions, not the page', () => {
    renderAt('/regionen');
    const input = screen.getByTestId('region-search-input');
    fireEvent.change(input, { target: { value: 'tir' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(where()).toBe('/regionen');
    expect(screen.getByTestId('region-chooser')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByTestId('region-chooser')).toBeInTheDocument();
    key('Escape');
    expect(where()).toBe('/');
  });

  it('a view without enough open regions still opens its coming-soon address', () => {
    renderAt('/regionen');
    fireEvent.click(screen.getByRole('button', { name: /^Ganz Deutschland/ }));
    expect(where()).toBe('/deutschland');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('choosing a region (also a closed one) leaves the page', () => {
    renderAt('/regionen');
    fireEvent.click(screen.getByRole('button', { name: /^Schwyz/ }));
    expect(where()).toBe('/schwyz');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('is not required on the first-visit path: no close button there', () => {
    window.localStorage.clear();
    renderAt('/');
    expect(screen.queryByTestId('region-chooser-close')).toBeNull();
  });
});

describe('RegionChooser', () => {
  beforeEach(() => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
  });

  it('shows on the first visit as a modal dialog with focus inside and lists the regions', () => {
    renderAt('/');
    const dialog = screen.getByRole('dialog', { name: 'Wo suchst du?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    expect(dialog.querySelector('.region-chooser-close, .region-chooser-skip')).toBeNull();
    const labels = Array.from(dialog.querySelectorAll('.region-chooser-option')).map(
      (b) => b.textContent
    );
    // Combined views first, then every region grouped by country: open regions
    // plain, the others marked "(bald)".
    expect(labels.slice(0, 4)).toEqual([
      'Ganz Österreich',
      'Ganz Deutschland (bald)',
      'Ganz Schweiz (bald)',
      'Alle Tribes',
    ]);
    expect(labels).toHaveLength(4 + 51);
    expect(labels).toContain('Vorarlberg');
    expect(labels).toContain('Tirol');
    expect(labels).toContain('Bayern (bald)');
    expect(labels).not.toContain('Steiermark');
    expect(dialog.querySelectorAll('.region-chooser-country-name')).toHaveLength(3);
  });

  it('shows the silent map; clicking a region on it is a choice, closed regions go to coming soon', async () => {
    renderAt('/');
    const map = await screen.findByTestId('region-map');
    expect(map).toHaveAttribute('data-testid', 'region-map');
    expect(map.querySelectorAll('path[data-region]')).toHaveLength(51);
    // The map is a pointer shortcut; the list is the accessible equivalent.
    expect(map.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.mouseEnter(map.querySelector('path[data-region="bayern"]')!);
    expect(screen.getByTestId('region-map-caption')).toHaveTextContent('Bayern (bald)');
    fireEvent.click(map.querySelector('path[data-region="steiermark"]')!);
    expect(where()).toBe('/steiermark');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('steiermark');
  });

  it('shows nothing while the region data is loading', () => {
    mocks.regions = { regions: TWO_ACTIVE, loading: true };
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('a choice navigates, is remembered and the chooser does not come back', () => {
    const { unmount } = renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Tirol' }));
    expect(where()).toBe('/tirol');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('tirol');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
    unmount();
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('searching a Landkreis and pressing Enter is a choice of its region', () => {
    renderAt('/');
    const input = screen.getByTestId('region-search-input');
    fireEvent.change(input, { target: { value: 'münchen' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(where()).toBe('/bayern');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('bayern');
  });

  it('groups the German regions by Grossregion, hides regions without Landkreise', () => {
    mocks.regions = {
      regions: TWO_ACTIVE.map((r) =>
        r.id === 'franken'
          ? { ...r, bezirke: ['Roth'] }
          : r.id === 'bayern'
            ? { ...r, bezirke: [] }
            : r
      ),
      loading: false,
    };
    renderAt('/');
    const south = screen.getByTestId('region-chooser-macro-Südosten');
    expect(within(south).getByRole('button', { name: /^Franken/ })).toBeInTheDocument();
    // Bayern lost all its Landkreise: gone for visitors; empty cultural regions never show.
    expect(screen.queryByRole('button', { name: /^Bayern/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Oberbayern/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('region-chooser-macro-Norden')).toBeInTheDocument();
  });

  it('offers the countries as accordions, Austria open', () => {
    renderAt('/');
    expect(screen.getByTestId('region-chooser-country-AT')).toHaveAttribute('open');
    expect(screen.getByTestId('region-chooser-country-DE')).not.toHaveAttribute('open');
    expect(screen.getByTestId('region-chooser-country-CH')).not.toHaveAttribute('open');
  });

  it('Ganz Österreich counts as a choice too', () => {
    const { unmount } = renderAt('/verzeichnis');
    fireEvent.click(screen.getByRole('button', { name: 'Ganz Österreich' }));
    expect(where()).toBe('/oesterreich/verzeichnis');
    unmount();
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
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
    const options = within(screen.getByRole('dialog')).getAllByRole('button');
    options[options.length - 1].focus();
    key('Tab');
    // The search field is the first stop of the dialog.
    expect(screen.getByTestId('region-search-input')).toHaveFocus();
    key('Tab'); // from the dialog itself / first button stays inside
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
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

  it('stays away with a remembered region or on region, event and profile addresses', () => {
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
