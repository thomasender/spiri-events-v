import { describe, it, expect } from 'vitest';
import {
  INVITE_VALID_MS,
  ONBOARDING_TEXT_VERSION,
  REQUIRED_CONSENTS,
  acceptModeratorInviteHandler,
  createModeratorInviteHandler,
  generateInviteToken,
  getModeratorInviteHandler,
  hashInviteToken,
  inviteBaseUrl,
  listModeratorInvitesHandler,
  revokeModeratorInviteHandler,
  type InviteDeps,
  type InviteRecord,
  type InviteTransaction,
} from '../../functions/src/moderatorInvites';
import type { AuditEntry, TargetUser } from '../../functions/src/adminModerators';
import type { EmailPayload } from '../../functions/src/emailTemplates';
import {
  MODERATOR_ONBOARDING_CONSENTS,
  MODERATOR_ONBOARDING_TEXT_VERSION,
  inviteErrorMessage,
  moderatorOnboardingSteps,
  tribeNames,
} from '../../src/utils/moderatorOnboardingText';

type Doc = Record<string, unknown>;

const NOW = Date.UTC(2026, 9, 31, 10, 0, 0);
const TOKEN = 'A'.repeat(43);
const TOKEN_ID = hashInviteToken(TOKEN);

// In-memory moderator_invites + admin_users + Auth. Transactions buffer their writes
// and apply them only if the callback succeeds, like Firestore.
function makeWorld({
  roles = {},
  users = {},
  invites = {},
  mailFails = false,
}: {
  roles?: Record<string, Doc>;
  users?: Record<string, Partial<TargetUser>>;
  invites?: Record<string, InviteRecord>;
  mailFails?: boolean;
} = {}) {
  const roleDocs = new Map<string, Doc>(Object.entries(roles));
  const authUsers = new Map<string, TargetUser>(
    Object.entries(users).map(([uid, u]) => [uid, { uid, ...u }])
  );
  const inviteDocs = new Map<string, InviteRecord>(Object.entries(invites));
  const audit: AuditEntry[] = [];
  const mails: EmailPayload[] = [];
  let now = NOW;
  let tokens = 0;
  const deps: InviteDeps = {
    readRoleDoc: async (uid) => roleDocs.get(uid) ?? null,
    now: () => now,
    generateToken: () => `${String(++tokens).padStart(2, '0')}${'x'.repeat(41)}`,
    baseUrl: 'https://example.test',
    createInvite: async (id, invite) => {
      inviteDocs.set(id, { ...invite });
    },
    getInvite: async (id) => inviteDocs.get(id) ?? null,
    listPendingInvites: async () =>
      [...inviteDocs.entries()]
        .filter(([, invite]) => invite.status === 'pending')
        .map(([id, invite]) => ({ id, invite })),
    revokeInvite: async (id) => {
      const invite = inviteDocs.get(id);
      if (invite) invite.status = 'revoked';
    },
    getUser: async (uid) => authUsers.get(uid) ?? null,
    getUserByEmail: async (email) =>
      [...authUsers.values()].find((u) => u.email?.toLowerCase() === email) ?? null,
    async runTransaction<T>(fn: (tx: InviteTransaction) => Promise<T>): Promise<T> {
      const pending: Array<() => void> = [];
      const tx: InviteTransaction = {
        getInvite: async (id) => inviteDocs.get(id) ?? null,
        getRoleDoc: async (uid) => roleDocs.get(uid) ?? null,
        setModerator: (uid, data) =>
          pending.push(() => roleDocs.set(uid, { role: 'RegionModerator', ...data })),
        markAccepted: (id, data) =>
          pending.push(() => {
            const invite = inviteDocs.get(id) as InviteRecord;
            Object.assign(invite, { status: 'accepted', acceptedAtMs: now, ...data });
          }),
        addAuditEntry: (entry) => pending.push(() => audit.push(entry)),
      };
      const result = await fn(tx);
      pending.forEach((w) => w());
      return result;
    },
    sendMail: async (payload) => {
      if (mailFails) throw new Error('mailgun down');
      mails.push(payload);
    },
    getSuperAdminEmails: async () => ['boss@tribe.at'],
    enforceRateLimit: () => {},
  };
  return {
    deps,
    roleDocs,
    inviteDocs,
    audit,
    mails,
    setNow: (ms: number) => {
      now = ms;
    },
  };
}

