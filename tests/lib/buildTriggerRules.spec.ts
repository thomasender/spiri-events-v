import { describe, it, expect } from 'vitest';
import { regionActiveChanged } from '../../functions/src/buildTriggerRules';

// Switching a region on or off must rebuild the prerendered `/`, otherwise its
// region-mode hint stays stale and first-time visitors see the Vorarlberg calendar
// flash before "Wo suchst du?".
describe('regionActiveChanged', () => {
  it('is true when a region is switched on or off', () => {
    expect(regionActiveChanged({ active: false }, { active: true })).toBe(true);
    expect(regionActiveChanged({ active: true }, { active: false })).toBe(true);
    expect(regionActiveChanged({ name: 'Tirol' }, { name: 'Tirol', active: true })).toBe(true);
  });

  it('is true when an active region is created or deleted', () => {
    expect(regionActiveChanged(undefined, { active: true })).toBe(true);
    expect(regionActiveChanged({ active: true }, undefined)).toBe(true);
  });

  it('is false when the active state stays the same', () => {
    expect(regionActiveChanged({ active: true }, { active: true, name: 'Neu' })).toBe(false);
    expect(regionActiveChanged({ active: false }, { active: false, seo: {} })).toBe(false);
    expect(regionActiveChanged(undefined, { active: false })).toBe(false);
    expect(regionActiveChanged(null, null)).toBe(false);
  });
});
