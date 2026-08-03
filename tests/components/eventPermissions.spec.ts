import { describe, it, expect } from 'vitest';
import {
  isAdmin,
  isEventOwner,
  canEditEvent,
  canDeleteEvent,
} from '../../src/utils/eventPermissions';

describe('eventPermissions', () => {
  describe('isAdmin', () => {
    it('returns true when role is "Admin"', () => {
      expect(isAdmin('Admin')).toBe(true);
    });

    it('returns false when role is null or undefined', () => {
      expect(isAdmin(null)).toBe(false);
      expect(isAdmin(undefined)).toBe(false);
    });

    it('returns false for any other role string', () => {
      expect(isAdmin('User')).toBe(false);
      expect(isAdmin('admin')).toBe(false);
      expect(isAdmin('')).toBe(false);
    });
  });

  describe('isEventOwner', () => {
    it('returns true when user.uid equals event.createdBy', () => {
      const user = { uid: 'user-1' };
      const event = { createdBy: 'user-1' };
      expect(isEventOwner(user, event)).toBe(true);
    });

    it('returns false when uids differ', () => {
      const user = { uid: 'user-1' };
      const event = { createdBy: 'user-2' };
      expect(isEventOwner(user, event)).toBe(false);
    });

    it('returns false when user or event is missing', () => {
      expect(isEventOwner(null, { createdBy: 'user-1' })).toBe(false);
      expect(isEventOwner({ uid: 'user-1' }, null)).toBe(false);
      expect(isEventOwner({}, { createdBy: 'user-1' })).toBe(false);
    });
  });

  describe('canEditEvent', () => {
    it('returns true for the owner', () => {
      expect(canEditEvent({ uid: 'u1' }, { createdBy: 'u1' }, null)).toBe(true);
    });

    it('returns true for an admin even on foreign events', () => {
      expect(canEditEvent({ uid: 'admin-1' }, { createdBy: 'user-2' }, 'Admin')).toBe(true);
    });

    it('returns false for a non-admin non-owner user', () => {
      expect(canEditEvent({ uid: 'user-3' }, { createdBy: 'user-2' }, null)).toBe(false);
    });

    it('returns false for unauthenticated users', () => {
      expect(canEditEvent(null, { createdBy: 'user-2' }, null)).toBe(false);
      expect(canEditEvent(null, { createdBy: 'user-2' }, 'Admin')).toBe(false);
    });
  });

  describe('canDeleteEvent', () => {
    it('mirrors canEditEvent — owner or admin can delete', () => {
      expect(canDeleteEvent({ uid: 'u1' }, { createdBy: 'u1' }, null)).toBe(true);
      expect(canDeleteEvent({ uid: 'admin-1' }, { createdBy: 'user-2' }, 'Admin')).toBe(true);
      expect(canDeleteEvent({ uid: 'user-3' }, { createdBy: 'user-2' }, null)).toBe(false);
    });
  });
});