const ADMIN = { role: 'Admin' };
const call = (uid: string | null, data: unknown) => ({ auth: uid ? { uid } : null, data });

const pendingInvite = (over: Partial<InviteRecord> = {}): InviteRecord => ({
  email: 'neu@x.at',
  regionIds: ['tirol'],
  invitedBy: 'boss',
  createdAtMs: NOW - 1000,
  expiresAtMs: NOW + INVITE_VALID_MS,
  status: 'pending',
  ...over,
});

const acceptData = (over: Record<string, unknown> = {}) => ({
  token: TOKEN,
  consents: [...REQUIRED_CONSENTS],
  signatureName: '  Anna   Muster ',
  textVersion: ONBOARDING_TEXT_VERSION,
  ...over,
});

async function expectCode(promise: Promise<unknown>, code: string, message?: RegExp) {
  await expect(promise).rejects.toMatchObject({ code });
  if (message) await expect(promise).rejects.toThrow(message);
}

describe('invite tokens', () => {
  it('are 43 base64url characters and only their SHA-256 is the doc id', () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateInviteToken()).not.toBe(token);
    const id = hashInviteToken(token);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain(token);
    expect(hashInviteToken(token)).toBe(id);
  });

  it('point to the staging site only inside the staging project', () => {
    expect(inviteBaseUrl({ GCLOUD_PROJECT: 'tribe-vbg-staging' })).toBe(
      'https://tribe-vbg-staging.web.app'
    );
    expect(inviteBaseUrl({ GCLOUD_PROJECT: 'spirieventsvbg' })).toBe('https://www.thetribe.at');
  });
});

describe('adminCreateModeratorInvite', () => {
  it('Super-Admins only', async () => {
    const w = makeWorld({
      roles: { boss: ADMIN, mod: { role: 'RegionModerator', regionIds: ['tirol'] } },
    });
    const data = { email: 'neu@x.at', regionIds: ['tirol'] };
    await expectCode(createModeratorInviteHandler(call(null, data), w.deps), 'unauthenticated');
    await expectCode(createModeratorInviteHandler(call('mod', data), w.deps), 'permission-denied');
    expect(w.inviteDocs.size).toBe(0);
  });

  it('stores only the hash, lowercases the address and mails the region-specific link', async () => {
    const w = makeWorld({ roles: { boss: ADMIN } });
    const result = await createModeratorInviteHandler(
      call('boss', { email: ' Neu@X.at ', regionIds: ['wien', 'tirol'] }),
      w.deps
    );
    const token = new URL(result.inviteUrl).searchParams.get('t') as string;
    expect(result.inviteUrl).toMatch(/^https:\/\/example\.test\/einladung\?t=/);
    expect(result.inviteId).toBe(hashInviteToken(token));
    expect(result.emailSent).toBe(true);
    const stored = w.inviteDocs.get(result.inviteId) as InviteRecord;
    expect(stored).toMatchObject({
      email: 'neu@x.at',
      regionIds: ['tirol', 'wien'],
      invitedBy: 'boss',
      status: 'pending',
      expiresAtMs: NOW + 14 * 24 * 60 * 60 * 1000,
    });
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(w.mails).toHaveLength(1);
    expect(w.mails[0].to).toBe('neu@x.at');
    expect(w.mails[0].subject).toBe(
      'Einladung ins Moderations-Team vom Tribe Tirol und Tribe Wien'
    );
    expect(w.mails[0].html).toContain('Einladung annehmen');
    expect(w.mails[0].html).toContain(result.inviteUrl);
  });

  it('validates address and regions', async () => {
    const w = makeWorld({ roles: { boss: ADMIN } });
    for (const data of [
      { email: 'kein-at', regionIds: ['tirol'] },
      { email: 'neu@x.at', regionIds: [] },
      { email: 'neu@x.at', regionIds: ['mars'] },
      { email: 'neu@x.at', regionIds: ['tirol', 'tirol'] },
    ]) {
      await expectCode(
        createModeratorInviteHandler(call('boss', data), w.deps),
        'invalid-argument'
      );
    }
  });

  it('refuses Super-Admins and the caller as targets', async () => {
    const w = makeWorld({
      roles: { boss: ADMIN, other: ADMIN },
      users: {
        boss: { email: 'boss@tribe.at' },
        other: { email: 'other@tribe.at' },
        claim: { email: 'claim@tribe.at', customClaims: { role: 'Admin' } },
      },
    });
    for (const email of ['boss@tribe.at', 'other@tribe.at', 'claim@tribe.at']) {
      await expectCode(
        createModeratorInviteHandler(call('boss', { email, regionIds: ['tirol'] }), w.deps),
        'failed-precondition'
      );
    }
    expect(w.inviteDocs.size).toBe(0);
  });

  it('a new link revokes the open ones for the same address ("Erneut senden")', async () => {
    const w = makeWorld({ roles: { boss: ADMIN } });
    const first = await createModeratorInviteHandler(
      call('boss', { email: 'neu@x.at', regionIds: ['tirol'] }),
      w.deps
    );
    const other = await createModeratorInviteHandler(
      call('boss', { email: 'anders@x.at', regionIds: ['tirol'] }),
      w.deps
    );
    const second = await createModeratorInviteHandler(
      call('boss', { email: 'neu@x.at', regionIds: ['tirol'], sendEmail: false }),
      w.deps
    );
    expect(second.inviteId).not.toBe(first.inviteId);
    expect(w.inviteDocs.get(first.inviteId)?.status).toBe('revoked');
    expect(w.inviteDocs.get(other.inviteId)?.status).toBe('pending');
    expect(w.inviteDocs.get(second.inviteId)?.status).toBe('pending');
    expect(second.emailSent).toBe(false);
    expect(w.mails).toHaveLength(2);
  });

  it('keeps the invite when the mail fails, so the link can be copied', async () => {
    const w = makeWorld({ roles: { boss: ADMIN }, mailFails: true });
    const result = await createModeratorInviteHandler(
      call('boss', { email: 'neu@x.at', regionIds: ['tirol'] }),
      w.deps
    );
    expect(result.emailSent).toBe(false);
    expect(w.inviteDocs.get(result.inviteId)?.status).toBe('pending');
  });
});

