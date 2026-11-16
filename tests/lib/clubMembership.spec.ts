import { describe, it, expect, vi } from 'vitest';
import {
  MEMBERSHIP_AMOUNT_PRESETS,
  MEMBERSHIP_BENEFITS,
  MEMBERSHIP_COLLECTION,
  MEMBERSHIP_REQUIRED_CONSENTS,
  MIN_MEMBERSHIP_AMOUNT,
  hasAllMembershipConsents,
  isMembershipDueToEnd,
  isMembershipRunning,
  isValidMembershipAmount,
  parseMembershipSettings,
} from '../../functions/src/clubMembershipLogic';
import * as client from '../../src/utils/clubMembership';
import { processMollieWebhook } from '../../functions/src/mollieWebhookLogic';
import {
  adminCreateClubMemberHandler,
  cancelMembershipHandler,
  memberSlugBase,
  type AdminCreateMemberDeps,
  createMembershipCheckoutHandler,
  expireClubMembershipsHandler,
  type MembershipDeps,
} from '../../functions/src/clubMembership';
import { buildMembershipWelcomePayload } from '../../functions/src/emailTemplates';

type Doc = Record<string, unknown>;

// In-memory stand-in for the admin SDK as the webhook logic uses it:
// collection(path).doc(id).get()/set(data, { merge }), donors.orderBy().limit().get().
function makeStore(initial: Record<string, Doc> = {}) {
  const docs = new Map<string, Doc>(Object.entries(initial));
  const writes: Array<{ path: string; data: Doc; merge: boolean }> = [];
  const snapshot = (data: Doc | undefined) => ({
    exists: data !== undefined,
    docs: [],
    get: (field: string) => data?.[field],
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return {
          get: async () => snapshot(docs.get(path)),
          set: async (data: Doc, options?: { merge?: boolean }) => {
            const merge = Boolean(options?.merge);
            writes.push({ path, data, merge });
            docs.set(path, merge ? { ...(docs.get(path) ?? {}), ...data } : { ...data });
          },
        };
      },
      orderBy: () => ({ limit: () => ({ get: async () => snapshot(undefined) }) }),
    }),
  };
  const pathsWritten = () => writes.map((w) => w.path);
  return { db, docs, writes, pathsWritten };
}

const firstMembershipPayment = (over: Doc = {}) => ({
  id: 'tr_m1',
  status: 'paid',
  amount: { value: '12.90', currency: 'EUR' },
  sequenceType: 'first',
  customerId: 'cst_m',
  mandateId: 'mdt_m',
  paidAt: '2026-11-16T09:00:00Z',
  webhookUrl: 'https://tribe-vbg-staging.web.app/mollieWebhook',
  metadata: { type: 'membership', uid: 'u1', memberName: 'Anna Pionierin' },
  ...over,
});

const paidEvent = (payment: Doc) => ({
  format: 'next-gen' as const,
  type: 'payment.paid',
  eventId: 'ev',
  payment: payment as never,
});

describe('client and server agree on the Pioniere rules', () => {
  it('uses the same presets, minimum, ticks and benefits', () => {
    expect(client.MEMBERSHIP_AMOUNT_PRESETS).toEqual([...MEMBERSHIP_AMOUNT_PRESETS]);
    expect(client.MIN_MEMBERSHIP_AMOUNT).toBe(MIN_MEMBERSHIP_AMOUNT);
    expect(client.MEMBERSHIP_REQUIRED_CONSENTS).toEqual([...MEMBERSHIP_REQUIRED_CONSENTS]);
    expect(client.MEMBERSHIP_BENEFITS).toEqual([...MEMBERSHIP_BENEFITS]);
  });

  it('offers 3,90 / 12,90 / 17,90 €, all above the minimum of 3 €', () => {
    expect(MEMBERSHIP_AMOUNT_PRESETS).toEqual([3.9, 12.9, 17.9]);
    expect(MIN_MEMBERSHIP_AMOUNT).toBe(3);
    for (const p of MEMBERSHIP_AMOUNT_PRESETS) expect(isValidMembershipAmount(p)).toBe(true);
  });
});

