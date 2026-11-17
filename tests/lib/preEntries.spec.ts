import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  PRE_ENTRY_DEFAULTS,
  PRE_ENTRY_LIMITS,
  buildClaimEventPatch,
  buildHandOverEventPatch,
  dailyActionFor,
  hashPreEntryToken,
  normalizeContact,
  parsePreEntrySettings,
  staffMayUsePreEntries,
  tokenState,
  type PreEntryRecord,
  type TokenRecord,
} from '../../functions/src/preEntriesLogic';
import {
  descriptionExcerpt,
  preEntriesDailyHandler,
  preEntryAdminHandler,
  preEntryOrganizerHandler,
  type PreEntryDeps,
  type PreEntryTx,
  type UserInfo,
} from '../../functions/src/preEntries';
import * as serverSystem from '../../functions/src/systemAccount';
import * as clientSystem from '../../src/utils/systemAccount';
import * as client from '../../src/utils/preEntries';
import { decideEventStatusNotification } from '../../functions/src/notificationRouting';
import { annotateOnlineRegionIds } from '../../functions/src/onlineEventEligibility';
import type { EmailPayload } from '../../functions/src/emailTemplates';
import { isReservedUsername } from '../../src/utils/username';

type Doc = Record<string, unknown>;

const NOW = Date.UTC(2026, 10, 17, 10, 0, 0);
const SYSTEM_UID = serverSystem.SYSTEM_UID;

// In-memory events + pre_entries + tokens + roles. Transactions buffer their
// writes and apply them only if the callback succeeds, like Firestore.
function makeWorld({
  mode = 'all',
  roles = {
    admin: { role: 'Admin' },
    mod: { role: 'RegionModerator', regionIds: ['vorarlberg'] },
    modTirol: { role: 'RegionModerator', regionIds: ['tirol'] },
  } as Record<string, Doc>,
  events = {} as Record<string, Doc>,
  settings = {} as Doc,
} = {}) {
  const eventDocs = new Map<string, Doc>(Object.entries(events));
  const entries = new Map<string, PreEntryRecord>();
  const tokens = new Map<string, TokenRecord>();
  const mails: EmailPayload[] = [];
  const users: Record<string, UserInfo> = {
    admin: { uid: 'admin', email: 'admin@example.test', displayName: 'Ada' },
    mod: { uid: 'mod', email: 'mod@example.test', displayName: 'Mo' },
    modTirol: { uid: 'modTirol', email: 'tirol@example.test', displayName: 'Ti' },
    organizer: { uid: 'organizer', email: 'orga@example.test', displayName: 'Orga Nisa' },
  };
  let now = NOW;
  let counter = 0;
  const deps: PreEntryDeps = {
    readRoleDoc: async (uid) => roles[uid] ?? null,
    now: () => now,
    generateToken: () => `${String(++counter).padStart(3, '0')}${'t'.repeat(40)}`,
    baseUrl: 'https://example.test',
    getSettings: async () => parsePreEntrySettings({ mode, ...settings }),
    async runTransaction<T>(fn: (tx: PreEntryTx) => Promise<T>): Promise<T> {
      const pending: Array<() => void> = [];
      const tx: PreEntryTx = {
        getEntry: async (id) => (entries.has(id) ? structuredClone(entries.get(id)!) : null),
        getEvent: async (id) => (eventDocs.has(id) ? { ...eventDocs.get(id)! } : null),
        getToken: async (id) => (tokens.has(id) ? { ...tokens.get(id)! } : null),
        setEntry: (e) => pending.push(() => entries.set(e.eventId, structuredClone(e))),
        deleteEntry: (id) => pending.push(() => entries.delete(id)),
        updateEvent: (id, patch) =>
          pending.push(() => eventDocs.set(id, { ...eventDocs.get(id)!, ...patch })),
        deleteEvent: (id) => pending.push(() => eventDocs.delete(id)),
        setToken: (id, t) => pending.push(() => tokens.set(id, { ...t })),
        updateToken: (id, patch) =>
          pending.push(() => tokens.set(id, { ...tokens.get(id)!, ...patch })),
        deleteToken: (id) => pending.push(() => tokens.delete(id)),
      };
      const result = await fn(tx);
      pending.forEach((w) => w());
      return result;
    },
    listEntries: async () => [...entries.values()].map((e) => structuredClone(e)),
    listTokenIds: async (eventId) =>
      [...tokens.entries()].filter(([, t]) => t.eventId === eventId).map(([id]) => id),
    getEvents: async (ids) => Object.fromEntries(ids.map((id) => [id, eventDocs.get(id) ?? null])),
    getUser: async (uid) => users[uid] ?? null,
    sendMail: async (payload) => {
      mails.push(payload);
    },
    enforceRateLimit: () => undefined,
  };
  const call = (uid: string | null, data: Doc) =>
    preEntryAdminHandler({ auth: uid ? { uid } : null, data }, deps);
  const organizer = (data: Doc, uid: string | null = null) =>
    preEntryOrganizerHandler({ auth: uid ? { uid } : null, data }, deps);
  return {
    deps,
    eventDocs,
    entries,
    tokens,
    mails,
    call,
    organizer,
    setNow: (ms: number) => {
      now = ms;
    },
  };
}

