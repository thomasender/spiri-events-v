import { describe, it, expect } from 'vitest';
import { buildAdminRecipients, uniqueEmails } from '../../functions/src/notifications';

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