describe('adminListModeratorInvites / adminRevokeModeratorInvite', () => {
  it('lists open invites newest first with an expired flag', async () => {
    const w = makeWorld({
      roles: { boss: ADMIN },
      invites: {
        a: pendingInvite({
          email: 'alt@x.at',
          createdAtMs: NOW - 20 * 86400000,
          expiresAtMs: NOW - 1,
        }),
        b: pendingInvite({ email: 'neu@x.at', createdAtMs: NOW - 1000 }),
        c: pendingInvite({ status: 'accepted' }),
      },
    });
    const { invites } = await listModeratorInvitesHandler(call('boss', {}), w.deps);
    expect(invites.map((i) => [i.inviteId, i.email, i.expired])).toEqual([
      ['b', 'neu@x.at', false],
      ['a', 'alt@x.at', true],
    ]);
    await expectCode(listModeratorInvitesHandler(call('nobody', {}), w.deps), 'permission-denied');
  });

  it('revokes an open invite once', async () => {
    const w = makeWorld({ roles: { boss: ADMIN }, invites: { [TOKEN_ID]: pendingInvite() } });
    expect(
      await revokeModeratorInviteHandler(call('boss', { inviteId: TOKEN_ID }), w.deps)
    ).toEqual({
      revoked: true,
    });
    expect(
      await revokeModeratorInviteHandler(call('boss', { inviteId: TOKEN_ID }), w.deps)
    ).toEqual({
      revoked: false,
    });
    await expectCode(
      revokeModeratorInviteHandler(call('boss', { inviteId: 'nope' }), w.deps),
      'invalid-argument'
    );
  });
});

describe('getModeratorInvite', () => {
  it('shows region names, state and (only while open) the address', async () => {
    const w = makeWorld({
      invites: { [TOKEN_ID]: pendingInvite({ regionIds: ['wien', 'tirol'] }) },
    });
    expect(await getModeratorInviteHandler(call(null, { token: TOKEN }), w.deps)).toEqual({
      state: 'pending',
      regionIds: ['tirol', 'wien'],
      regionNames: ['Tirol', 'Wien'],
      email: 'neu@x.at',
    });
    w.setNow(NOW + INVITE_VALID_MS + 1);
    expect(await getModeratorInviteHandler(call(null, { token: TOKEN }), w.deps)).toMatchObject({
      state: 'expired',
      email: null,
    });
  });

  it('rejects malformed and unknown tokens and is rate-limited', async () => {
    const w = makeWorld();
    await expectCode(
      getModeratorInviteHandler(call(null, { token: 'short' }), w.deps),
      'invalid-argument'
    );
    await expectCode(getModeratorInviteHandler(call(null, { token: TOKEN }), w.deps), 'not-found');
    const limited: string[] = [];
    w.deps.enforceRateLimit = (_req, action) => {
      limited.push(action);
    };
    await getModeratorInviteHandler(call(null, { token: TOKEN }), w.deps).catch(() => {});
    expect(limited).toEqual(['moderatorInviteRead']);
  });
});