describe('amount check', () => {
  it.each([
    [3, true],
    [3.9, true],
    [7.5, true],
    [1000, true],
    [2.99, false],
    [0, false],
    [-5, false],
    [3.905, false],
    [1000.01, false],
    [Number.NaN, false],
    ['5', false],
    [null, false],
  ])('server: %s -> %s', (value, ok) => {
    expect(isValidMembershipAmount(value)).toBe(ok);
    if (typeof value === 'number') expect(client.isValidMembershipAmount(value)).toBe(ok);
  });

  it('client parses a German decimal comma and refuses junk', () => {
    expect(client.parseMembershipAmount('7,50')).toBe(7.5);
    expect(client.parseMembershipAmount(' 12.9 ')).toBe(12.9);
    expect(client.parseMembershipAmount('3,999')).toBeNaN();
    expect(client.parseMembershipAmount('abc')).toBeNaN();
    expect(client.parseMembershipAmount('')).toBeNaN();
  });
});

describe('membership state', () => {
  it('needs exactly both ticks', () => {
    expect(hasAllMembershipConsents(['statuten', 'datenschutz'])).toBe(true);
    expect(hasAllMembershipConsents(['statuten'])).toBe(false);
    expect(hasAllMembershipConsents(['statuten', 'statuten'])).toBe(false);
    expect(hasAllMembershipConsents('statuten')).toBe(false);
  });

  it('counts active and gekündigt-but-paid as running, pending and ended not', () => {
    const today = '2026-11-16';
    expect(isMembershipRunning({ status: 'active' }, today)).toBe(true);
    expect(isMembershipRunning({ status: 'cancelled', paidUntil: '2026-12-01' }, today)).toBe(true);
    expect(isMembershipRunning({ status: 'cancelled', paidUntil: '2026-11-16' }, today)).toBe(
      false
    );
    expect(isMembershipRunning({ status: 'pending' }, today)).toBe(false);
    expect(isMembershipRunning({ status: 'ended' }, today)).toBe(false);
    expect(isMembershipDueToEnd({ status: 'cancelled', paidUntil: '2026-11-16' }, today)).toBe(
      true
    );
    expect(isMembershipDueToEnd({ status: 'active', paidUntil: '2026-01-01' }, today)).toBe(false);
  });

  it('reads a missing settings doc as off', () => {
    expect(parseMembershipSettings(undefined)).toEqual({
      mode: 'off',
      statutesUrl: '',
      statutesVersion: '',
    });
    expect(parseMembershipSettings({ mode: 'all', statutesUrl: ' https://x.at/s.pdf ' })).toEqual({
      mode: 'all',
      statutesUrl: 'https://x.at/s.pdf',
      statutesVersion: '',
    });
  });
});

