import { describe, it, expect, vi } from 'vitest';
import {
  buildMulticastMessage,
  deadTokenIndexes,
  sendPushPlan,
  sendPushToUids,
  type PushDeps,
} from '../../functions/src/push';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../functions/src/userPreferences';
import type { PushPlan } from '../../functions/src/pushRouting';

const message = { title: 'T', body: 'B', link: '/admin', tag: 'x' };

function depsWith(tokens: Record<string, string[]>, codes: Record<string, string | null> = {}) {
  const deleted: unknown[] = [];
  const deps: PushDeps = {
    loadTokens: async (uid) => (tokens[uid] ?? []).map((token) => ({ token, ref: `ref:${token}` })),
    sendEachForMulticast: vi.fn(async (msg) => ({
      responses: msg.tokens.map((token: string) =>
        codes[token] ? { success: false, error: { code: codes[token] } } : { success: true }
      ),
    })),
    deleteToken: async (ref) => {
      deleted.push(ref);
    },
  };
  return { deps, deleted };
}

describe('buildMulticastMessage', () => {
  it('is data-only (shown by our own service worker) with high urgency', () => {
    expect(buildMulticastMessage(['a'], message)).toEqual({
      tokens: ['a'],
      data: { title: 'T', body: 'B', link: '/admin', tag: 'x' },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } },
    });
  });
});

describe('deadTokenIndexes', () => {
  it('only counts tokens FCM no longer knows, not temporary errors', () => {
    expect(
      deadTokenIndexes({
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          { success: false, error: { code: 'messaging/internal-error' } },
          { success: false, error: { code: 'messaging/invalid-registration-token' } },
        ],
      })
    ).toEqual([1, 3]);
  });
});

describe('sendPushToUids', () => {
  it('sends to every device of every person once and deletes dead tokens', async () => {
    const { deps, deleted } = depsWith(
      { anna: ['t1', 't2'], ben: ['t2', 't3'] },
      { t3: 'messaging/registration-token-not-registered' }
    );
    const result = await sendPushToUids(['anna', 'ben', 'anna'], message, deps);
    expect(deps.sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.sendEachForMulticast).mock.calls[0][0].tokens).toEqual([
      't1',
      't2',
      't3',
    ]);
    expect(result).toEqual({ devices: 3, sent: 2, removed: 1 });
    expect(deleted).toEqual(['ref:t3']);
  });

  it('does not call FCM for people without devices', async () => {
    const { deps } = depsWith({});
    expect(await sendPushToUids(['anna'], message, deps)).toEqual({
      devices: 0,
      sent: 0,
      removed: 0,
    });
    expect(deps.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('keeps going when FCM fails for a batch', async () => {
    const { deps, deleted } = depsWith({ anna: ['t1'] });
    deps.sendEachForMulticast = vi.fn().mockRejectedValue(new Error('down'));
    expect(await sendPushToUids(['anna'], message, deps)).toEqual({
      devices: 1,
      sent: 0,
      removed: 0,
    });
    expect(deleted).toEqual([]);
  });
});

describe('sendPushPlan', () => {
  const plan: PushPlan = { uids: ['anna', 'ben'], prefKey: 'pushOnEventStatus', message };

  it('sends only to the people who switched this kind on', async () => {
    const { deps } = depsWith({ anna: ['t1'], ben: ['t2'] });
    const prefs = new Map([
      ['anna', { ...DEFAULT_NOTIFICATION_PREFERENCES, pushOnEventStatus: true }],
      ['ben', { ...DEFAULT_NOTIFICATION_PREFERENCES }],
    ]);
    const result = await sendPushPlan(plan, {}, { loadPreferences: async () => prefs, push: deps });
    expect(result).toEqual({ devices: 1, sent: 1, removed: 0 });
    expect(vi.mocked(deps.sendEachForMulticast).mock.calls[0][0].tokens).toEqual(['t1']);
  });

  it('never throws (a push must not block the mail)', async () => {
    const { deps } = depsWith({});
    await expect(
      sendPushPlan(plan, {}, { loadPreferences: () => Promise.reject(new Error('x')), push: deps })
    ).resolves.toBeNull();
  });

  it('does nothing without a plan', async () => {
    const { deps } = depsWith({});
    const loadPreferences = vi.fn();
    expect(await sendPushPlan(null, {}, { loadPreferences, push: deps })).toBeNull();
    expect(loadPreferences).not.toHaveBeenCalled();
  });
});
