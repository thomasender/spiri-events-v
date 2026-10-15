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
// Vorarlberg (AT) + Allgäu (DE): "Alle Tribes" is available, the country views are not.
const AT_AND_DE = mergeRegions([{ id: 'allgaeu', active: true }]);
// Vorarlberg + Tirol (AT) + Allgäu (DE): "Ganz Österreich" and "Alle Tribes".
const THREE_ACTIVE = mergeRegions([
  { id: 'tirol', active: true },
  { id: 'allgaeu', active: true },
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

const key = (k: string) => fireEvent.keyDown(document.activeElement as HTMLElement, { key: k });
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

describe('RegionSwitcher with two active regions', () => {
  beforeEach(() => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
    window.localStorage.setItem(REGION_CHOOSER_SEEN_KEY, '1');
  });

  it('lists only active regions plus Ganz Österreich and marks the current one', () => {
    renderAt('/');
    const trigger = screen.getByRole('button', { name: /Region wählen, aktuell Vorarlberg/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual(['Vorarlberg', 'Tirol', 'Ganz Österreich']);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('navigates to the region, keeps the area and remembers the choice', () => {
    renderAt('/vorarlberg/verzeichnis');
    fireEvent.click(screen.getByTestId('region-switcher').querySelector('button')!);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Tirol' }));
    expect(where()).toBe('/tirol/verzeichnis');
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBe('tirol');
    expect(mocks.trackFilter).toHaveBeenCalledWith('region', 'tirol');
    expect(screen.getByRole('button', { name: /aktuell Tirol/ })).toBeInTheDocument();
  });

  it('Ganz Österreich opens the combined view', () => {
    renderAt('/tirol');
    fireEvent.click(screen.getByRole('button', { name: /aktuell Tirol/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Ganz Österreich' }));
    expect(where()).toBe('/oesterreich');
    expect(screen.getByRole('button', { name: /aktuell Ganz Österreich/ })).toBeInTheDocument();
  });

  it('from an event page the switch leads to the region calendar', () => {
    renderAt('/event/some-event');
    fireEvent.click(screen.getByRole('button', { name: /Region wählen/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Tirol' }));
    expect(where()).toBe('/tirol');
  });

  it('works with the keyboard: arrows, Enter, Escape returns focus', () => {
    renderAt('/');
    const trigger = screen.getByRole('button', { name: /Region wählen/ });
    trigger.focus();
    key('ArrowDown');
    expect(screen.getByRole('menuitemradio', { name: 'Vorarlberg' })).toHaveFocus();
    key('ArrowDown');
    expect(screen.getByRole('menuitemradio', { name: 'Tirol' })).toHaveFocus();
    key('ArrowDown');
    key('ArrowDown');
    expect(screen.getByRole('menuitemradio', { name: 'Vorarlberg' })).toHaveFocus();
    key('Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
    key('ArrowDown');
    key('ArrowDown');
    fireEvent.click(document.activeElement as HTMLElement); // Enter on a button clicks it
    expect(where()).toBe('/tirol');
  });

  it('does not crash when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: /Region wählen/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Tirol' }));
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

  it('lists the regions, marks the current one and closes the menu on choice', () => {
    const onNavigate = renderList();
    const list = screen.getByTestId('region-menu-list');
    expect(within(list).getByRole('button', { name: 'Vorarlberg' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(within(list).getByRole('button', { name: 'Tirol' }));
    expect(onNavigate).toHaveBeenCalled();
    expect(where()).toBe('/tirol');
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

  it('offers only the available combined views below the regions', () => {
    mocks.regions = { regions: AT_AND_DE, loading: false };
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: /Region wählen/ }));
    expect(screen.getAllByRole('menuitemradio').map((i) => i.textContent)).toEqual([
      'Vorarlberg',
      'Allgäu',
      'Alle Tribes',
    ]);
  });

  it('offers Ganz Österreich and Alle Tribes with Austria + Germany, and navigates there', () => {
    mocks.regions = { regions: THREE_ACTIVE, loading: false };
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: /Region wählen/ }));
    expect(screen.getAllByRole('menuitemradio').map((i) => i.textContent)).toEqual([
      'Vorarlberg',
      'Tirol',
      'Allgäu',
      'Ganz Österreich',
      'Alle Tribes',
    ]);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Alle Tribes' }));
    expect(where()).toBe('/alle-tribes');
    expect(screen.getByRole('button', { name: /aktuell Alle Tribes/ })).toBeInTheDocument();
  });

  it('shows the current combined view as selected after opening its address', () => {
    mocks.regions = { regions: THREE_ACTIVE, loading: false };
    renderAt('/alle-tribes');
    fireEvent.click(screen.getByRole('button', { name: /aktuell Alle Tribes/ }));
    expect(screen.getByRole('menuitemradio', { name: 'Alle Tribes' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
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
    const labels = Array.from(document.querySelectorAll('.region-chooser-option')).map(
      (b) => b.textContent
    );
    expect(labels).toEqual(['Vorarlberg', 'Tirol', 'Allgäu', 'Ganz Österreich', 'Alle Tribes']);
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
    expect(labels).toEqual(['Vorarlberg', 'Tirol', 'Ganz Österreich']);
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
    expect(options[0]).toHaveFocus();
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
