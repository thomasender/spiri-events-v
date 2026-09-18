import { describe, it, expect } from 'vitest';
import {
  decideEventStatusNotification,
  decideCreatedEventNotification,
  decideAdminMessageNotification,
  EventSnapshot,
} from '../../functions/src/notificationRouting';

const organizer = (email: string | null = 'owner@example.com') => ({
  firstName: 'Anna',
  lastName: 'Müller',
  email,
  photoURL: null,
});

describe('decideEventStatusNotification', () => {
  it('returns null when the status did not change', () => {
    const before: EventSnapshot = { status: 'pending', organizer: organizer() };
    const after: EventSnapshot = { status: 'pending', organizer: organizer() };
    expect(decideEventStatusNotification('evt1', before, after, 'Titel', 'slug')).toBeNull();
  });

  it('returns null when only side fields changed but status is unchanged', () => {
    const before: EventSnapshot = { status: 'pending', organizer: organizer() };
    const after: EventSnapshot = { status: 'pending', organizer: organizer() };
    expect(decideEventStatusNotification('evt1', before, after)).toBeNull();
  });

  it('emits a "submitted" decision with admins recipient on transition to pending', () => {
    const before: EventSnapshot = { status: 'draft', organizer: organizer() };
    const after: EventSnapshot = { status: 'pending', organizer: organizer() };
    const decision = decideEventStatusNotification('evt1', before, after, 'Titel', 'slug');
    expect(decision).not.toBeNull();
    expect(decision?.type).toBe('submitted');
    expect(decision?.recipient).toBe('admins');
    expect(decision?.event.id).toBe('evt1');
    expect(decision?.event.title).toBe('Titel');
    expect(decision?.event.slug).toBe('slug');
  });

  it('emits a "submitted" decision when re-submitting (approved → pending)', () => {
    const before: EventSnapshot = { status: 'approved', organizer: organizer() };
    const after: EventSnapshot = { status: 'pending', organizer: organizer() };
    const decision = decideEventStatusNotification('evt1', before, after);
    expect(decision?.type).toBe('submitted');
    expect(decision?.recipient).toBe('admins');
  });

  it('emits a "published" decision on transition to approved', () => {
    const before: EventSnapshot = { status: 'pending', organizer: organizer() };
    const after: EventSnapshot = { status: 'approved', organizer: organizer() };
    const decision = decideEventStatusNotification('evt1', before, after);
    expect(decision?.type).toBe('published');
    expect(decision?.recipient).toBe('owner@example.com');
  });

  it('emits a "deleted" decision on transition to trashed (any source status)', () => {
    const cases: Array<EventSnapshot['status']> = ['draft', 'pending', 'approved'];
    for (const sourceStatus of cases) {
      const before: EventSnapshot = { status: sourceStatus, organizer: organizer() };
      const after: EventSnapshot = { status: 'trashed', organizer: organizer() };
      const decision = decideEventStatusNotification('evt1', before, after);
      expect(decision?.type).toBe('deleted');
      expect(decision?.recipient).toBe('owner@example.com');
    }
  });

  it('returns null when the after status is unrecognized', () => {
    const before: EventSnapshot = { status: 'pending', organizer: organizer() };
    const after: EventSnapshot = {
      status: 'archived' as unknown as 'pending',
      organizer: organizer(),
    };
    expect(decideEventStatusNotification('evt1', before, after)).toBeNull();
  });

  it('skips owner notifications when the organizer email is missing', () => {
    const before: EventSnapshot = { status: 'pending', organizer: organizer(null) };
    const after: EventSnapshot = { status: 'approved', organizer: organizer(null) };
    expect(decideEventStatusNotification('evt1', before, after)).toBeNull();
  });

  it('emits "submitted" even when the organizer email is missing (recipients are admins)', () => {
    const before: EventSnapshot = { status: 'draft', organizer: organizer(null) };
    const after: EventSnapshot = { status: 'pending', organizer: organizer(null) };
    expect(decideEventStatusNotification('evt1', before, after)?.type).toBe('submitted');
  });

  it('returns null when transitioning from a lifecycle status to draft', () => {
    const before: EventSnapshot = { status: 'pending', organizer: organizer() };
    const after: EventSnapshot = { status: 'draft', organizer: organizer() };
    expect(decideEventStatusNotification('evt1', before, after)).toBeNull();
  });

  it('uses the event title and slug from the caller arguments', () => {
    const before: EventSnapshot = { status: 'pending', organizer: organizer() };
    const after: EventSnapshot = { status: 'approved', organizer: organizer() };
    const decision = decideEventStatusNotification('evt1', before, after, 'Konzert', 'konzert');
    expect(decision?.event.title).toBe('Konzert');
    expect(decision?.event.slug).toBe('konzert');
  });

  it('falls back to empty title when none is supplied', () => {
    const before: EventSnapshot = { status: 'pending', organizer: organizer() };
    const after: EventSnapshot = { status: 'approved', organizer: organizer() };
    const decision = decideEventStatusNotification('evt1', before, after);
    expect(decision?.event.title).toBe('');
    expect(decision?.event.slug).toBeNull();
  });
});