describe('Mollie webhook: membership payments', () => {
  it('first payment: creates the subscription, activates the membership, marks the profile, no donor', async () => {
    const store = makeStore({ 'users/u1/publicProfile/data': { displayName: 'Anna' } });
    const ensureSubscription = vi.fn(async () => ({ id: 'sub_m' }));
    const notifyMembership = vi.fn(async () => {});
    const notifyDonation = vi.fn(async () => {});

    const result = await processMollieWebhook({
      body: paidEvent(firstMembershipPayment()),
      db: store.db,
      ensureSubscription,
      notifyMembership,
      notifyDonation,
      findMembershipUid: async () => null,
    });

    expect(result).toEqual({
      status: 200,
      body: { received: true, action: 'membership', status: 'active', activated: true },
    });
    expect(ensureSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cst_m',
        amount: '12.90',
        currency: 'EUR',
        startDate: '2026-12-16',
        description: 'Monatlicher Pioniere Mitgliedsbeitrag tribe Vorarlberg',
        metadata: { type: 'membership', uid: 'u1' },
      })
    );
    // Never on the donor wall, never a donation notice.
    expect(store.pathsWritten().some((p) => p.startsWith('donors/'))).toBe(false);
    expect(notifyDonation).not.toHaveBeenCalled();

    expect(store.docs.get('ledger/mollie_tr_m1')).toMatchObject({
      type: 'income',
      amount: 12.9,
      category: 'Mitgliedsbeitrag',
      description: 'Mitgliedsbeitrag Pioniere via Mollie (monatlich)',
    });
    expect(store.docs.get(`${MEMBERSHIP_COLLECTION}/u1`)).toMatchObject({
      status: 'active',
      amount: 12.9,
      mollieCustomerId: 'cst_m',
      mollieSubscriptionId: 'sub_m',
      firstPaymentId: 'tr_m1',
      paidUntil: '2026-12-16',
      source: 'web',
    });
    expect(store.docs.get('users/u1/publicProfile/data')).toMatchObject({ clubMember: true });
    expect(notifyMembership).toHaveBeenCalledTimes(1);
    expect(notifyMembership).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'u1', amount: '12.90', paidUntil: '2026-12-16' })
    );
  });

  it('a repeated webhook does not notify twice', async () => {
    const store = makeStore({
      [`${MEMBERSHIP_COLLECTION}/u1`]: { status: 'active', paidUntil: '2026-12-16' },
    });
    const notifyMembership = vi.fn(async () => {});
    await processMollieWebhook({
      body: paidEvent(firstMembershipPayment()),
      db: store.db,
      ensureSubscription: async () => ({ id: 'sub_m' }),
      notifyMembership,
    });
    expect(notifyMembership).not.toHaveBeenCalled();
  });

  it('keeps the pending profile untouched when there is no public profile yet', async () => {
    const store = makeStore();
    await processMollieWebhook({
      body: paidEvent(firstMembershipPayment()),
      db: store.db,
      ensureSubscription: async () => ({ id: 'sub_m' }),
    });
    expect(store.docs.has('users/u1/publicProfile/data')).toBe(false);
    expect(store.docs.get(`${MEMBERSHIP_COLLECTION}/u1`)).toMatchObject({ status: 'active' });
  });

  it('recurring payment (found by its subscription): books a Mitgliedsbeitrag and moves paidUntil on', async () => {
    const store = makeStore({
      [`${MEMBERSHIP_COLLECTION}/u1`]: {
        status: 'active',
        mollieSubscriptionId: 'sub_m',
        paidUntil: '2026-12-16',
      },
    });
    const notifyMembership = vi.fn(async () => {});
    const result = await processMollieWebhook({
      body: paidEvent({
        id: 'tr_m2',
        status: 'paid',
        amount: { value: '12.90', currency: 'EUR' },
        sequenceType: 'recurring',
        subscriptionId: 'sub_m',
        customerId: 'cst_m',
        paidAt: '2026-12-16T06:00:00Z',
        metadata: null,
      }),
      db: store.db,
      findMembershipUid: async (id) => (id === 'sub_m' ? 'u1' : null),
      notifyMembership,
    });
    expect(result.status).toBe(200);
    expect(store.docs.get('ledger/mollie_tr_m2')).toMatchObject({ category: 'Mitgliedsbeitrag' });
    expect(store.docs.get(`${MEMBERSHIP_COLLECTION}/u1`)).toMatchObject({
      status: 'active',
      paidUntil: '2027-01-16',
      lastPaymentId: 'tr_m2',
    });
    expect(store.pathsWritten().some((p) => p.startsWith('donors/'))).toBe(false);
    expect(notifyMembership).not.toHaveBeenCalled();
  });

  it('a gekündigt membership stays gekündigt when a last payment comes in', async () => {
    const store = makeStore({
      [`${MEMBERSHIP_COLLECTION}/u1`]: { status: 'cancelled', paidUntil: '2026-12-16' },
    });
    await processMollieWebhook({
      body: paidEvent({
        id: 'tr_m3',
        status: 'paid',
        amount: { value: '12.90', currency: 'EUR' },
        sequenceType: 'recurring',
        subscriptionId: 'sub_m',
        paidAt: '2026-12-16T06:00:00Z',
      }),
      db: store.db,
      findMembershipUid: async () => 'u1',
    });
    expect(store.docs.get(`${MEMBERSHIP_COLLECTION}/u1`)).toMatchObject({ status: 'cancelled' });
  });

  it('reports and asks Mollie to retry when the subscription cannot be created', async () => {
    const store = makeStore();
    const reportFailure = vi.fn(async () => {});
    const result = await processMollieWebhook({
      body: paidEvent(firstMembershipPayment()),
      db: store.db,
      ensureSubscription: async () => {
        throw new Error('422');
      },
      reportFailure,
    });
    expect(result.status).toBe(500);
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'mitgliedschaft-abo-anlegen',
        alertId: 'mollie_member_abo_tr_m1',
      })
    );
    expect(store.docs.has(`${MEMBERSHIP_COLLECTION}/u1`)).toBe(false);
  });

  it('failed monthly fee: only a notice to the admins, the membership stays', async () => {
    const store = makeStore({ [`${MEMBERSHIP_COLLECTION}/u1`]: { status: 'active' } });
    const reportFailure = vi.fn(async () => {});
    const result = await processMollieWebhook({
      body: { format: 'classic', id: 'tr_fail' },
      db: store.db,
      fetchPayment: async () => ({
        id: 'tr_fail',
        status: 'failed',
        amount: { value: '12.90', currency: 'EUR' },
        sequenceType: 'recurring',
        subscriptionId: 'sub_m',
        customerId: 'cst_m',
      }),
      findMembershipUid: async () => 'u1',
      reportFailure,
    });
    expect(result).toEqual({
      status: 200,
      body: { received: true, action: 'ignored', reason: 'failed' },
    });
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'mitgliedsbeitrag-fehlgeschlagen',
        alertId: 'mollie_member_failed_tr_fail',
      })
    );
    expect(store.writes).toHaveLength(0);
  });
});

