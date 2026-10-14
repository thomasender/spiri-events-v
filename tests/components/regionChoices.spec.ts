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

// Static register with the given regions active; Tirol gets its Bezirke like
// the emulator fixture (they normally come from Firestore).
function registerWithActive(ids: string[]) {
  return mergeRegions([
    ...STATIC_REGIONS.map((r) => ({ id: r.id, active: ids.includes(r.id) })),
    { id: 'tirol', active: ids.includes('tirol'), bezirke: ['Innsbruck', 'Kufstein'] },
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
    expect(c.options.map((r) => r.id)).toEqual(['vorarlberg', 'tirol']);
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
      'vorarlberg',
      'tirol',
      'wien',
    ]);
    expect(
      buildRegionChoices({ ...base, keepRegionId: 'salzburg' }).options.map((r) => r.id)
    ).toContain('salzburg');
  });

  it('preselects the current region, else the first option', () => {
    expect(choices(['vorarlberg', 'tirol'], { currentRegionId: 'tirol' }).defaultRegionId).toBe(
      'tirol'
    );
    expect(choices(['vorarlberg', 'tirol'], { currentRegionId: 'wien' }).defaultRegionId).toBe(
      'vorarlberg'
    );
  });
});

describe('sub-area helpers', () => {
  const c = choices(['vorarlberg', 'steiermark', 'allgaeu']);

  it('label and options follow the region', () => {
    expect(subdivisionFor('allgaeu', c).label).toBe('Landkreis');
    expect(subdivisionFor('steiermark', c).label).toBe('Bezirk');
    expect(subdivisionFor('vorarlberg', c).options).toContain('Dornbirn');
  });

  it('keepIfInRegion resets a district of another region', () => {
    expect(keepIfInRegion('Dornbirn', 'vorarlberg', c)).toBe('Dornbirn');
    expect(keepIfInRegion('Dornbirn', 'allgaeu', c)).toBe('');
    expect(keepIfInRegion('', 'allgaeu', c)).toBe('');
  });

  it('selectedRegionId falls back to the default for unknown or unavailable ids', () => {
    expect(selectedRegionId('allgaeu', c)).toBe('allgaeu');
    expect(selectedRegionId('wien', c)).toBe('vorarlberg');
    expect(selectedRegionId('', c)).toBe('vorarlberg');
  });

  it('directory groups and cleanup follow the chosen regions', () => {
    const groups = directoryDistrictGroups(['vorarlberg', 'allgaeu'], c);
    expect(groups.map((g) => g.label)).toEqual(['Bezirke', 'Landkreise']);
    expect(
      districtsAfterRegionChange(['Dornbirn', 'Oberallgäu', 'Online'], ['allgaeu'], c)
    ).toEqual(['Oberallgäu', 'Online']);
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
    expect(DIRECTORY_REGIONS).toContain('Oberallgäu');
  });

  it('validateDirectoryListing accepts known districts and Firestore-only ones via extraRegions', () => {
    const base = { listed: true, categories: ['Yoga'], hasBio: true };
    expect(validateDirectoryListing({ ...base, regions: ['Leibnitz'] })).toEqual({});
    expect(validateDirectoryListing({ ...base, regions: ['Innsbruck'] }).regions).toBeTruthy();
    expect(
      validateDirectoryListing({ ...base, regions: ['Innsbruck'], extraRegions: ['Innsbruck'] })
    ).toEqual({});
  });
});
