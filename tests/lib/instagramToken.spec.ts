import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getInstagramAccessToken,
  refreshInstagramToken,
  DAY_MS,
  FALLBACK_EXPIRY,
  type RefreshDeps,
  type StoredToken,
  type TokenStatusPatch,
} from '../../functions/src/instagram/instagramToken';

const SECRET = 'SECRET_TOKEN_AAA';
const STORED = 'STORED_TOKEN_BBB';
const NEW_TOKEN = 'NEW_TOKEN_CCC';
const NOW = new Date('2026-11-10T04:00:00Z'); // 25 days before fallback expiry

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface Harness {
  deps: RefreshDeps;
  fetchMock: ReturnType<typeof vi.fn>;
  saved: StoredToken[];
  statuses: TokenStatusPatch[];
  notify: ReturnType<typeof vi.fn>;
  logs: string[];
}

function makeHarness(
  opts: {
    stored?: StoredToken | null;
    secret?: string;
    fetchImpl?: (url: string) => Response | Promise<Response>;
  } = {}
): Harness {
  const saved: StoredToken[] = [];
  const statuses: TokenStatusPatch[] = [];
  const logs: string[] = [];
  const fetchMock = vi.fn(async (url: string) =>
    opts.fetchImpl
      ? opts.fetchImpl(url)
      : json({ access_token: NEW_TOKEN, token_type: 'bearer', expires_in: 5184000 })
  );
  const notify = vi.fn(async () => undefined);
  const deps: RefreshDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    secretToken: opts.secret ?? SECRET,
    readStoredToken: async () => opts.stored ?? null,
    saveToken: async (t) => {
      saved.push(t);
    },
    writeStatus: async (p) => {
      statuses.push(p);
    },
    notifyAdmins: notify,
    log: (m, d) => logs.push(`${m} ${JSON.stringify(d ?? {})}`),
  };
  return { deps, fetchMock, saved, statuses, notify, logs };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('getInstagramAccessToken', () => {
  const base = { secretToken: SECRET };

  it('prefers a valid Firestore token', async () => {
    const token = await getInstagramAccessToken({
      ...base,
      readStoredToken: async () => ({
        accessToken: STORED,
        expiresAt: new Date(NOW.getTime() + DAY_MS),
        refreshedAt: null,
      }),
    });
    expect(token).toBe(STORED);
  });

  it('falls back to the secret when nothing is stored', async () => {
    expect(await getInstagramAccessToken({ ...base, readStoredToken: async () => null })).toBe(
      SECRET
    );
  });

  it('falls back to the secret when the stored token is expired', async () => {
    const token = await getInstagramAccessToken({
      ...base,
      readStoredToken: async () => ({
        accessToken: STORED,
        expiresAt: new Date(NOW.getTime() - 1000),
        refreshedAt: null,
      }),
    });
    expect(token).toBe(SECRET);
  });

  it('falls back to the secret when Firestore throws, without leaking tokens', async () => {
    const logs: string[] = [];
    const token = await getInstagramAccessToken({
      ...base,
      readStoredToken: async () => {
        throw new Error(`boom access_token=${SECRET}`);
      },
      log: (m, d) => logs.push(`${m} ${JSON.stringify(d)}`),
    });
    expect(token).toBe(SECRET);
    expect(logs.join('\n')).not.toContain(SECRET);
  });
});

