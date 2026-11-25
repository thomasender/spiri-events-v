import { describe, it, expect } from 'vitest';
import { MailgunError } from '../../functions/src/mailgun';
import {
  toVerificationEmailHttpsError,
  renderEmail,
  buildVerificationButtonUrl,
} from '../../functions/src/sendVerificationEmail';

describe('toVerificationEmailHttpsError', () => {
  it('reports an exhausted Mailgun quota as resource-exhausted', () => {
    const err = new MailgunError('Mailgun send failed (429)', 429, {
      message: 'daily request limit (100) exceeded',
    });
    expect(toVerificationEmailHttpsError(err).code).toBe('resource-exhausted');
  });

  it('reports other Mailgun rejections as unavailable', () => {
    const err = new MailgunError('Mailgun send failed (401)', 401, null);
    expect(toVerificationEmailHttpsError(err).code).toBe('unavailable');
  });

  it('reports Firebase link throttling as resource-exhausted', () => {
    const err = Object.assign(new Error('An internal error has occurred.'), {
      code: 'auth/internal-error',
      cause: { response: { text: '{"error":{"message":"TOO_MANY_ATTEMPTS_TRY_LATER"}}' } },
    });
    expect(toVerificationEmailHttpsError(err).code).toBe('resource-exhausted');
  });

  it('passes HttpsErrors through and maps unknown errors to internal', () => {
    const mapped = toVerificationEmailHttpsError(new Error('boom'));
    expect(mapped.code).toBe('internal');
    expect(toVerificationEmailHttpsError(mapped)).toBe(mapped);
  });
});

describe('renderEmail', () => {
  it('uses the article "den" before Tribe in the subject', () => {
    const { subject } = renderEmail({
      displayName: 'Anna',
      buttonUrl: 'https://www.thetribe.at/auth-action?x=1',
      appName: 'Tribe',
    });
    expect(subject).toBe('Bestätige deine E-Mail-Adresse für den Tribe');
  });
});

describe('buildVerificationButtonUrl', () => {
  const ORIGIN = 'https://www.thetribe.at';

  it('leads to the action page without `next` by default', () => {
    expect(buildVerificationButtonUrl(ORIGIN, 'a b')).toBe(
      'https://www.thetribe.at/auth-action?mode=verifyEmail&oobCode=a%20b'
    );
  });

  it('adds next=/admin/new for a guest who filled in the event wizard', () => {
    const url = new URL(buildVerificationButtonUrl(ORIGIN, 'code', 'createEvent'));
    expect(url.searchParams.get('next')).toBe('/admin/new');
    expect(url.searchParams.get('oobCode')).toBe('code');
  });

  it('adds next=/uebernehmen (without any token) for an organizer claiming events', () => {
    const url = new URL(buildVerificationButtonUrl(ORIGIN, 'code', 'claimEvents'));
    expect(url.searchParams.get('next')).toBe('/uebernehmen');
    expect(url.search).not.toContain('claim=');
  });

  it('ignores unknown values instead of passing a path through', () => {
    for (const value of ['/admin', 'https://evil.example', '__proto__', 'toString', 42, null]) {
      expect(buildVerificationButtonUrl(ORIGIN, 'code', value)).not.toContain('next=');
    }
  });
});