describe('Mollie webhook: donations stay as they were', () => {
  it('a monthly donation is still a donor with a "Spenden" ledger entry and a staff notice', async () => {
    const store = makeStore();
    const notifyDonation = vi.fn(async () => {});
    const notifyMembership = vi.fn(async () => {});
    const ensureSubscription = vi.fn(async () => ({ id: 'sub_d' }));
    const result = await processMollieWebhook({
      body: paidEvent({
        id: 'tr_d1',
        status: 'paid',
        amount: { value: '15.00', currency: 'EUR' },
        sequenceType: 'first',
        customerId: 'cst_d',
        paidAt: '2026-11-16T09:00:00Z',
        metadata: { donationType: 'monthly', displayOnConsent: true, donorName: 'Greta' },
      }),
      db: store.db,
      ensureSubscription,
      notifyDonation,
      notifyMembership,
      findMembershipUid: async () => null,
    });
    expect(result).toEqual({ status: 200, body: { received: true, written: true } });
    // Donations pass no membership description / metadata to Mollie.
    expect(ensureSubscription.mock.calls[0][0]).not.toHaveProperty('description');
    expect(ensureSubscription.mock.calls[0][0]).not.toHaveProperty('metadata');
    expect(store.docs.get('donors/donor_mollie_sub_sub_d')).toMatchObject({ name: 'Greta' });
    expect(store.docs.get('ledger/mollie_tr_d1')).toMatchObject({ category: 'Spenden' });
    expect(store.pathsWritten().some((p) => p.startsWith(MEMBERSHIP_COLLECTION))).toBe(false);
    expect(notifyDonation).toHaveBeenCalledTimes(1);
    expect(notifyMembership).not.toHaveBeenCalled();
  });

  it('a recurring donation is not mistaken for a membership', async () => {
    const store = makeStore();
    const findMembershipUid = vi.fn(async () => null);
    const result = await processMollieWebhook({
      body: paidEvent({
        id: 'tr_d2',
        status: 'paid',
        amount: { value: '15.00', currency: 'EUR' },
        sequenceType: 'recurring',
        subscriptionId: 'sub_d',
        paidAt: '2026-12-16T09:00:00Z',
      }),
      db: store.db,
      findMembershipUid,
    });
    expect(findMembershipUid).toHaveBeenCalledWith('sub_d');
    expect(result).toEqual({ status: 200, body: { received: true, action: 'skip-recurring' } });
    expect(store.docs.get('ledger/mollie_tr_d2')).toMatchObject({ category: 'Spenden' });
  });

  it('a failed donation payment raises no membership notice', async () => {
    const store = makeStore();
    const reportFailure = vi.fn(async () => {});
    await processMollieWebhook({
      body: { format: 'classic', id: 'tr_df' },
      db: store.db,
      fetchPayment: async () => ({
        id: 'tr_df',
        status: 'failed',
        sequenceType: 'recurring',
        subscriptionId: 'sub_d',
      }),
      findMembershipUid: async () => null,
      reportFailure,
    });
    expect(reportFailure).not.toHaveBeenCalled();
  });
});

// ── createMembershipCheckout ─────────────────────────────────────────────

const NOW = Date.UTC(2026, 10, 16, 10, 0, 0);

