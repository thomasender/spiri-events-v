import { describe, it, expect, vi } from 'vitest';
import {
  allowedAdminTabs,
  getStaffAccess,
  isModeratorForEvent,
  messageAuthorRole,
  moderatorErrorMessage,
} from '../../src/utils/staffRoles';
import { requiresDeleteReason, canEditEvent } from '../../src/utils/eventPermissions';
import { canPreviewRegion } from '../../src/hooks/useCanPreviewRegion';
import { staffEventQuerySpecs } from '../../src/lib/staffEventQueries';

vi.mock('../../src/lib/firebase', () => ({ db: {}, auth: {}, functions: {} }));

const superAdmin = getStaffAccess('Admin', []);
const tirolMod = getStaffAccess('RegionModerator', ['tirol']);
const organizer = getStaffAccess(null, []);

describe('getStaffAccess', () => {
  it('Super-Admin may moderate every region', () => {
    expect(superAdmin).toMatchObject({
      isSuperAdmin: true,
      isRegionModerator: false,
      isStaff: true,
    });
    expect(superAdmin.canModerateRegion('wien')).toBe(true);
  });

  it('moderator: only her valid regions, canonical order', () => {
    const access = getStaffAccess('RegionModerator', ['wien', 'atlantis', 'tirol']);
    expect(access.moderatorRegionIds).toEqual(['tirol', 'wien']);
    expect(access.canModerateRegion('tirol')).toBe(true);
    expect(access.canModerateRegion('vorarlberg')).toBe(false);
  });

  it('a moderator doc without valid regions, or regionIds on another role, grants nothing', () => {
    expect(getStaffAccess('RegionModerator', ['atlantis']).isStaff).toBe(false);
    expect(getStaffAccess('RegionModerator', 'tirol').isStaff).toBe(false);
    expect(getStaffAccess('User', ['tirol']).isStaff).toBe(false);
    expect(organizer.canModerateRegion('vorarlberg')).toBe(false);
  });
});

describe('allowedAdminTabs', () => {
  it('per role', () => {
    expect([...allowedAdminTabs(superAdmin)]).toContain('moderation');
    expect([...allowedAdminTabs(superAdmin)]).toContain('about');
    expect([...allowedAdminTabs(tirolMod)].sort()).toEqual(
      ['about', 'drafts', 'events', 'members', 'messages', 'review', 'trash'].sort()
    );
    expect([...allowedAdminTabs(organizer)].sort()).toEqual(
      ['drafts', 'events', 'messages', 'trash'].sort()
    );
  });
});

describe('isModeratorForEvent', () => {
  it('non-draft events of her regions; legacy events count as Vorarlberg', () => {
    expect(isModeratorForEvent(tirolMod, { status: 'pending', regionId: 'tirol' })).toBe(true);
    expect(isModeratorForEvent(tirolMod, { status: 'approved', regionId: 'tirol' })).toBe(true);
    expect(isModeratorForEvent(tirolMod, { status: 'draft', regionId: 'tirol' })).toBe(false);
    expect(isModeratorForEvent(tirolMod, { status: 'pending', regionId: 'wien' })).toBe(false);
    expect(isModeratorForEvent(tirolMod, { status: 'pending' })).toBe(false);
    const vbMod = getStaffAccess('RegionModerator', ['vorarlberg']);
    expect(isModeratorForEvent(vbMod, { status: 'pending' })).toBe(true);
    expect(isModeratorForEvent(superAdmin, { status: 'pending' })).toBe(false);
  });
});

describe('messageAuthorRole', () => {
  it('staff write as Admin, a moderator on her own event as the organizer', () => {
    expect(messageAuthorRole(superAdmin, true)).toBe('Admin');
    expect(messageAuthorRole(tirolMod, false)).toBe('Admin');
    expect(messageAuthorRole(tirolMod, true)).toBe('User');
    expect(messageAuthorRole(organizer, true)).toBe('User');
  });
});

