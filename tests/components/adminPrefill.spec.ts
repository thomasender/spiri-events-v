import { describe, it, expect } from 'vitest';
import {
  applyAdminPrefill,
  getTomorrowIso,
  shouldPrefillForAdmin,
} from '../../src/utils/adminPrefill';

describe('adminPrefill', () => {
  it('only prefills for the Admin role', () => {
    expect(shouldPrefillForAdmin('Admin')).toBe(true);
    expect(shouldPrefillForAdmin('Moderator')).toBe(false);
    expect(shouldPrefillForAdmin('User')).toBe(false);
    expect(shouldPrefillForAdmin(null)).toBe(false);
  });

  it('computes tomorrow across month boundaries', () => {
    expect(getTomorrowIso(new Date(2026, 0, 31, 23, 30))).toBe('2026-02-01');
  });

  it('fills empty mandatory fields and keeps existing values', () => {
    const base = { title: '', description: '', date: '', time: '', category: '', bezirk: '' };
    const out = applyAdminPrefill(base, { now: new Date(2026, 9, 19), bezirke: ['Bludenz'] });
    expect(out).toMatchObject({
      date: '2026-10-20',
      time: '12:00',
      category: 'Sonstiges',
      bezirk: 'Bludenz',
    });
    expect(out.title).toBe('');
    const kept = applyAdminPrefill({ ...base, title: 'Mein Titel', time: '09:00' });
    expect(kept.title).toBe('Mein Titel');
    expect(kept.time).toBe('09:00');
  });

  it('skips Bludenz when unavailable', () => {
    expect(applyAdminPrefill({ bezirk: '' }, { bezirke: ['Bregenz'] }).bezirk).toBe('');
  });
});