describe('acceptModeratorInvite', () => {
  const invitee = { email: 'Neu@X.at' };

  it('grants the role, stores consents + signature on the invite and in the audit log', async () => {
    const w = makeWorld({
      users: { neu: invitee },
      invites: { [TOKEN_ID]: pendingInvite() },
    });
    const result = await acceptModeratorInviteHandler(call('neu', acceptData()), w.deps);
    expect(result).toEqual({ regionIds: ['tirol'], alreadyAccepted: false });
    expect(w.roleDocs.get('neu')).toMatchObject({ role: 'RegionModerator', regionIds: ['tirol'] });
    expect(w.roleDocs.get('neu')).not.toHaveProperty('signatureName');
    expect(w.inviteDocs.get(TOKEN_ID)).toMatchObject({
      status: 'accepted',
      acceptedUid: 'neu',
      consents: [...REQUIRED_CONSENTS],
      signatureName: 'Anna Muster',
      textVersion: ONBOARDING_TEXT_VERSION,
    });
    expect(w.audit).toEqual([
      {
        action: 'grantRegionModerator',
        actorUid: 'neu',
        targetUid: 'neu',
        targetEmail: 'Neu@X.at',
        before: null,
        after: { role: 'RegionModerator', regionIds: ['tirol'] },
        via: 'invite',
        inviteId: TOKEN_ID,
        invitedBy: 'boss',
        consents: [...REQUIRED_CONSENTS],
        signatureName: 'Anna Muster',
        textVersion: ONBOARDING_TEXT_VERSION,
      },
    ]);
    expect(w.mails.map((m) => [m.to, m.subject])).toEqual([
      ['boss@tribe.at', 'Neue Moderator:in: Anna Muster (Tribe Tirol)'],
    ]);
  });

  it('keeps the regions a moderator already has (union)', async () => {
    const w = makeWorld({
      roles: { neu: { role: 'RegionModerator', regionIds: ['wien'] } },
      users: { neu: invitee },
      invites: { [TOKEN_ID]: pendingInvite({ regionIds: ['tirol'] }) },
    });
    await acceptModeratorInviteHandler(call('neu', acceptData()), w.deps);
    expect(w.roleDocs.get('neu')?.regionIds).toEqual(['tirol', 'wien']);
    expect(w.audit[0]).toMatchObject({
      action: 'updateRegionModerator',
      before: { role: 'RegionModerator', regionIds: ['wien'] },
      after: { role: 'RegionModerator', regionIds: ['tirol', 'wien'] },
    });
  });

  it('can be used once; the same person again gets a friendly no-op', async () => {
    const w = makeWorld({
      users: { neu: invitee, other: { email: 'neu@x.at' } },
      invites: { [TOKEN_ID]: pendingInvite() },
    });
    await acceptModeratorInviteHandler(call('neu', acceptData()), w.deps);
    expect(await acceptModeratorInviteHandler(call('neu', acceptData()), w.deps)).toEqual({
      regionIds: ['tirol'],
      alreadyAccepted: true,
    });
    await expectCode(
      acceptModeratorInviteHandler(call('other', acceptData()), w.deps),
      'failed-precondition',
      /already used/
    );
    expect(w.audit).toHaveLength(1);
    expect(w.mails).toHaveLength(1);
  });

  it('refuses expired and revoked invites', async () => {
    const w = makeWorld({
      users: { neu: invitee },
      invites: { [TOKEN_ID]: pendingInvite({ expiresAtMs: NOW }) },
    });
    await expectCode(
      acceptModeratorInviteHandler(call('neu', acceptData()), w.deps),
      'failed-precondition',
      /expired/
    );
    (w.inviteDocs.get(TOKEN_ID) as InviteRecord).status = 'revoked';
    (w.inviteDocs.get(TOKEN_ID) as InviteRecord).expiresAtMs = NOW + 1000;
    await expectCode(
      acceptModeratorInviteHandler(call('neu', acceptData()), w.deps),
      'failed-precondition',
      /revoked/
    );
    expect(w.roleDocs.size).toBe(0);
  });

  it('needs a login with the invited address', async () => {
    const w = makeWorld({
      users: { wrong: { email: 'anders@x.at' }, none: {} },
      invites: { [TOKEN_ID]: pendingInvite() },
    });
    await expectCode(
      acceptModeratorInviteHandler(call(null, acceptData()), w.deps),
      'unauthenticated'
    );
    await expectCode(
      acceptModeratorInviteHandler(call('wrong', acceptData()), w.deps),
      'permission-denied'
    );
    await expectCode(
      acceptModeratorInviteHandler(call('none', acceptData()), w.deps),
      'permission-denied'
    );
    expect(w.roleDocs.size).toBe(0);
    expect(w.inviteDocs.get(TOKEN_ID)?.status).toBe('pending');
  });

  it('never changes a Super-Admin (role doc or token claim)', async () => {
    const w = makeWorld({
      roles: { neu: ADMIN },
      users: { neu: invitee, claim: { email: 'neu@x.at', customClaims: { role: 'Admin' } } },
      invites: { [TOKEN_ID]: pendingInvite() },
    });
    await expectCode(
      acceptModeratorInviteHandler(call('neu', acceptData()), w.deps),
      'failed-precondition'
    );
    await expectCode(
      acceptModeratorInviteHandler(call('claim', acceptData()), w.deps),
      'failed-precondition'
    );
    expect(w.roleDocs.get('neu')).toEqual(ADMIN);
    expect(w.inviteDocs.get(TOKEN_ID)?.status).toBe('pending');
    expect(w.audit).toHaveLength(0);
  });

  it('needs every consent, a name and the current text version', async () => {
    const w = makeWorld({ users: { neu: invitee }, invites: { [TOKEN_ID]: pendingInvite() } });
    for (const over of [
      { consents: ['haltung', 'richtlinien'] },
      { consents: ['haltung', 'richtlinien', 'pruefung', 'extra'] },
      { consents: ['haltung', 'haltung', 'pruefung'] },
      { consents: 'haltung' },
      { signatureName: ' ' },
      { signatureName: 'A' },
      { signatureName: 'x'.repeat(81) },
    ]) {
      await expectCode(
        acceptModeratorInviteHandler(call('neu', acceptData(over)), w.deps),
        'invalid-argument'
      );
    }
    await expectCode(
      acceptModeratorInviteHandler(call('neu', acceptData({ textVersion: 0 })), w.deps),
      'failed-precondition',
      /Outdated/
    );
    expect(w.roleDocs.size).toBe(0);
  });

  it('still grants the role when the info mail to the Super-Admins fails', async () => {
    const w = makeWorld({
      users: { neu: invitee },
      invites: { [TOKEN_ID]: pendingInvite() },
      mailFails: true,
    });
    await acceptModeratorInviteHandler(call('neu', acceptData()), w.deps);
    expect(w.roleDocs.get('neu')?.role).toBe('RegionModerator');
  });
});