describe('refreshInstagramToken timing', () => {
  it('does nothing (but records expiry) when 30+ days are left', async () => {
    vi.setSystemTime(new Date('2026-10-20T04:00:00Z')); // ~46 days left
    const h = makeHarness();
    expect(await refreshInstagramToken(h.deps)).toBe('not-due');
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.statuses).toEqual([{ tokenExpiresAt: FALLBACK_EXPIRY }]);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('refreshes when less than 30 days are left (first run, fallback expiry)', async () => {
    const h = makeHarness();
    expect(await refreshInstagramToken(h.deps)).toBe('refreshed');
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const url = h.fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('https://graph.instagram.com/refresh_access_token');
    expect(url).toContain('grant_type=ig_refresh_token');
    expect(url).toContain(`access_token=${SECRET}`);
  });

  it('uses the stored token and its expiry once present', async () => {
    const h = makeHarness({
      stored: {
        accessToken: STORED,
        expiresAt: new Date(NOW.getTime() + 20 * DAY_MS),
        refreshedAt: new Date(NOW.getTime() - 40 * DAY_MS),
      },
    });
    expect(await refreshInstagramToken(h.deps)).toBe('refreshed');
    expect(h.fetchMock.mock.calls[0][0]).toContain(`access_token=${STORED}`);
  });

  it('does not refresh a stored token with plenty of validity left', async () => {
    const h = makeHarness({
      stored: {
        accessToken: STORED,
        expiresAt: new Date(NOW.getTime() + 50 * DAY_MS),
        refreshedAt: new Date(NOW.getTime() - 10 * DAY_MS),
      },
    });
    expect(await refreshInstagramToken(h.deps)).toBe('not-due');
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('waits when the stored token is younger than 24h', async () => {
    const h = makeHarness({
      stored: {
        accessToken: STORED,
        expiresAt: new Date(NOW.getTime() + 10 * DAY_MS),
        refreshedAt: new Date(NOW.getTime() - 3600 * 1000),
      },
    });
    expect(await refreshInstagramToken(h.deps)).toBe('too-young');
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it('skips when no token is configured at all', async () => {
    const h = makeHarness({ secret: '' });
    expect(await refreshInstagramToken(h.deps)).toBe('not-configured');
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
});

describe('refreshInstagramToken success', () => {
  it('stores the new token, expiry and metadata, clears the error, sends no mail', async () => {
    const h = makeHarness();
    await refreshInstagramToken(h.deps);
    const expiry = new Date(NOW.getTime() + 5184000 * 1000);
    expect(h.saved).toEqual([{ accessToken: NEW_TOKEN, expiresAt: expiry, refreshedAt: NOW }]);
    expect(h.statuses).toEqual([
      { tokenExpiresAt: expiry, tokenRefreshedAt: NOW, tokenRefreshError: null },
    ]);
    expect(h.notify).not.toHaveBeenCalled();
    // metadata patches never carry the token
    expect(JSON.stringify(h.statuses)).not.toContain(NEW_TOKEN);
  });
});

describe('refreshInstagramToken failure', () => {
  it('writes a sanitised error and mails the admins (HTTP error)', async () => {
    const h = makeHarness({
      fetchImpl: () =>
        json({ error: { message: `Invalid token access_token=${SECRET} ${SECRET}` } }, 400),
    });
    expect(await refreshInstagramToken(h.deps)).toBe('failed');
    expect(h.saved).toEqual([]);
    expect(h.statuses).toHaveLength(1);
    const err = h.statuses[0].tokenRefreshError as string;
    expect(err).toContain('HTTP 400');
    expect(err).not.toContain(SECRET);
    expect(h.notify).toHaveBeenCalledTimes(1);
    const [subject, text] = h.notify.mock.calls[0] as unknown as [string, string];
    expect(subject).toContain('Token');
    expect(text).toContain('HTTP 400');
    expect(`${subject}${text}`).not.toContain(SECRET);
    expect(h.logs.join('\n')).not.toContain(SECRET);
  });

  it('sanitises network errors that contain the request URL', async () => {
    const h = makeHarness({
      fetchImpl: () => {
        throw new Error(`fetch failed for ?access_token=${SECRET}&x=1`);
      },
    });
    expect(await refreshInstagramToken(h.deps)).toBe('failed');
    const everything = JSON.stringify([h.statuses, h.notify.mock.calls, h.logs]);
    expect(everything).not.toContain(SECRET);
    expect(h.statuses[0].tokenRefreshError).toContain('[redacted]');
  });

  it('treats a malformed success body as failure', async () => {
    const h = makeHarness({ fetchImpl: () => json({ nope: true }) });
    expect(await refreshInstagramToken(h.deps)).toBe('failed');
    expect(h.saved).toEqual([]);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('still reports failure when storing the error and mailing both fail', async () => {
    const h = makeHarness({ fetchImpl: () => json({}, 500) });
    h.deps.writeStatus = async () => {
      throw new Error(`db down ${SECRET}`);
    };
    h.notify.mockRejectedValueOnce(new Error(`mail down ${SECRET}`));
    expect(await refreshInstagramToken(h.deps)).toBe('failed');
    expect(h.logs.join('\n')).not.toContain(SECRET);
  });

  it('does not store the new token when persisting it fails, and does not leak it', async () => {
    const h = makeHarness();
    h.deps.saveToken = async () => {
      throw new Error(`write failed ${NEW_TOKEN}`);
    };
    expect(await refreshInstagramToken(h.deps)).toBe('failed');
    const everything = JSON.stringify([h.statuses, h.notify.mock.calls, h.logs]);
    expect(everything).not.toContain(NEW_TOKEN);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });
});

describe('expiry warning', () => {
  it('mails with the remaining days when failing within 14 days of expiry', async () => {
    vi.setSystemTime(new Date('2026-11-26T04:00:00Z')); // 8.8 days left
    const h = makeHarness({ fetchImpl: () => json({}, 500) });
    await refreshInstagramToken(h.deps);
    const text = (h.notify.mock.calls[0] as unknown as [string, string])[1];
    expect(text).toContain('8 Tag');
  });

  it('warns when the refreshed token is still short-lived', async () => {
    const h = makeHarness({
      fetchImpl: () => json({ access_token: NEW_TOKEN, expires_in: 5 * 24 * 3600 }),
    });
    expect(await refreshInstagramToken(h.deps)).toBe('refreshed');
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('keeps going when an already expired fallback token cannot be refreshed', async () => {
    vi.setSystemTime(new Date('2026-12-20T04:00:00Z'));
    const h = makeHarness({ fetchImpl: () => json({ error: { message: 'expired' } }, 400) });
    expect(await refreshInstagramToken(h.deps)).toBe('failed');
    expect((h.notify.mock.calls[0] as unknown as [string, string])[1]).toContain('0 Tag');
  });
});
