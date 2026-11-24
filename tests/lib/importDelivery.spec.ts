import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  EMPTY_STATS,
  MAX_BAD_RATE,
  MIN_SAMPLE_FOR_RATE,
  applyStatsDelta,
  badRate,
  handleDeliveryWebhook,
  parseDeliveryEvent,
  pauseReason,
  planDelivery,
  stripMessageId,
  verifyMailgunSignature,
  type DeliveryDeps,
  type OutreachStats,
} from '../../functions/src/importDelivery';
import { blocklistId } from '../../functions/src/eventImport';

const KEY = 'signing-key';
const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);

const sign = (timestamp: string, token = 'tok', key = KEY) => ({
  timestamp,
  token,
  signature: createHmac('sha256', key).update(`${timestamp}${token}`).digest('hex'),
});
const freshSig = (key = KEY) => sign(String(Math.floor(NOW / 1000)), 'tok', key);

const body = (over: Record<string, unknown> = {}, sig: unknown = freshSig()) => ({
  signature: sig,
  'event-data': {
    event: 'failed',
    severity: 'permanent',
    'delivery-status': { message: '550 5.1.1 mailbox unavailable' },
    message: { headers: { 'message-id': 'abc@mg.thetribe.at' } },
    'user-variables': { organizerId: 'org1' },
    ...over,
  },
});

describe('verifyMailgunSignature', () => {
  it('accepts a correct, fresh signature', () => {
    expect(verifyMailgunSignature(freshSig(), KEY, NOW)).toEqual({ valid: true });
  });
  it('rejects wrong key, tampering, replay, missing parts and a missing key', () => {
    expect(verifyMailgunSignature(freshSig('other'), KEY, NOW)).toMatchObject({ valid: false });
    expect(verifyMailgunSignature({ ...freshSig(), token: 'x' }, KEY, NOW)).toMatchObject({
      valid: false,
    });
    const old = sign(String(Math.floor(NOW / 1000) - 3600));
    expect(verifyMailgunSignature(old, KEY, NOW)).toEqual({
      valid: false,
      reason: 'stale-timestamp',
    });
    expect(verifyMailgunSignature({ timestamp: '1' }, KEY, NOW)).toMatchObject({ valid: false });
    expect(verifyMailgunSignature(null, KEY, NOW)).toMatchObject({ valid: false });
    expect(verifyMailgunSignature(freshSig(), '', NOW)).toEqual({
      valid: false,
      reason: 'no-signing-key',
    });
    expect(verifyMailgunSignature({ ...freshSig(), signature: 'zz' }, KEY, NOW)).toMatchObject({
      valid: false,
    });
  });
});

describe('parseDeliveryEvent', () => {
  it('maps delivered, hard bounce and complaint; ignores the rest', () => {
    expect(parseDeliveryEvent(body())).toEqual({
      state: 'bounced',
      organizerId: 'org1',
      messageId: 'abc@mg.thetribe.at',
      reason: '550 5.1.1 mailbox unavailable',
    });
    expect(parseDeliveryEvent(body({ event: 'delivered', severity: undefined }))?.state).toBe(
      'delivered'
    );
    expect(parseDeliveryEvent(body({ event: 'complained' }))?.state).toBe('complained');
    expect(parseDeliveryEvent(body({ severity: 'temporary' }))).toBeNull();
    expect(parseDeliveryEvent(body({ event: 'opened' }))).toBeNull();
    expect(parseDeliveryEvent(body({ 'user-variables': {} }))).toBeNull();
    expect(parseDeliveryEvent(body({ 'user-variables': { organizerId: '../x' } }))).toBeNull();
    expect(parseDeliveryEvent(null)).toBeNull();
    expect(stripMessageId('<a@b>')).toBe('a@b');
  });
});

const outreach = (over: Record<string, unknown> = {}) => ({
  messageId: '<abc@mg.thetribe.at>',
  test: false,
  ...over,
});
const organizer = { contactEmail: 'Info@Yoga.at', website: 'https://www.yoga.at/start' };
const ev = (state: 'delivered' | 'bounced' | 'complained') => ({
  state,
  organizerId: 'org1',
  messageId: 'abc@mg.thetribe.at',
  reason: 'r',
});