function makeDeps(
  over: Partial<MembershipDeps> & {
    roles?: Record<string, Doc>;
    memberships?: Record<string, Doc>;
    settings?: Doc;
  } = {}
) {
  const memberships = new Map<string, Doc>(Object.entries(over.memberships ?? {}));
  const clubFlags = new Map<string, boolean>();
  const notices: Array<{ id: string; text: string }> = [];
  const reportFailure = vi.fn(async () => {});
  const mollie = {
    createCustomer: vi.fn(async () => ({ id: 'cst_new' })),
    startCheckout: vi.fn(async () => ({
      checkoutUrl: 'https://mollie.test/checkout',
      paymentId: 'tr_new',
    })),
    cancelSubscription: vi.fn(async () => {}),
  };
  const deps: MembershipDeps = {
    now: () => NOW,
    readRoleDoc: async (uid) => (over.roles ?? {})[uid] ?? null,
    readSettings: async () =>
      parseMembershipSettings(
        over.settings ?? {
          mode: 'all',
          statutesUrl: 'https://x.at/statuten.pdf',
          statutesVersion: '2026-11',
        }
      ),
    getMembership: async (uid) => memberships.get(uid) ?? null,
    setMembership: async (uid, data, { merge }) => {
      memberships.set(uid, merge ? { ...(memberships.get(uid) ?? {}), ...data } : { ...data });
    },
    getUser: async (uid) => ({ uid, email: 'Anna@X.at', displayName: 'Anna' }),
    mollie,
    reportFailure,
    enforceRateLimit: () => {},
    setClubMemberFlag: vi.fn(async (uid: string, value: boolean) => {
      clubFlags.set(uid, value);
      return true;
    }),
    notifySuperAdmins: vi.fn(async (id: string, text: string) => {
      notices.push({ id, text });
    }),
    listCancelledMemberships: async () =>
      [...memberships.entries()]
        .filter(([, d]) => d.status === 'cancelled')
        .map(([uid, data]) => ({ uid, data })),
    ...over,
  };
  return { deps, memberships, mollie, reportFailure, clubFlags, notices };
}

const request = (data: Doc, uid: string | null = 'u1') => ({
  auth: uid ? { uid } : null,
  data,
});
const valid = { amount: 12.9, name: ' Anna  Pionierin ', consents: ['statuten', 'datenschutz'] };
const BASE = 'https://tribe-vbg-staging.web.app';