const draftOf = (owner: string, regionId = 'vorarlberg'): Doc => ({
  title: 'Klangreise im Wald',
  description: '<p>Eine <b>Reise</b> mit Klangschalen.</p>',
  date: '2026-12-05',
  time: '18:00',
  status: 'draft',
  createdBy: owner,
  regionId,
  slug: 'klangreise-im-wald-20261205',
  organizer: { name: 'Studio Klang', email: 'mod@example.test', photoURL: 'https://x/p.jpg' },
  instagramConsent: true,
});

const CONTACT = { contactPerson: 'Lena', email: 'Lena@Studio.example', phone: '0664 1234567' };

const tokenFromUrl = (url: string) => decodeURIComponent(url.split('/vorschau/')[1]);

async function created(world = makeWorld({ events: { ev1: draftOf('mod') } })) {
  const result = (await world.call('mod', {
    action: 'create',
    eventId: 'ev1',
    contact: CONTACT,
  })) as {
    previewUrl: string;
  };
  return { world, token: tokenFromUrl(result.previewUrl), result };
}

describe('pre-entry settings and flag', () => {
  it('server and client agree on defaults, limits and the system account', () => {
    expect(client.PRE_ENTRY_DEFAULTS).toEqual(PRE_ENTRY_DEFAULTS);
    expect(client.PRE_ENTRY_LIMITS).toEqual(PRE_ENTRY_LIMITS);
    expect(clientSystem.SYSTEM_UID).toBe(serverSystem.SYSTEM_UID);
    expect(clientSystem.SYSTEM_USERNAME).toBe(serverSystem.SYSTEM_USERNAME);
    expect(clientSystem.SYSTEM_DISPLAY_NAME).toBe(serverSystem.SYSTEM_DISPLAY_NAME);
  });

  it('a missing doc means off with the defaults; values out of range fall back', () => {
    expect(parsePreEntrySettings(null)).toEqual({ mode: 'off', ...PRE_ENTRY_DEFAULTS });
    expect(parsePreEntrySettings({ mode: 'all', validDays: 0, reminderDays: 7 })).toMatchObject({
      mode: 'all',
      validDays: 14,
      reminderDays: 7,
    });
    expect(parsePreEntrySettings({ mode: 'everyone' }).mode).toBe('off');
  });

  it('admins = Super-Admins only, all = every staff member, off = nobody', () => {
    expect(staffMayUsePreEntries('off', 'superAdmin')).toBe(false);
    expect(staffMayUsePreEntries('admins', 'superAdmin')).toBe(true);
    expect(staffMayUsePreEntries('admins', 'regionModerator')).toBe(false);
    expect(staffMayUsePreEntries('all', 'regionModerator')).toBe(true);
    expect(staffMayUsePreEntries('all', null)).toBe(false);
    const mod = { isStaff: true, isSuperAdmin: false };
    expect(client.canUsePreEntries('admins', mod)).toBe(false);
    expect(client.canUsePreEntries('all', mod)).toBe(true);
    expect(client.canUsePreEntries('all', { isStaff: false })).toBe(false);
  });

  it('the server refuses staff actions while the flag does not allow them', async () => {
    const world = makeWorld({ mode: 'admins', events: { ev1: draftOf('mod') } });
    await expect(
      world.call('mod', { action: 'create', eventId: 'ev1', contact: CONTACT })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(world.call('organizer', { action: 'list' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    const off = makeWorld({ mode: 'off' });
    // Super-Admins may still list and delete (clean-up) while it is off.
    await expect(off.call('admin', { action: 'list' })).resolves.toMatchObject({ rows: [] });
  });

  it('with the flag off every link shows as gone', async () => {
    const { world, token } = await created();
    world.deps.getSettings = async () => parsePreEntrySettings({ mode: 'off' });
    await expect(world.organizer({ action: 'view', token })).resolves.toMatchObject({
      state: 'gone',
    });
  });
});

describe('creating a pre-entry', () => {
  it('hands the moderator draft to "Dein Tribe": no contact data, no e-mail, no Instagram', async () => {
    const { world, result } = await created();
    const event = world.eventDocs.get('ev1')!;
    expect(event.createdBy).toBe(SYSTEM_UID);
    expect(event.preEntry).toBe(true);
    expect(event.instagramConsent).toBe(false);
    expect(event.organizer).toEqual({ name: 'Studio Klang', email: '' });
    expect(JSON.stringify(event)).not.toContain('Lena');
    const entry = world.entries.get('ev1')!;
    expect(entry.contact).toMatchObject({
      name: 'Studio Klang',
      contactPerson: 'Lena',
      email: 'lena@studio.example',
    });
    expect(entry.createdBy).toBe('mod');
    expect(entry.createdByName).toBe('Mo');
    expect(entry.expiresAtMs).toBe(NOW + 14 * DAY_MS);
    expect(entry.log.map((l) => l.type)).toEqual(['created']);
    // Only the hash of the token is stored; the URL carries neither id nor slug.
    const token = tokenFromUrl(result.previewUrl);
    expect(token).toHaveLength(43);
    expect(world.tokens.has(hashPreEntryToken(token))).toBe(true);
    expect(result.previewUrl).not.toContain('ev1');
    expect(result.previewUrl).not.toContain('klangreise');
  });

  it('only the own draft, only in the own region, only once', async () => {
    const world = makeWorld({
      events: {
        ev1: draftOf('admin'),
        ev2: draftOf('modTirol', 'tirol'),
        ev3: { ...draftOf('mod'), status: 'pending' },
      },
    });
    await expect(
      world.call('mod', { action: 'create', eventId: 'ev1', contact: CONTACT })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(
      world.call('modTirol', { action: 'create', eventId: 'ev2', contact: CONTACT })
    ).resolves.toBeTruthy();
    await expect(
      world.call('mod', { action: 'create', eventId: 'ev3', contact: CONTACT })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const other = makeWorld({ events: { ev1: draftOf('mod', 'tirol') } });
    await expect(
      other.call('mod', { action: 'create', eventId: 'ev1', contact: CONTACT })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const { world: again } = await created();
    await expect(
      again
        .call('admin', { action: 'list' })
        .then(() => again.call('mod', { action: 'create', eventId: 'ev1', contact: CONTACT }))
    ).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('needs one way to reach the organizer and checks the formats', () => {
    expect(() => normalizeContact({ contactPerson: 'Lena' })).toThrow(/At least one/);
    expect(() => normalizeContact({ email: 'kein-mail' })).toThrow(/email/);
    expect(() => normalizeContact({ phone: 'abc' })).toThrow(/phone/);
    expect(normalizeContact({ other: '@studio.klang' }).other).toBe('@studio.klang');
    expect(client.validateContact({ contactPerson: 'Lena' })).toHaveProperty('contact');
    expect(client.validateContact({ email: 'x@y.at' })).toEqual({});
  });

  it('a moderator of another region neither sees nor changes the entry', async () => {
    const { world } = await created();
    const list = (await world.call('modTirol', { action: 'list' })) as { rows: unknown[] };
    expect(list.rows).toHaveLength(0);
    await expect(
      world.call('modTirol', { action: 'extend', eventId: 'ev1' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const adminList = (await world.call('admin', { action: 'list' })) as {
      rows: Array<{ event: { title: string; excerpt: string } }>;
    };
    expect(adminList.rows[0].event.title).toBe('Klangreise im Wald');
    expect(adminList.rows[0].event.excerpt).toBe('Eine Reise mit Klangschalen.');
  });
});

describe('token check and expiry', () => {
  const entry = (over: Partial<PreEntryRecord> = {}) =>
    ({
      status: 'contacted',
      expiresAtMs: NOW + DAY_MS,
      linksRevokedAtMs: null,
      ...over,
    }) as PreEntryRecord;
  const token = (over: Partial<TokenRecord> = {}): TokenRecord => ({
    eventId: 'ev1',
    kind: 'preview',
    createdAtMs: NOW - DAY_MS,
    createdBy: 'mod',
    ...over,
  });

  it('open until the expiry, then expired; revoked links stay dead, newer ones work', () => {
    expect(tokenState(entry(), token(), NOW)).toBe('open');
    expect(tokenState(entry({ expiresAtMs: NOW }), token(), NOW)).toBe('expired');
    expect(tokenState(entry({ linksRevokedAtMs: NOW - 10 }), token(), NOW)).toBe('revoked');
    expect(
      tokenState(entry({ linksRevokedAtMs: NOW - 10 }), token({ createdAtMs: NOW }), NOW)
    ).toBe('open');
  });

  it('a takeover link works once and does not expire with the preview', () => {
    const published = entry({ status: 'published', expiresAtMs: NOW - DAY_MS });
    expect(tokenState(published, token({ kind: 'takeover' }), NOW)).toBe('published');
    expect(tokenState(published, token({ kind: 'takeover', usedAtMs: NOW }), NOW)).toBe('used');
    expect(tokenState(entry({ status: 'claimed' }), token(), NOW)).toBe('claimed');
  });

  it('the preview page gets the event, the expiry and the first view is logged once', async () => {
    const { world, token } = await created();
    world.setNow(NOW + 9 * DAY_MS + 1);
    const view = (await world.organizer({ action: 'view', token })) as Record<string, unknown>;
    expect(view).toMatchObject({ state: 'open', daysLeft: 5, canPublish: true, canClaim: true });
    expect((view.event as Doc).title).toBe('Klangreise im Wald');
    expect((view.event as Doc).organizerName).toBe('Studio Klang');
    expect(view.event).not.toHaveProperty('createdBy');
    await world.organizer({ action: 'view', token });
    const entry = world.entries.get('ev1')!;
    expect(entry.viewCount).toBe(2);
    expect(entry.log.filter((l) => l.type === 'viewed')).toHaveLength(1);
    expect(world.mails.map((m) => m.to)).toEqual(['mod@example.test']);
  });

  it('after the expiry the page shows no event; a renewed link starts a new period', async () => {
    const { world, token } = await created();
    world.setNow(NOW + 15 * DAY_MS);
    await expect(world.organizer({ action: 'view', token })).resolves.toMatchObject({
      state: 'expired',
      event: null,
      canPublish: false,
    });
    const issued = (await world.call('mod', { action: 'issueLink', eventId: 'ev1' })) as {
      url: string;
      expiresAtMs: number;
    };
    expect(issued.expiresAtMs).toBe(NOW + 29 * DAY_MS);
    // The old link works again too: all preview links share the entry's expiry.
    await expect(world.organizer({ action: 'view', token })).resolves.toMatchObject({
      state: 'open',
    });
  });

  it('revoking kills every link issued so far', async () => {
    const { world, token } = await created();
    world.setNow(NOW + 1000);
    await world.call('mod', { action: 'revoke', eventId: 'ev1' });
    await expect(world.organizer({ action: 'view', token })).resolves.toMatchObject({
      state: 'revoked',
    });
    world.setNow(NOW + 2000);
    const fresh = (await world.call('mod', { action: 'issueLink', eventId: 'ev1' })) as {
      url: string;
    };
    await expect(
      world.organizer({ action: 'view', token: tokenFromUrl(fresh.url) })
    ).resolves.toMatchObject({
      state: 'open',
    });
  });

  it('a malformed or unknown token is refused / gone', async () => {
    const { world } = await created();
    await expect(world.organizer({ action: 'view', token: 'kurz' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(world.organizer({ action: 'view', token: 'x'.repeat(43) })).resolves.toMatchObject(
      {
        state: 'gone',
      }
    );
  });
});

describe('organizer actions', () => {
  it('publish without a profile: live under "Dein Tribe" at once, with a one-time takeover link', async () => {
    const { world, token } = await created();
    await expect(world.organizer({ action: 'publish', token })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    const res = (await world.organizer({ action: 'publish', token, rightsConfirmed: true })) as {
      publicUrl: string;
      takeoverUrl: string;
    };
    expect(res.publicUrl).toBe('https://example.test/event/klangreise-im-wald-20261205');
    const event = world.eventDocs.get('ev1')!;
    expect(event).toMatchObject({ status: 'approved', createdBy: SYSTEM_UID, approvedBy: 'mod' });
    expect(world.entries.get('ev1')!.status).toBe('published');
    // The preview link cannot publish twice; the takeover link takes it over once.
    await expect(
      world.organizer({ action: 'publish', token, rightsConfirmed: true })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const takeover = tokenFromUrl(res.takeoverUrl);
    await expect(world.organizer({ action: 'claim', token: takeover })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await world.organizer({ action: 'claim', token: takeover }, 'organizer');
    expect(world.eventDocs.get('ev1')).toMatchObject({
      createdBy: 'organizer',
      preEntry: false,
      status: 'approved',
      slug: 'klangreise-im-wald-20261205',
    });
    await expect(world.organizer({ action: 'view', token: takeover })).resolves.toMatchObject({
      state: 'claimed',
      canClaim: false,
    });
    expect(world.mails.map((m) => m.subject)).toEqual([
      'Vorab-Eintrag veröffentlicht: Klangreise im Wald',
      'Vorab-Eintrag übernommen: Klangreise im Wald',
    ]);
  });

  it('reject with a comment closes the links and tells the moderator', async () => {
    const { world, token } = await created();
    await world.organizer({ action: 'reject', token, comment: 'Bitte nicht veröffentlichen' });
    const entry = world.entries.get('ev1')!;
    expect(entry).toMatchObject({
      status: 'rejected',
      organizerComment: 'Bitte nicht veröffentlichen',
    });
    expect(world.eventDocs.get('ev1')!.status).toBe('draft');
    expect(world.mails[0].text).toContain('Bitte nicht veröffentlichen');
    await expect(world.organizer({ action: 'view', token })).resolves.toMatchObject({
      state: 'rejected',
      canPublish: false,
    });
  });

  it('claim before publishing: the draft becomes the organizer’s, slug and name stay', async () => {
    const { world, token } = await created();
    const res = await world.organizer({ action: 'claim', token }, 'organizer');
    expect(res).toMatchObject({ eventId: 'ev1', eventStatus: 'draft' });
    const event = world.eventDocs.get('ev1')!;
    expect(event).toMatchObject({
      createdBy: 'organizer',
      status: 'draft',
      slug: 'klangreise-im-wald-20261205',
      organizer: { name: 'Studio Klang', email: 'orga@example.test' },
    });
    const log = world.entries.get('ev1')!.log;
    expect(log.find((l) => l.type === 'owner_changed')?.detail).toBe(`${SYSTEM_UID} -> organizer`);
  });

  it('claim and publish in one step needs the rights confirmation', async () => {
    const { world, token } = await created();
    await expect(
      world.organizer({ action: 'claim', token, publish: true }, 'organizer')
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await world.organizer(
      { action: 'claim', token, publish: true, rightsConfirmed: true },
      'organizer'
    );
    expect(world.eventDocs.get('ev1')).toMatchObject({
      createdBy: 'organizer',
      status: 'approved',
    });
  });

  it('owner-change patch as pure logic', () => {
    const event = { organizer: { name: 'Studio', email: '' }, slug: 's' };
    expect(
      buildClaimEventPatch(event, { uid: 'u1', email: 'a@b.at', photoURL: 'p' })
    ).toMatchObject({
      createdBy: 'u1',
      preEntry: false,
      organizer: { name: 'Studio', email: 'a@b.at', photoURL: 'p' },
    });
    expect(buildClaimEventPatch(event, { uid: 'u1', email: 'a@b.at' })).not.toHaveProperty('slug');
    expect(
      buildHandOverEventPatch({ organizer: { name: 'S', email: 'm@x', photoURL: 'p' } })
    ).toMatchObject({ createdBy: SYSTEM_UID, organizer: { name: 'S', email: '' } });
  });
});

describe('moderator actions', () => {
  it('contact log: channel, template, moderator; draft becomes contacted', async () => {
    const { world } = await created();
    await world.call('mod', {
      action: 'logContact',
      eventId: 'ev1',
      channel: 'whatsapp',
      template: 'initial',
    });
    await world.call('mod', {
      action: 'sendEmail',
      eventId: 'ev1',
      subject: 'Hallo',
      text: 'Hallo Lena, https://example.test/vorschau/x',
      template: 'reminder',
    });
    const entry = world.entries.get('ev1')!;
    expect(entry.status).toBe('contacted');
    expect(entry.contactAttempts.map((a) => [a.channel, a.template, a.by])).toEqual([
      ['whatsapp', 'initial', 'mod'],
      ['email', 'reminder', 'mod'],
    ]);
    expect(world.mails.at(-1)!.to).toBe('lena@studio.example');
    expect(world.mails.at(-1)!.html).toContain('<a href="https://example.test/vorschau/x"');
  });

  it('publish after an agreement outside the system; delete also removes the system-owned event', async () => {
    const { world } = await created();
    await world.call('mod', { action: 'publish', eventId: 'ev1' });
    expect(world.eventDocs.get('ev1')).toMatchObject({ status: 'approved', approvedBy: 'mod' });
    const res = await world.call('mod', { action: 'delete', eventId: 'ev1' });
    expect(res).toEqual({ ok: true, eventDeleted: true });
    expect(world.entries.size).toBe(0);
    expect(world.tokens.size).toBe(0);
    expect(world.eventDocs.has('ev1')).toBe(false);
  });

  it('delete after a takeover removes the contact data but never the organizer’s event', async () => {
    const { world, token } = await created();
    await world.organizer({ action: 'claim', token }, 'organizer');
    await expect(world.call('mod', { action: 'delete', eventId: 'ev1' })).resolves.toEqual({
      ok: true,
      eventDeleted: false,
    });
    expect(world.eventDocs.get('ev1')!.createdBy).toBe('organizer');
    expect(world.entries.size).toBe(0);
  });

  it('check-out for editing and check-in back to "Dein Tribe"', async () => {
    const { world } = await created();
    await world.call('mod', { action: 'checkout', eventId: 'ev1' });
    expect(world.eventDocs.get('ev1')!.createdBy).toBe('mod');
    await world.call('mod', { action: 'checkin', eventId: 'ev1' });
    expect(world.eventDocs.get('ev1')).toMatchObject({ createdBy: SYSTEM_UID, status: 'draft' });
    expect(world.entries.get('ev1')!.log.map((l) => l.type)).toEqual([
      'created',
      'checked_out',
      'checked_in',
    ]);
  });
});

describe('daily job', () => {
  it('logs the expiry once and deletes expired entries after autoDeleteDays', async () => {
    const { world } = await created();
    world.setNow(NOW + 15 * DAY_MS);
    await expect(preEntriesDailyHandler(world.deps)).resolves.toEqual({
      markedExpired: 1,
      deleted: 0,
    });
    await expect(preEntriesDailyHandler(world.deps)).resolves.toEqual({
      markedExpired: 0,
      deleted: 0,
    });
    world.setNow(NOW + 45 * DAY_MS);
    await expect(preEntriesDailyHandler(world.deps)).resolves.toEqual({
      markedExpired: 0,
      deleted: 1,
    });
    expect(world.eventDocs.has('ev1')).toBe(false);
    expect(world.tokens.size).toBe(0);
  });

  it('never deletes with autoDeleteDays 0, nor published or taken-over entries', () => {
    const base = {
      status: 'contacted',
      expiresAtMs: NOW - 100 * DAY_MS,
      expiredLoggedAtMs: NOW,
      rejectedAtMs: null,
    } as PreEntryRecord;
    expect(dailyActionFor(base, { autoDeleteDays: 0 }, NOW)).toBe('none');
    expect(dailyActionFor(base, { autoDeleteDays: 30 }, NOW)).toBe('delete');
    expect(dailyActionFor({ ...base, status: 'published' }, { autoDeleteDays: 30 }, NOW)).toBe(
      'none'
    );
    expect(dailyActionFor({ ...base, status: 'claimed' }, { autoDeleteDays: 30 }, NOW)).toBe(
      'none'
    );
    expect(
      dailyActionFor(
        { ...base, status: 'rejected', rejectedAtMs: NOW - 31 * DAY_MS },
        { autoDeleteDays: 30 },
        NOW
      )
    ).toBe('delete');
  });
});

describe('system account exceptions', () => {
  it('no owner mails for events of "Dein Tribe"', () => {
    const before = {
      status: 'draft' as const,
      createdBy: SYSTEM_UID,
      organizer: { email: 'x@y.at' },
    };
    const after = { ...before, status: 'approved' as const };
    expect(decideEventStatusNotification('ev1', before, after, 'T', 's')).toBeNull();
    expect(
      decideEventStatusNotification(
        'ev1',
        { ...before, createdBy: 'u' },
        { ...after, createdBy: 'u' },
        'T',
        's'
      )
    ).not.toBeNull();
  });

  it('online events of "Dein Tribe" count as staff events', () => {
    const regions = [
      { id: 'vorarlberg', active: true, bezirke: ['Bregenz'] },
      { id: 'tirol', active: true, bezirke: ['Innsbruck'] },
    ];
    const [ev] = annotateOnlineRegionIds([{ isOnline: true, createdBy: SYSTEM_UID }], { regions });
    expect(ev).not.toHaveProperty('onlineRegionIds');
  });

  it('the username "dein-tribe" and the route "vorschau" are reserved', () => {
    expect(isReservedUsername('dein-tribe')).toBe(true);
    expect(isReservedUsername('vorschau')).toBe(true);
  });

  it('description excerpt for {event_kurzbeschreibung}', () => {
    expect(descriptionExcerpt('<p>a&amp;b</p>')).toBe('a&b');
    expect(descriptionExcerpt(`<p>${'wort '.repeat(60)}</p>`).length).toBeLessThanOrEqual(152);
  });
});