describe('event permissions for moderators', () => {
  const user = { uid: 'mod' };
  const tirolEvent = { createdBy: 'owner', status: 'pending', regionId: 'tirol' };

  it('a moderator needs a reason to trash someone else’s event of her region', () => {
    expect(requiresDeleteReason(user, tirolEvent, 'RegionModerator', ['tirol'])).toBe(true);
    expect(
      requiresDeleteReason(user, { ...tirolEvent, createdBy: 'mod' }, 'RegionModerator', ['tirol'])
    ).toBe(false);
  });

  it('a moderator never edits content of other people’s events', () => {
    expect(canEditEvent(user, tirolEvent, 'RegionModerator')).toBe(false);
    expect(canEditEvent(user, tirolEvent, 'Admin')).toBe(true);
  });

  it('a moderator may preview her own inactive region only', () => {
    expect(canPreviewRegion({ role: 'RegionModerator', staffRegionIds: ['tirol'] }, 'tirol')).toBe(
      true
    );
    expect(canPreviewRegion({ role: 'RegionModerator', staffRegionIds: ['tirol'] }, 'wien')).toBe(
      false
    );
    expect(canPreviewRegion({ role: 'Admin' }, 'wien')).toBe(true);
    expect(canPreviewRegion({ role: null }, 'wien')).toBe(false);
  });
});

describe('staffEventQuerySpecs', () => {
  it('Super-Admin: one query over all events of that status (unchanged)', () => {
    expect(staffEventQuerySpecs({ access: superAdmin, uid: 'a', status: 'pending' })).toEqual([
      { key: 'all', constraints: [['status', '==', 'pending']] },
    ]);
  });

  it('moderator: region-filtered query (required by the rules) plus her own events', () => {
    const mod = getStaffAccess('RegionModerator', ['tirol', 'wien']);
    expect(staffEventQuerySpecs({ access: mod, uid: 'm', status: 'trashed' })).toEqual([
      {
        key: 'region',
        constraints: [
          ['status', '==', 'trashed'],
          ['regionId', 'in', ['tirol', 'wien']],
        ],
      },
      {
        key: 'own',
        constraints: [
          ['status', '==', 'trashed'],
          ['createdBy', '==', 'm'],
        ],
      },
    ]);
    expect(
      staffEventQuerySpecs({ access: mod, uid: 'm', status: 'pending', includeOwn: false })
    ).toHaveLength(1);
  });

  it('never queries other people’s drafts, and organizers only see their own', () => {
    expect(staffEventQuerySpecs({ access: tirolMod, uid: 'm', status: 'draft' })).toEqual([
      {
        key: 'own',
        constraints: [
          ['status', '==', 'draft'],
          ['createdBy', '==', 'm'],
        ],
      },
    ]);
    expect(staffEventQuerySpecs({ access: organizer, uid: 'o', status: 'pending' })).toEqual([
      {
        key: 'own',
        constraints: [
          ['status', '==', 'pending'],
          ['createdBy', '==', 'o'],
        ],
      },
    ]);
    expect(staffEventQuerySpecs({ access: organizer, uid: undefined, status: 'pending' })).toEqual(
      []
    );
  });
});

describe('moderatorErrorMessage', () => {
  it('maps every server error to plain German', () => {
    expect(moderatorErrorMessage({ code: 'functions/not-found' })).toMatch(/gibt es nicht mehr/);
    expect(
      moderatorErrorMessage({ code: 'functions/invalid-argument', message: 'uid is invalid.' })
    ).toMatch(/nicht gefunden/);
    expect(moderatorErrorMessage({ code: 'functions/unauthenticated' })).toMatch(/melde dich/);
    expect(moderatorErrorMessage({ code: 'functions/unavailable' })).toMatch(/nicht erreichbar/);
    expect(moderatorErrorMessage(new Error('boom'))).toMatch(/nicht geklappt/);
  });
});