describe('client copy of the onboarding texts', () => {
  it('matches the server version and consent ids', () => {
    expect(MODERATOR_ONBOARDING_TEXT_VERSION).toBe(ONBOARDING_TEXT_VERSION);
    expect(MODERATOR_ONBOARDING_CONSENTS).toEqual([...REQUIRED_CONSENTS]);
    const stepConsents = moderatorOnboardingSteps('Tribe Tirol')
      .map((s) => s.consent)
      .filter(Boolean);
    expect(stepConsents).toEqual([...REQUIRED_CONSENTS]);
  });

  it('replaces "The Tribe" with the region tribe', () => {
    expect(tribeNames(['Tirol'])).toBe('Tribe Tirol');
    expect(tribeNames(['Tirol', 'Wien', 'Kärnten'])).toBe(
      'Tribe Tirol, Tribe Wien und Tribe Kärnten'
    );
    const text = JSON.stringify(moderatorOnboardingSteps('Tribe Tirol'));
    expect(text).not.toContain('The Tribe');
    expect(text).toContain('Tribe Tirol');
  });

  it('explains a wrong account with the address to use', () => {
    expect(inviteErrorMessage({ code: 'functions/permission-denied' }, 'neu@x.at')).toBe(
      'Diese Einladung gilt für neu@x.at. Bitte melde dich mit neu@x.at an.'
    );
    expect(
      inviteErrorMessage({ code: 'functions/failed-precondition', message: 'Invitation expired.' })
    ).toMatch(/abgelaufen/);
  });
});