describe('createMembershipCheckout', () => {
  it('starts the first payment and stores a pending membership with the Statuten consent', async () => {
    const { deps, memberships, mollie } = makeDeps();
    const result = await createMembershipCheckoutHandler(request(valid), deps, BASE);
    expect(result).toEqual({ checkoutUrl: 'https://mollie.test/checkout' });
    expect(mollie.createCustomer).toHaveBeenCalledWith({
      name: 'Anna Pionierin',
      email: 'anna@x.at',
      uid: 'u1',
    });
    expect(mollie.startCheckout).toHaveBeenCalledWith({
      customerId: 'cst_new',
      amount: 12.9,
      uid: 'u1',
      name: 'Anna Pionierin',
    });
    const stored = memberships.get('u1');
    expect(stored).toMatchObject({
      status: 'pending',
      source: 'web',
      amount: 12.9,
      email: 'anna@x.at',
      mollieCustomerId: 'cst_new',
      statutesVersion: '2026-11',
      statutesUrl: 'https://x.at/statuten.pdf',
      consents: ['statuten', 'datenschutz'],
    });
    expect(stored?.statutesAcceptedAt).toEqual(new Date(NOW));
  });

  it('accepts a free amount of 3 € and refuses less', async () => {
    const { deps } = makeDeps();
    await expect(
      createMembershipCheckoutHandler(request({ ...valid, amount: 3 }), deps, BASE)
    ).resolves.toBeTruthy();
    await expect(
      createMembershipCheckoutHandler(request({ ...valid, amount: 2.99 }), makeDeps().deps, BASE)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('refuses without both ticks, without a name, or without a login', async () => {
    const { deps, mollie } = makeDeps();
    await expect(
      createMembershipCheckoutHandler(request({ ...valid, consents: ['statuten'] }), deps, BASE)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      createMembershipCheckoutHandler(request({ ...valid, name: ' ' }), deps, BASE)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      createMembershipCheckoutHandler(request(valid, null), deps, BASE)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mollie.createCustomer).not.toHaveBeenCalled();
  });

  it('follows the flag: off for nobody, "admins" only for Super-Admins', async () => {
    await expect(
      createMembershipCheckoutHandler(
        request(valid),
        makeDeps({ settings: { mode: 'off', statutesUrl: 'https://x.at/s' } }).deps,
        BASE
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const adminsOnly = { mode: 'admins', statutesUrl: 'https://x.at/s' };
    await expect(
      createMembershipCheckoutHandler(request(valid), makeDeps({ settings: adminsOnly }).deps, BASE)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(
      createMembershipCheckoutHandler(
        request(valid),
        makeDeps({ settings: adminsOnly, roles: { u1: { role: 'Admin' } } }).deps,
        BASE
      )
    ).resolves.toBeTruthy();
  });

  it('without a Statuten link only Super-Admins may pay (testing)', async () => {
    const noStatutes = { mode: 'all', statutesUrl: '' };
    await expect(
      createMembershipCheckoutHandler(request(valid), makeDeps({ settings: noStatutes }).deps, BASE)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(
      createMembershipCheckoutHandler(
        request(valid),
        makeDeps({ settings: noStatutes, roles: { u1: { role: 'Admin' } } }).deps,
        BASE
      )
    ).resolves.toBeTruthy();
  });

  it('refuses a second membership while one is running', async () => {
    const { deps, mollie } = makeDeps({ memberships: { u1: { status: 'active' } } });
    await expect(createMembershipCheckoutHandler(request(valid), deps, BASE)).rejects.toMatchObject(
      { code: 'already-exists' }
    );
    expect(mollie.createCustomer).not.toHaveBeenCalled();
    // A pending (unpaid) start may be started again.
    const again = makeDeps({ memberships: { u1: { status: 'pending' } } });
    await expect(
      createMembershipCheckoutHandler(request(valid), again.deps, BASE)
    ).resolves.toBeTruthy();
  });

  it('reports a Mollie error to the Verwaltung and answers with a friendly message', async () => {
    const { deps, mollie, reportFailure, memberships } = makeDeps();
    mollie.startCheckout.mockRejectedValueOnce(new Error('Mollie /payments 422'));
    await expect(createMembershipCheckoutHandler(request(valid), deps, BASE)).rejects.toMatchObject(
      { code: 'unavailable' }
    );
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'mitgliedschaft-start', pageUrl: `${BASE}/pioniere` })
    );
    expect(memberships.has('u1')).toBe(false);
  });
});

describe('confirmation mail', () => {
  it('sums up amount, next payment, benefits, cancellation and the privacy link', () => {
    const mail = buildMembershipWelcomePayload({
      recipient: 'anna@x.at',
      name: 'Anna',
      amount: '12.90',
      nextPaymentDate: '2026-12-16',
      baseUrl: BASE,
    });
    expect(mail.to).toBe('anna@x.at');
    expect(mail.subject).toBe('Willkommen bei den Pionieren!');
    expect(mail.text).toContain('12,90 €');
    expect(mail.text).toContain('Dezember 2026');
    for (const b of MEMBERSHIP_BENEFITS) expect(mail.text).toContain(b);
    expect(mail.text).toContain(`${BASE}/datenschutz#vereinsmitglieder`);
    expect(mail.text).toContain(`${BASE}/profil#pioniere`);
    expect(mail.html).toContain('Willkommen bei den Pionieren');
  });
});

describe('cancelMembership', () => {
  const webMember = {
    status: 'active',
    source: 'web',
    name: 'Anna',
    amount: 12.9,
    mollieCustomerId: 'cst_m',
    mollieSubscriptionId: 'sub_m',
    paidUntil: '2026-12-16',
  };

  it('web: deletes the Mollie subscription, keeps the membership until the paid month is over', async () => {
    const { deps, memberships, mollie, clubFlags, notices } = makeDeps({
      memberships: { u1: webMember },
    });
    const result = await cancelMembershipHandler(request({}), deps);
    expect(result).toEqual({
      status: 'cancelled',
      paidUntil: '2026-12-16',
      alreadyCancelled: false,
    });
    expect(mollie.cancelSubscription).toHaveBeenCalledWith('cst_m', 'sub_m');
    expect(memberships.get('u1')).toMatchObject({ status: 'cancelled', paidUntil: '2026-12-16' });
    // The badge stays until the end of the paid month.
    expect(clubFlags.has('u1')).toBe(false);
    expect(notices).toHaveLength(1);
    expect(notices[0].text).toContain('gekündigt: Anna');
  });

  it('a second click changes nothing', async () => {
    const { deps, mollie } = makeDeps({
      memberships: { u1: { ...webMember, status: 'cancelled' } },
    });
    await expect(cancelMembershipHandler(request({}), deps)).resolves.toMatchObject({
      alreadyCancelled: true,
    });
    expect(mollie.cancelSubscription).not.toHaveBeenCalled();
  });

  it('paper membership (no Mollie): ends at once and removes the badge', async () => {
    const { deps, memberships, mollie, clubFlags } = makeDeps({
      memberships: { u1: { status: 'active', source: 'manual', paidUntil: null } },
    });
    const result = await cancelMembershipHandler(request({}), deps);
    expect(result.status).toBe('ended');
    expect(mollie.cancelSubscription).not.toHaveBeenCalled();
    expect(memberships.get('u1')).toMatchObject({ status: 'ended' });
    expect(clubFlags.get('u1')).toBe(false);
  });

  it('refuses without a running membership or a login', async () => {
    await expect(cancelMembershipHandler(request({}), makeDeps().deps)).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(
      cancelMembershipHandler(
        request({}),
        makeDeps({ memberships: { u1: { status: 'pending' } } }).deps
      )
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(cancelMembershipHandler(request({}, null), makeDeps().deps)).rejects.toMatchObject(
      { code: 'unauthenticated' }
    );
  });

  it('keeps the membership active and alerts the admins when Mollie refuses', async () => {
    const { deps, memberships, mollie, reportFailure } = makeDeps({
      memberships: { u1: webMember },
    });
    mollie.cancelSubscription.mockRejectedValueOnce(new Error('Mollie 500'));
    await expect(cancelMembershipHandler(request({}), deps)).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(memberships.get('u1')).toMatchObject({ status: 'active' });
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'mitgliedschaft-kuendigen' })
    );
  });
});

describe('expireClubMemberships', () => {
  it('ends gekündigt memberships once the paid month is over and removes the badge', async () => {
    const { deps, memberships, clubFlags } = makeDeps({
      memberships: {
        over: { status: 'cancelled', paidUntil: '2026-11-16' },
        running: { status: 'cancelled', paidUntil: '2026-11-30' },
        active: { status: 'active', paidUntil: '2026-11-01' },
      },
    });
    await expect(expireClubMembershipsHandler(deps)).resolves.toBe(1);
    expect(memberships.get('over')).toMatchObject({ status: 'ended' });
    expect(clubFlags.get('over')).toBe(false);
    expect(memberships.get('running')).toMatchObject({ status: 'cancelled' });
    expect(memberships.get('active')).toMatchObject({ status: 'active' });
    expect(clubFlags.has('running')).toBe(false);
  });
});

describe('adminCreateClubMember (paper forms)', () => {
  function makeAdminDeps(
    opts: {
      users?: Array<{ uid: string; email: string }>;
      memberships?: Record<string, Doc>;
      createRace?: boolean;
      mailFails?: boolean;
    } = {}
  ) {
    const users = [...(opts.users ?? [])];
    const base = makeDeps({
      roles: { admin: { role: 'Admin' }, mod: { role: 'RegionModerator', regionIds: ['tirol'] } },
      memberships: opts.memberships,
    });
    const mails: Array<{ to: string; text: string; html: string }> = [];
    const createUser = vi.fn(async ({ email }: { email: string; displayName: string }) => {
      if (opts.createRace) {
        users.push({ uid: 'raced', email });
        throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' });
      }
      const user = { uid: `new_${users.length}`, email };
      users.push(user);
      return user;
    });
    const seedProfile = vi.fn(async () => {});
    const deps: AdminCreateMemberDeps = {
      ...base.deps,
      getUserByEmail: async (email) =>
        users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
      createUser,
      seedProfile,
      passwordSetupUrl: async (email) =>
        `https://site.test/auth-action?mode=resetPassword&oobCode=${email}`,
      sendMail: async (payload) => {
        if (opts.mailFails) throw new Error('mailgun down');
        mails.push(payload);
      },
    };
    return { ...base, deps, users, createUser, seedProfile, mails };
  }

  const req = (data: Doc, uid: string | null = 'admin') => ({ auth: uid ? { uid } : null, data });
  const paper = { name: 'Berta Beispiel', email: 'Berta@Example.org', amount: 5 };

  it('only Super-Admins may create members', async () => {
    const { deps } = makeAdminDeps();
    await expect(adminCreateClubMemberHandler(req(paper, 'mod'), deps)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(adminCreateClubMemberHandler(req(paper, 'someone'), deps)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('links an existing account with the same e-mail and never creates a second one', async () => {
    const { deps, createUser, seedProfile, memberships, clubFlags, mails } = makeAdminDeps({
      users: [{ uid: 'existing', email: 'berta@example.org' }],
    });
    const result = await adminCreateClubMemberHandler(req(paper), deps);
    expect(result).toEqual({
      uid: 'existing',
      createdAccount: false,
      alreadyMember: false,
      emailSent: true,
    });
    expect(createUser).not.toHaveBeenCalled();
    expect(seedProfile).not.toHaveBeenCalled();
    expect(memberships.get('existing')).toMatchObject({
      status: 'active',
      source: 'manual',
      name: 'Berta Beispiel',
      email: 'berta@example.org',
      amount: 5,
      statutesAcceptance: 'paper',
      createdBy: 'admin',
    });
    expect(clubFlags.get('existing')).toBe(true);
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain('kein zweiter Account');
    expect(mails[0].text).not.toContain('oobCode');
    expect(mails[0].text).toContain('/datenschutz#vereinsmitglieder');
  });

  it('creates a new account with name and e-mail and mails the password link', async () => {
    const { deps, createUser, seedProfile, users, mails } = makeAdminDeps();
    const result = await adminCreateClubMemberHandler(req({ ...paper, amount: null }), deps);
    expect(result.createdAccount).toBe(true);
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith({
      email: 'berta@example.org',
      displayName: 'Berta Beispiel',
    });
    expect(seedProfile).toHaveBeenCalledWith(result.uid, {
      name: 'Berta Beispiel',
      email: 'berta@example.org',
    });
    expect(users).toHaveLength(1);
    expect(mails[0].to).toBe('berta@example.org');
    expect(mails[0].text).toContain('oobCode=berta@example.org');
    expect(mails[0].text).toContain('/datenschutz#vereinsmitglieder');
  });

  it('links the account when someone registered with the address a moment ago', async () => {
    const { deps, users } = makeAdminDeps({ createRace: true });
    const result = await adminCreateClubMemberHandler(req(paper), deps);
    expect(result).toMatchObject({ uid: 'raced', createdAccount: false });
    expect(users).toHaveLength(1);
  });

  it('a second run for the same person changes nothing', async () => {
    const { deps, memberships, mails } = makeAdminDeps({
      users: [{ uid: 'existing', email: 'berta@example.org' }],
      memberships: { existing: { status: 'active', source: 'web', amount: 12.9 } },
    });
    const result = await adminCreateClubMemberHandler(req(paper), deps);
    expect(result).toMatchObject({ alreadyMember: true, emailSent: false });
    expect(memberships.get('existing')).toMatchObject({ source: 'web', amount: 12.9 });
    expect(mails).toHaveLength(0);
  });

  it('checks name, e-mail and the optional amount', async () => {
    const { deps } = makeAdminDeps();
    for (const bad of [
      { ...paper, name: 'B' },
      { ...paper, email: 'nope' },
      { ...paper, amount: 2 },
    ]) {
      await expect(adminCreateClubMemberHandler(req(bad), deps)).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    }
  });

  it('keeps the membership when the mail fails', async () => {
    const { deps, memberships } = makeAdminDeps({ mailFails: true });
    const result = await adminCreateClubMemberHandler(req(paper), deps);
    expect(result.emailSent).toBe(false);
    expect(memberships.get(result.uid)).toMatchObject({ status: 'active' });
  });

  it('builds a readable profile address from the name', () => {
    expect(memberSlugBase('Anna Müller-Groß')).toBe('anna-mueller-gross');
    expect(memberSlugBase('  Zoë  ')).toBe('zoe');
    expect(memberSlugBase('***')).toBe('mitglied');
  });
});