describe('decideCreatedEventNotification', () => {
  it('emits a "submitted" decision when a new event is created with status pending', () => {
    const after: EventSnapshot = { status: 'pending', organizer: organizer() };
    const decision = decideCreatedEventNotification('evt1', after, 'Neues Event', 'neues-event');
    expect(decision).not.toBeNull();
    expect(decision?.type).toBe('submitted');
    expect(decision?.recipient).toBe('admins');
    expect(decision?.event.id).toBe('evt1');
    expect(decision?.event.title).toBe('Neues Event');
    expect(decision?.event.slug).toBe('neues-event');
  });

  it('returns null when a new event is created as a draft', () => {
    const after: EventSnapshot = { status: 'draft', organizer: organizer() };
    expect(decideCreatedEventNotification('evt1', after)).toBeNull();
  });

  it('returns null when a new event is created directly as approved', () => {
    const after: EventSnapshot = { status: 'approved', organizer: organizer() };
    expect(decideCreatedEventNotification('evt1', after)).toBeNull();
  });

  it('returns null when a new event is created directly as trashed', () => {
    const after: EventSnapshot = { status: 'trashed', organizer: organizer() };
    expect(decideCreatedEventNotification('evt1', after)).toBeNull();
  });

  it('returns null when the created event has no recognisable status', () => {
    const after: EventSnapshot = {
      status: 'archived' as unknown as 'pending',
      organizer: organizer(),
    };
    expect(decideCreatedEventNotification('evt1', after)).toBeNull();
  });

  it('skips the notification when the event was already marked as notified for pending', () => {
    const after: EventSnapshot = {
      status: 'pending',
      organizer: organizer(),
      lastNotifiedStatus: 'pending',
    };
    expect(decideCreatedEventNotification('evt1', after)).toBeNull();
  });

  it('emits "submitted" even when the organizer email is missing (recipients are admins)', () => {
    const after: EventSnapshot = { status: 'pending', organizer: organizer(null) };
    const decision = decideCreatedEventNotification('evt1', after);
    expect(decision?.type).toBe('submitted');
    expect(decision?.recipient).toBe('admins');
  });
});

describe('decideAdminMessageNotification', () => {
  it('returns null when the message is not from an admin', () => {
    const result = decideAdminMessageNotification(
      'evt1',
      { id: 'm1', authorRole: 'User', text: 'Bitte ändern.' },
      { organizer: organizer() }
    );
    expect(result).toBeNull();
  });

  it('returns null when the message has no text', () => {
    expect(
      decideAdminMessageNotification(
        'evt1',
        { id: 'm1', authorRole: 'Admin', text: '   ' },
        { organizer: organizer() }
      )
    ).toBeNull();
    expect(
      decideAdminMessageNotification(
        'evt1',
        { id: 'm1', authorRole: 'Admin', text: null },
        { organizer: organizer() }
      )
    ).toBeNull();
  });

  it('returns null when the event owner email is missing', () => {
    const result = decideAdminMessageNotification(
      'evt1',
      { id: 'm1', authorRole: 'Admin', text: 'Bitte anpassen.' },
      { organizer: organizer(null) }
    );
    expect(result).toBeNull();
  });

  it('emits a "changes_requested" decision addressed to the owner', () => {
    const result = decideAdminMessageNotification(
      'evt1',
      {
        id: 'm1',
        authorRole: 'Admin',
        authorName: 'Anna',
        text: '  Bitte genauer beschreiben.  ',
      },
      { organizer: organizer() },
      'Workshop',
      'workshop'
    );
    expect(result).not.toBeNull();
    expect(result?.type).toBe('changes_requested');
    expect(result?.recipient).toBe('owner@example.com');
    expect(result?.event.title).toBe('Workshop');
    expect(result?.event.slug).toBe('workshop');
    expect(result?.context.text).toBe('Bitte genauer beschreiben.');
    expect(result?.context.authorName).toBe('Anna');
  });

  it('falls back to "Das tribe-Team" when the admin author name is empty', () => {
    const result = decideAdminMessageNotification(
      'evt1',
      { id: 'm1', authorRole: 'Admin', authorName: '', text: 'hallo' },
      { organizer: organizer() }
    );
    expect(result?.context.authorName).toBe('Das tribe-Team');
  });
});
