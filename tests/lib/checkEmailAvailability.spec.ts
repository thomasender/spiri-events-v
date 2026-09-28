import { describe, it, expect, vi, beforeEach } from 'vitest';

import { checkEmailAvailabilityHandler } from '../../functions/src/checkEmailAvailability';

function makeRequest({
  email,
  currentEmail,
  auth,
}: {
  email?: unknown;
  currentEmail?: unknown;
  auth?: { uid: string } | null;
} = {}) {
  return {
    data: { email, currentEmail },
    auth: auth === undefined ? { uid: 'user-1' } : auth,
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  };
}

const mockGetUserByEmail = vi.fn();
const mockEnforceRateLimit = vi.fn();

beforeEach(() => {
  mockGetUserByEmail.mockReset();
  mockEnforceRateLimit.mockReset();
  mockEnforceRateLimit.mockImplementation(() => {});
});

describe('checkEmailAvailabilityHandler', () => {
  it('returns available=true when the email is not registered', async () => {
    mockGetUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });

    const result = await checkEmailAvailabilityHandler(makeRequest({ email: 'free@example.com' }), {
      auth: { getUserByEmail: mockGetUserByEmail } as never,
      enforceRateLimit: mockEnforceRateLimit,
    });
    expect(result).toEqual({ available: true });
    expect(mockGetUserByEmail).toHaveBeenCalledWith('free@example.com');
  });

  it('returns available=false when the email belongs to a different account', async () => {
    mockGetUserByEmail.mockResolvedValue({
      uid: 'someone-else',
      email: 'taken@example.com',
    });

    const result = await checkEmailAvailabilityHandler(
      makeRequest({ email: 'taken@example.com', currentEmail: 'me@example.com' }),
      {
        auth: { getUserByEmail: mockGetUserByEmail } as never,
        enforceRateLimit: mockEnforceRateLimit,
      }
    );
    expect(result).toEqual({ available: false });
  });

  it('rejects an unauthenticated request even if the new email equals the current one', async () => {
    await expect(
      checkEmailAvailabilityHandler(
        makeRequest({ email: 'me@example.com', currentEmail: 'me@example.com', auth: null }),
        {
          auth: { getUserByEmail: mockGetUserByEmail } as never,
          enforceRateLimit: mockEnforceRateLimit,
        }
      )
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
  });

  it('normalises the email to lowercase before lookup', async () => {
    mockGetUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });

    await checkEmailAvailabilityHandler(makeRequest({ email: '  Mixed@Case.COM  ' }), {
      auth: { getUserByEmail: mockGetUserByEmail } as never,
      enforceRateLimit: mockEnforceRateLimit,
    });
    expect(mockGetUserByEmail).toHaveBeenCalledWith('mixed@case.com');
  });

  it('rejects an unauthenticated request', async () => {
    await expect(
      checkEmailAvailabilityHandler(makeRequest({ email: 'x@example.com', auth: null }), {
        auth: { getUserByEmail: mockGetUserByEmail } as never,
        enforceRateLimit: mockEnforceRateLimit,
      })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
  });

  it('rejects a missing or invalid email', async () => {
    await expect(
      checkEmailAvailabilityHandler(makeRequest({ email: 'not-an-email' }), {
        auth: { getUserByEmail: mockGetUserByEmail } as never,
        enforceRateLimit: mockEnforceRateLimit,
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
  });

  it('rejects a new email that matches the current email', async () => {
    await expect(
      checkEmailAvailabilityHandler(
        makeRequest({ email: 'me@example.com', currentEmail: 'me@example.com' }),
        {
          auth: { getUserByEmail: mockGetUserByEmail } as never,
          enforceRateLimit: mockEnforceRateLimit,
        }
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
  });

  it('wraps unexpected Admin SDK errors as internal', async () => {
    mockGetUserByEmail.mockRejectedValue({ code: 'auth/internal-error' });

    await expect(
      checkEmailAvailabilityHandler(makeRequest({ email: 'x@example.com' }), {
        auth: { getUserByEmail: mockGetUserByEmail } as never,
        enforceRateLimit: mockEnforceRateLimit,
      })
    ).rejects.toMatchObject({ code: 'internal' });
  });
});
