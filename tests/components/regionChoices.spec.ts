import { describe, it, expect } from 'vitest';
import {
  buildRegionChoices,
  directoryDistrictGroups,
  districtsAfterRegionChange,
  keepIfInRegion,
  selectedRegionId,
  subdivisionFor,
} from '../../src/utils/regionChoices';
import { STATIC_REGIONS, getAllDistricts, mergeRegions } from '../../src/utils/regions';
import { getStaffAccess } from '../../src/utils/staffRoles';
import { DIRECTORY_REGIONS, validateDirectoryListing } from '../../src/utils/directory';

// Static register with the given regions active.
function registerWithActive(ids: string[]) {
  return mergeRegions([
    ...STATIC_REGIONS.map((r) => ({ id: r.id, active: ids.includes(r.id) })),
    { id: 'tirol', active: ids.includes('tirol') },
  ]);
}

function choices(activeIds: string[], extra = {}) {
  const all = registerWithActive(activeIds);
  return buildRegionChoices({
    activeRegions: all.filter((r) => r.active),
    allRegions: all,
    currentRegionId: 'vorarlberg',
    ...extra,
  });
}

describe('buildRegionChoices', () => {
  it('is disabled with one active region (forms stay as today)', () => {
    const c = choices(['vorarlberg']);
    expect(c.enabled).toBe(false);
    expect(c.options).toEqual([]);
    expect(subdivisionFor('vorarlberg', c)).toEqual({ label: 'Bezirk', options: null });
  });

  it('offers only active regions to ordinary users', () => {
    const c = choices(['vorarlberg', 'tirol']);
    expect(c.enabled).toBe(true);
    // Register order (CSV): Tirol before Vorarlberg.
    expect(c.options.map((r) => r.id)).toEqual(['tirol', 'vorarlberg']);
  });

  it('adds inactive regions the person may moderate, and the region an event already has', () => {
    const all = registerWithActive(['vorarlberg', 'tirol']);
    const base = {
      activeRegions: all.filter((r) => r.active),
      allRegions: all,
      currentRegionId: 'tirol',
    };
    expect(
      buildRegionChoices({ ...base, access: getStaffAccess('Admin', []) }).options.length
    ).toBe(STATIC_REGIONS.length);
    const mod = getStaffAccess('RegionModerator', ['wien']);
    expect(buildRegionChoices({ ...base, access: mod }).options.map((r) => r.id)).toEqual([
      'tirol',
      'vorarlberg',
      'wien',
    ]);
    expect(
      buildRegionChoices({ ...base, keepRegionId: 'salzburg' }).options.map((r) => r.id)
    ).toContain('salzburg');
  });

  it('preselects the current region, else Vorarlberg, else the first option', () => {
    expect(choices(['vorarlberg', 'tirol'], { currentRegionId: 'tirol' }).defaultRegionId).toBe(
      'tirol'
    );
    expect(choices(['vorarlberg', 'tirol'], { currentRegionId: 'wien' }).defaultRegionId).toBe(
      'vorarlberg'
    );
    expect(choices(['salzburg', 'tirol'], { currentRegionId: 'wien' }).defaultRegionId).toBe(
      'salzburg'
    );
  });
});

describe('sub-area helpers', () => {
  const c = choices(['vorarlberg', 'steiermark', 'liechtenstein']);

  it('label and options follow the region', () => {
    expect(subdivisionFor('liechtenstein', c).label).toBe('Landesteil');
    expect(subdivisionFor('steiermark', c).label).toBe('Bezirk');
    expect(subdivisionFor('vorarlberg', c).options).toContain('Dornbirn');
    // The legacy "Umgebung" is never offered for an event (Trello dx8dCQJc), even when a
    // Firestore doc still lists it.
    expect(subdivisionFor('vorarlberg', c).options).not.toContain('Grenznahe');
  });

  it('keepIfInRegion resets a district of another region', () => {
    expect(keepIfInRegion('Dornbirn', 'vorarlberg', c)).toBe('Dornbirn');
    expect(keepIfInRegion('Dornbirn', 'liechtenstein', c)).toBe('');
    expect(keepIfInRegion('', 'liechtenstein', c)).toBe('');
  });

  it('selectedRegionId falls back to the default for unknown or unavailable ids', () => {
    expect(selectedRegionId('liechtenstein', c)).toBe('liechtenstein');
    expect(selectedRegionId('wien', c)).toBe('vorarlberg');
    expect(selectedRegionId('', c)).toBe('vorarlberg');
  });

  it('directory groups and cleanup follow the chosen regions', () => {
    const groups = directoryDistrictGroups(['vorarlberg', 'liechtenstein'], c);
    expect(groups.map((g) => g.label)).toEqual(['Bezirke', 'Landesteile']);
    expect(
      districtsAfterRegionChange(['Dornbirn', 'Oberland', 'Online'], ['liechtenstein'], c)
    ).toEqual(['Oberland', 'Online']);
  });
});

describe('directory district list', () => {
  it('keeps Vorarlberg first and adds all other known districts plus Online', () => {
    expect(DIRECTORY_REGIONS.slice(0, 5)).toEqual([
      'Bregenz',
      'Dornbirn',
      'Feldkirch',
      'Bludenz',
      'Grenznahe',
    ]);
    expect(DIRECTORY_REGIONS).toEqual([...getAllDistricts(), 'Online']);
    expect(DIRECTORY_REGIONS).toContain('Leibnitz');
    expect(DIRECTORY_REGIONS).toContain('Oberland');
    expect(DIRECTORY_REGIONS).not.toContain('Oberallgäu');
    expect(DIRECTORY_REGIONS).toContain('Zürich');
    expect(DIRECTORY_REGIONS.at(-1)).toBe('Online');
  });

  it('validateDirectoryListing accepts known districts and Firestore-only ones via extraRegions', () => {
    const base = { listed: true, categories: ['Yoga'], hasBio: true };
    expect(validateDirectoryListing({ ...base, regions: ['Leibnitz'] })).toEqual({});
    expect(validateDirectoryListing({ ...base, regions: ['Nirgendwo'] }).regions).toBeTruthy();
    expect(
      validateDirectoryListing({ ...base, regions: ['Nirgendwo'], extraRegions: ['Nirgendwo'] })
    ).toEqual({});
  });
});
