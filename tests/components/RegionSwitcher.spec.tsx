import { fireEvent, render, screen } from '@testing-library/react';
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
import RegionSwitcher from '../../src/components/RegionSwitcher';
import RegionChooser from '../../src/components/RegionChooser';

const TWO_ACTIVE = mergeRegions([{ id: 'tirol', active: true }]);

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

describe('RegionChooser', () => {
  beforeEach(() => {
    mocks.regions = { regions: TWO_ACTIVE, loading: false };
  });

  it('shows on the first visit, with focus inside, and lists the regions', () => {
    renderAt('/');
    const dialog = screen.getByRole('dialog', { name: 'Wo suchst du?' });
    expect(dialog).toHaveFocus();
    const labels = Array.from(dialog.querySelectorAll('.region-chooser-option')).map(
      (b) => b.textContent
    );
    expect(labels).toEqual(['Vorarlberg', 'Tirol', 'Ganz Österreich']);
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

  it('Escape and skip dismiss it once for good', () => {
    const { unmount } = renderAt('/');
    key('Escape');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
    expect(where()).toBe('/');
    unmount();
    renderAt('/');
    expect(screen.queryByTestId('region-chooser')).toBeNull();
  });

  it('skip button dismisses without changing the region', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Später entscheiden' }));
    expect(screen.queryByTestId('region-chooser')).toBeNull();
    expect(window.localStorage.getItem(LAST_REGION_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(REGION_CHOOSER_SEEN_KEY)).toBe('1');
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
