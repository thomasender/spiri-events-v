import { describe, it, expect } from 'vitest';
import {
  buildAdminRecipients,
  buildAdminRecipientList,
  filterRecipientsByPreferenceMap,
  preferenceKeyForType,
  uniqueEmails,
  ResolvedRecipient,
} from '../../functions/src/notifications';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../functions/src/userPreferences';

describe('uniqueEmails', () => {
  it('removes exact duplicates', () => {
    expect(uniqueEmails(['a@x.com', 'a@x.com'])).toEqual(['a@x.com']);
  });

  it('deduplicates case-insensitively and trims whitespace', () => {
    expect(uniqueEmails(['a@x.com', '  A@X.com  ', 'b@x.com'])).toEqual(['a@x.com', 'b@x.com']);
  });

  it('drops empty / non-string entries', () => {
    expect(uniqueEmails(['', '   ', 'a@x.com', null, undefined, 5])).toEqual(['a@x.com']);
  });

  it('preserves first-seen casing of an address', () => {
    expect(uniqueEmails(['Alice@x.com', 'alice@x.com'])).toEqual(['Alice@x.com']);
  });
});

describe('buildAdminRecipients', () => {
  it('returns the admin emails when no inbox is configured', () => {
    expect(buildAdminRecipients(['p@x.com'], null)).toEqual(['p@x.com']);
    expect(buildAdminRecipients(['p@x.com'], undefined)).toEqual(['p@x.com']);
    expect(buildAdminRecipients(['p@x.com'], '')).toEqual(['p@x.com']);
    expect(buildAdminRecipients(['p@x.com'], '   ')).toEqual(['p@x.com']);
  });

  it('appends the inbox on top of the per-admin recipients', () => {
    expect(buildAdminRecipients(['p@x.com', 't@x.com'], 'admin@thetribe.at')).toEqual([
      'p@x.com',
      't@x.com',
      'admin@thetribe.at',
    ]);
  });

  it('deduplicates when an admin already owns the inbox address', () => {
    expect(buildAdminRecipients(['admin@thetribe.at', 'p@x.com'], 'admin@thetribe.at')).toEqual([
      'admin@thetribe.at',
      'p@x.com',
    ]);
  });

  it('still yields a single recipient when only the inbox is configured', () => {
    expect(buildAdminRecipients([], 'admin@thetribe.at')).toEqual(['admin@thetribe.at']);
  });
});

describe('buildAdminRecipientList', () => {
  it('returns one entry per admin with its uid', () => {
    expect(
      buildAdminRecipientList([
        { uid: 'uid-a', email: 'a@x.com' },
        { uid: 'uid-b', email: 'b@x.com' },
      ])
    ).toEqual([
      { uid: 'uid-a', email: 'a@x.com' },
      { uid: 'uid-b', email: 'b@x.com' },
    ]);
  });

  it('appends a shared inbox email (without a uid) when not already present', () => {
    expect(buildAdminRecipientList([{ uid: 'uid-a', email: 'a@x.com' }], 'shared@x.com')).toEqual([
      { uid: 'uid-a', email: 'a@x.com' },
      { email: 'shared@x.com' },
    ]);
  });

  it('does not duplicate the inbox when an admin already owns it', () => {
    expect(
      buildAdminRecipientList([{ uid: 'uid-a', email: 'shared@x.com' }], 'shared@x.com')
    ).toEqual([{ uid: 'uid-a', email: 'shared@x.com' }]);
  });

  it('ignores a blank inbox string', () => {
    expect(buildAdminRecipientList([{ uid: 'uid-a', email: 'a@x.com' }], '   ')).toEqual([
      { uid: 'uid-a', email: 'a@x.com' },
    ]);
  });
});

describe('preferenceKeyForType', () => {
  it('maps every notification type to a preference key', () => {
    expect(preferenceKeyForType('submitted')).toBe('notifyOnSubmitted');
    expect(preferenceKeyForType('changes_requested')).toBe('notifyOnChangesRequested');
    expect(preferenceKeyForType('published')).toBe('notifyOnPublished');
    expect(preferenceKeyForType('deleted')).toBe('notifyOnDeleted');
  });
});

describe('filterRecipientsByPreferenceMap', () => {
  const organizerRecipient: ResolvedRecipient = { uid: 'uid-owner', email: 'owner@x.com' };
  const adminA: ResolvedRecipient = { uid: 'uid-a', email: 'a@x.com' };
  const adminB: ResolvedRecipient = { uid: 'uid-b', email: 'b@x.com' };
  const sharedInbox: ResolvedRecipient = { email: 'shared@x.com' };

  it('keeps everyone when the preference map is empty (defaults apply)', () => {
    expect(
      filterRecipientsByPreferenceMap('submitted', [adminA, adminB, sharedInbox], new Map())
    ).toEqual([adminA, adminB, sharedInbox]);
    expect(filterRecipientsByPreferenceMap('published', [organizerRecipient], new Map())).toEqual([
      organizerRecipient,
    ]);
  });

  it('drops admins who opted out of submitted notifications', () => {
    const prefMap = new Map([
      ['uid-a', { ...DEFAULT_NOTIFICATION_PREFERENCES, notifyOnSubmitted: false }],
    ]);
    expect(
      filterRecipientsByPreferenceMap('submitted', [adminA, adminB, sharedInbox], prefMap)
    ).toEqual([adminB, sharedInbox]);
  });

  it('drops the organizer when they opted out of published notifications', () => {
    const prefMap = new Map([
      ['uid-owner', { ...DEFAULT_NOTIFICATION_PREFERENCES, notifyOnPublished: false }],
    ]);
    expect(filterRecipientsByPreferenceMap('published', [organizerRecipient], prefMap)).toEqual([]);
  });

  it('always delivers to recipients that have no uid (e.g. the shared inbox)', () => {
    const prefMap = new Map([
      ['uid-a', { ...DEFAULT_NOTIFICATION_PREFERENCES, notifyOnSubmitted: false }],
    ]);
    expect(filterRecipientsByPreferenceMap('submitted', [adminA, sharedInbox], prefMap)).toEqual([
      sharedInbox,
    ]);
  });

  it('keeps recipients without uid even when the recipient list is otherwise empty', () => {
    expect(filterRecipientsByPreferenceMap('changes_requested', [sharedInbox], new Map())).toEqual([
      sharedInbox,
    ]);
  });

  it('does not filter organizer recipients whose preference map entry is missing', () => {
    const prefMap = new Map([
      ['someone-else', { ...DEFAULT_NOTIFICATION_PREFERENCES, notifyOnPublished: false }],
    ]);
    expect(filterRecipientsByPreferenceMap('published', [organizerRecipient], prefMap)).toEqual([
      organizerRecipient,
    ]);
  });

  it('returns an empty array when given an empty recipient list', () => {
    expect(filterRecipientsByPreferenceMap('deleted', [], new Map())).toEqual([]);
  });
});
