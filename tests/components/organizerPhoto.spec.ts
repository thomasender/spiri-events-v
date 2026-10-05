import { describe, it, expect } from 'vitest';
import { resolveOrganizerPhotoURL } from '../../src/utils/organizerPhoto';

const event = { createdBy: 'owner-uid', organizer: { photoURL: 'owner.jpg' } };

describe('resolveOrganizerPhotoURL', () => {
  it('uses the creator profile photo when creating an event', () => {
    expect(
      resolveOrganizerPhotoURL({
        isEdit: false,
        event: null,
        user: { uid: 'u1' },
        profile: { photoURL: 'mine.jpg' },
      })
    ).toBe('mine.jpg');
  });

  it('keeps the owner photo when an admin edits someone else’s event', () => {
    expect(
      resolveOrganizerPhotoURL({
        isEdit: true,
        event,
        user: { uid: 'admin-uid' },
        profile: { photoURL: 'admin.jpg' },
      })
    ).toBe('owner.jpg');
  });

  it('refreshes the photo when the owner edits their own event', () => {
    expect(
      resolveOrganizerPhotoURL({
        isEdit: true,
        event,
        user: { uid: 'owner-uid' },
        profile: { photoURL: 'new.jpg' },
      })
    ).toBe('new.jpg');
  });

  it('keeps the existing photo while the owner profile is still loading', () => {
    expect(
      resolveOrganizerPhotoURL({
        isEdit: true,
        event,
        user: { uid: 'owner-uid' },
        profile: null,
      })
    ).toBe('owner.jpg');
  });
});