describe('planDelivery', () => {
  it('delivered: log and count only', () => {
    const p = planDelivery(ev('delivered'), outreach(), organizer, NOW)!;
    expect(p.outreachPatch).toMatchObject({ delivery: 'delivered' });
    expect(p.statsDelta).toEqual({ delivered: 1 });
    expect(p.blocklist).toEqual([]);
  });
  it('bounce blocks the address only', () => {
    const p = planDelivery(ev('bounced'), outreach(), organizer, NOW)!;
    expect(p.blocklist).toEqual([{ id: blocklistId('info@yoga.at'), kind: 'email' }]);
    expect(p.statsDelta).toEqual({ bounced: 1 });
    expect(p.outreachPatch).toMatchObject({ delivery: 'bounced', deliveryReason: 'r' });
  });
  it('complaint blocks address and domain', () => {
    const p = planDelivery(ev('complained'), outreach(), organizer, NOW)!;
    expect(p.blocklist.map((b) => b.kind)).toEqual(['email', 'domain']);
    expect(p.blocklist[1].id).toBe(blocklistId('yoga.at'));
  });
  it('a test mail is logged but never counted or blocked', () => {
    const p = planDelivery(ev('bounced'), outreach({ test: true }), organizer, NOW)!;
    expect(p.outreachPatch).toMatchObject({ delivery: 'bounced' });
    expect(p.statsDelta).toEqual({});
    expect(p.blocklist).toEqual([]);
  });
  it('only moves up, ignores other messages, no outreach doc', () => {
    expect(
      planDelivery(ev('delivered'), outreach({ delivery: 'bounced' }), organizer, NOW)
    ).toBeNull();
    expect(
      planDelivery(ev('bounced'), outreach({ delivery: 'bounced' }), organizer, NOW)
    ).toBeNull();
    expect(
      planDelivery({ ...ev('bounced'), messageId: 'older@mg' }, outreach(), organizer, NOW)
    ).toBeNull();
    expect(planDelivery(ev('bounced'), null, organizer, NOW)).toBeNull();
    // delivered -> complained moves the count
    const up = planDelivery(ev('complained'), outreach({ delivery: 'delivered' }), organizer, NOW)!;
    expect(up.statsDelta).toEqual({ delivered: -1, complained: 1 });
  });
});

describe('pause policy', () => {
  const s = (over: Partial<OutreachStats>): OutreachStats => ({ ...EMPTY_STATS, ...over });
  it('a complaint pauses at once', () => {
    expect(pauseReason(s({ sent: 3, complained: 1 }))).toMatch(/Spam-Beschwerde/);
  });
  it('bounce rate counts only from the minimum sample and above the limit', () => {
    expect(pauseReason(s({ sent: 3, bounced: 2 }))).toBeNull();
    expect(pauseReason(s({ sent: MIN_SAMPLE_FOR_RATE, bounced: 0 }))).toBeNull();
    expect(pauseReason(s({ sent: 100, bounced: 5 }))).toBeNull(); // exactly the limit
    expect(pauseReason(s({ sent: 100, bounced: 6 }))).toMatch(/nicht zugestellte/);
    expect(badRate(s({ sent: 100, bounced: 3, complained: 0 }))).toBeLessThanOrEqual(MAX_BAD_RATE);
    expect(badRate(EMPTY_STATS)).toBe(0);
  });
  it('applyStatsDelta never goes below zero', () => {
    expect(applyStatsDelta(s({ delivered: 0 }), { delivered: -1 }).delivered).toBe(0);
  });
});

function makeDeps(over: { outreach?: Record<string, unknown> | null; stats?: OutreachStats } = {}) {
  const calls = {
    outreachPatches: [] as Array<Record<string, unknown>>,
    blocklist: [] as Array<{ entries: unknown; reason: string }>,
    paused: [] as string[],
  };
  let stats = over.stats ?? EMPTY_STATS;
  const deps: DeliveryDeps = {
    now: () => NOW,
    signingKey: KEY,
    getOutreach: async () => (over.outreach === undefined ? outreach() : over.outreach),
    getOrganizer: async () => organizer,
    updateOutreach: async (_id, patch) => void calls.outreachPatches.push(patch),
    addBlocklist: async (entries, reason) => void calls.blocklist.push({ entries, reason }),
    bumpStats: async (delta) => (stats = applyStatsDelta(stats, delta)),
    pauseSending: async (reason) => void calls.paused.push(reason),
    log: () => {},
  };
  return { deps, calls };
}

describe('handleDeliveryWebhook', () => {
  it('401 for a bad signature, nothing written', async () => {
    const { deps, calls } = makeDeps();
    const res = await handleDeliveryWebhook(body({}, freshSig('wrong')), deps);
    expect(res.status).toBe(401);
    expect(calls.outreachPatches).toHaveLength(0);
  });
  it('200 and ignored for events we do not use', async () => {
    const { deps, calls } = makeDeps();
    const res = await handleDeliveryWebhook(body({ event: 'opened' }), deps);
    expect(res).toEqual({ status: 200, body: { ignored: true } });
    expect(calls.outreachPatches).toHaveLength(0);
  });
  it('a bounce is logged and blocklisted', async () => {
    const { deps, calls } = makeDeps({ stats: { ...EMPTY_STATS, sent: 50 } });
    const res = await handleDeliveryWebhook(body(), deps);
    expect(res).toEqual({ status: 200, body: { applied: 'bounced', paused: false } });
    expect(calls.outreachPatches[0]).toMatchObject({ delivery: 'bounced' });
    expect(calls.blocklist).toHaveLength(1);
    expect(calls.blocklist[0].reason).toBe('bounce');
    expect(calls.paused).toHaveLength(0);
  });
  it('a complaint pauses the sending', async () => {
    const { deps, calls } = makeDeps({ stats: { ...EMPTY_STATS, sent: 20 } });
    const res = await handleDeliveryWebhook(body({ event: 'complained' }), deps);
    expect(res.body).toMatchObject({ applied: 'complained', paused: true });
    expect(calls.paused[0]).toMatch(/Spam-Beschwerde/);
  });
  it('the same event twice changes nothing the second time', async () => {
    const { deps, calls } = makeDeps({ outreach: outreach({ delivery: 'bounced' }) });
    expect((await handleDeliveryWebhook(body(), deps)).body).toEqual({ ignored: true });
    expect(calls.outreachPatches).toHaveLength(0);
  });
});
