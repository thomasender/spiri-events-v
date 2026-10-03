import { describe, it, expect } from 'vitest';
import { MailgunError } from '../../functions/src/mailgun';
import { toVerificationEmailHttpsError } from '../../functions/src/sendVerificationEmail';

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
