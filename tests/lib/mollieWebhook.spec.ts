import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  parseWebhookBody,
  donorIdForPayment,
  handlePaidPayment,
  processMollieWebhook,
  verifyMollieSignature,
  canonicalBodyBytes,
  subscriptionStartDate,
  sanitizeDonorComment,
  donationRegionId,
  recordLedgerIncome,
  ledgerIdForPayment,
  viennaDateString,
} from '../../functions/src/mollieWebhookLogic';

function makeSnapshot(exists, fields = {}, docs = []) {
  return {
    exists,
    ...fields,
    docs,
    get(field) {
      return fields[field];
    },
  };
}

function makeRef(initialDoc, writtenData) {
  return {
    async get() {
      return initialDoc;
    },
    async set(data, options) {
      writtenData.push({ data, options });
    },
  };
}

function makeDb(initialDonors = {}) {
  const setCalls = [];
  const collection = (name) => {
    if (name !== 'donors') {
      throw new Error(`unknown collection ${name}`);
    }
    return {
      doc: (id) => {
        const existing = initialDonors[id];
        return makeRef(
          existing ? makeSnapshot(true, existing, []) : makeSnapshot(false, {}),
          setCalls
        );
      },
      orderBy() {
        return {
          limit() {
            const maxOrderDoc = Object.entries(initialDonors).reduce((best, [id, fields]) => {
              if (typeof fields.order === 'number') {
                if (!best || fields.order > best.order) return { id, ...fields };
              }
              return best;
            }, null);
            return {
              async get() {
                if (!maxOrderDoc) {
                  return makeSnapshot(false, {}, []);
                }
                return makeSnapshot(true, {}, [
                  {
                    id: maxOrderDoc.id,
                    get: (field) => maxOrderDoc[field],
                  },
                ]);
              },
            };
          },
        };
      },
    };
  };
  return { db: { collection }, setCalls };
}

describe('verifyMollieSignature', () => {
  const SECRET = 'super-secret-123';
  const body = JSON.stringify({ resource: 'event', type: 'payment.paid' });
  const goodSig = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
  const wrongSig = `sha256=${createHmac('sha256', 'other-secret').update(body).digest('hex')}`;

  it('skips verification when no secret is configured', () => {
    expect(verifyMollieSignature({ rawBody: body, signature: null, secret: null })).toEqual({
      valid: true,
      skipped: true,
      reason: 'no-secret-configured',
    });
  });

  it('accepts a valid sha256 signature', () => {
    const r = verifyMollieSignature({ rawBody: body, signature: goodSig, secret: SECRET });
    expect(r.valid).toBe(true);
    expect(r.skipped).toBe(false);
  });

  it('rejects a wrong signature', () => {
    const r = verifyMollieSignature({ rawBody: body, signature: wrongSig, secret: SECRET });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signature-mismatch');
  });

  it('rejects when the signature header is missing but a secret is configured', () => {
    const r = verifyMollieSignature({ rawBody: body, signature: null, secret: SECRET });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('missing-signature');
  });

  it('also accepts a raw hex signature without the sha256= prefix', () => {
    const hex = createHmac('sha256', SECRET).update(body).digest('hex');
    const r = verifyMollieSignature({ rawBody: body, signature: hex, secret: SECRET });
    expect(r.valid).toBe(true);
  });
});

describe('canonicalBodyBytes', () => {
  it('prefers a rawBody buffer when available', () => {
    const raw = Buffer.from('{"hello":"world"}');
    expect(canonicalBodyBytes({ rawBody: raw }).equals(raw)).toBe(true);
  });

  it('utf-8-encodes a string rawBody', () => {
    expect(canonicalBodyBytes({ rawBody: '{"foo":"bar"}' }).toString('utf8')).toBe('{"foo":"bar"}');
  });

  it('stringifies an object body (Firebase v2 default after body-parser)', () => {
    const obj = { resource: 'event', type: 'payment.paid', id: 'x' };
    expect(canonicalBodyBytes({ body: obj }).toString('utf8')).toBe(
      '{"resource":"event","type":"payment.paid","id":"x"}'
    );
  });

  it('passes a string body through verbatim', () => {
    expect(canonicalBodyBytes({ body: 'id=tr_123' }).toString('utf8')).toBe('id=tr_123');
  });

  it('returns an empty buffer when both body and rawBody are missing', () => {
    expect(canonicalBodyBytes({}).length).toBe(0);
    expect(canonicalBodyBytes({ body: null }).length).toBe(0);
  });
});

describe('parseWebhookBody', () => {
  it('parses the classic form-urlencoded body (`id=tr_123`)', () => {
    expect(parseWebhookBody('id=tr_123')).toEqual({
      format: 'classic',
      id: 'tr_123',
    });
  });

  it('parses the classic JSON body (`{resource:"payment",id:"tr_123"}`)', () => {
    expect(parseWebhookBody({ resource: 'payment', id: 'tr_123' })).toEqual({
      format: 'classic',
      id: 'tr_123',
    });
  });

  it('parses a Next-gen payment.paid event and surfaces the embedded payment', () => {
    const body = {
      resource: 'event',
      id: 'event_abc',
      type: 'payment.paid',
      entityId: 'tr_001',
      _embedded: {
        entity: {
          id: 'tr_001',
          status: 'paid',
          amount: { value: '20.00', currency: 'EUR' },
          metadata: { displayOnConsent: true, donorName: 'Anna' },
        },
      },
    };
    expect(parseWebhookBody(body)).toEqual({
      format: 'next-gen',
      type: 'payment.paid',
      eventId: 'event_abc',
      payment: body._embedded.entity,
    });
  });

  it('returns a Next-gen event with payment=null for non-payment.paid events', () => {
    const body = {
      resource: 'event',
      id: 'event_xyz',
      type: 'payment.failed',
      _embedded: { entity: { id: 'tr_001' } },
    };
    expect(parseWebhookBody(body)).toEqual({
      format: 'next-gen',
      type: 'payment.failed',
      eventId: 'event_xyz',
      payment: null,
    });
  });

  it('flags garbage bodies as unknown', () => {
    expect(parseWebhookBody(null)).toEqual({ format: 'unknown', reason: 'unrecognised-body' });
    expect(parseWebhookBody(undefined)).toEqual({ format: 'unknown', reason: 'unrecognised-body' });
    expect(parseWebhookBody(42)).toEqual({ format: 'unknown', reason: 'unrecognised-body' });
    expect(parseWebhookBody('')).toEqual({ format: 'unknown', reason: 'missing-id' });
    expect(parseWebhookBody({})).toEqual({ format: 'unknown', reason: 'unrecognised-body' });
  });
});

describe('donorIdForPayment', () => {
  it('uses subscriptionId when present (idempotency by subscription)', () => {
    expect(donorIdForPayment('tr_001', 'sub_xyz')).toBe('donor_mollie_sub_sub_xyz');
  });

  it('falls back to paymentId when no subscription', () => {
    expect(donorIdForPayment('tr_001', null)).toBe('donor_mollie_tr_001');
    expect(donorIdForPayment('tr_001')).toBe('donor_mollie_tr_001');
  });
});

describe('handlePaidPayment', () => {
  function basePayment(overrides = {}) {
    return {
      id: 'tr_001',
      status: 'paid',
      amount: { value: '20.00', currency: 'EUR' },
      subscriptionId: null,
      sequenceType: 'one-off',
      metadata: { displayOnConsent: true, donorName: 'Anna' },
      ...overrides,
    };
  }

  it('writes a named donor when displayOnConsent=true and a name is given (CXxscjhl)', async () => {
    const { db, setCalls } = makeDb();
    const result = await handlePaidPayment({
      db,
      payment: basePayment({ metadata: { displayOnConsent: true, donorName: 'Anna' } }),
    });
    expect(result).toEqual({ written: true });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].data).toMatchObject({
      name: 'Anna',
      amount: 20,
      frequency: 'one-time',
      source: 'mollie',
      mollieConsent: true,
      molliePaymentId: 'tr_001',
      mollieSubscriptionId: null,
    });
    expect(setCalls[0].options).toEqual({ merge: false });
  });

  it('writes an anonymous donor with amount when displayOnConsent=true but name is empty (CXxscjhl)', async () => {
    const { db, setCalls } = makeDb();
    const result = await handlePaidPayment({
      db,
      payment: basePayment({ metadata: { displayOnConsent: true } }),
    });
    expect(result).toEqual({ written: true });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].data).toMatchObject({
      name: null,
      amount: 20,
      frequency: 'one-time',
      source: 'mollie',
    });
  });

  it('skips when displayOnConsent=false', async () => {
    const { db, setCalls } = makeDb();
    const result = await handlePaidPayment({
      db,
      payment: basePayment({ metadata: { displayOnConsent: false, donorName: 'Anna' } }),
    });
    expect(result).toEqual({ written: false, reason: 'no-consent' });
    expect(setCalls).toHaveLength(0);
  });

  it('skips when the payment status is not paid/authorized', async () => {
    const { db, setCalls } = makeDb();
    const result = await handlePaidPayment({
      db,
      payment: basePayment({ status: 'failed' }),
    });
    expect(result).toEqual({ written: false, reason: 'status:failed' });
    expect(setCalls).toHaveLength(0);
  });

  it('skips a non-EUR payment', async () => {
    const { db, setCalls } = makeDb();
    const result = await handlePaidPayment({
      db,
      payment: basePayment({ amount: { value: '20.00', currency: 'USD' } }),
    });
    expect(result).toEqual({ written: false, reason: 'wrong-currency' });
    expect(setCalls).toHaveLength(0);
  });

  it('marks monthly frequency for the FIRST subscription payment', async () => {
    const { db, setCalls } = makeDb();
    await handlePaidPayment({
      db,
      payment: basePayment({
        sequenceType: 'first',
        subscriptionId: 'sub_xyz',
        metadata: { displayOnConsent: true, donorName: 'Bob' },
      }),
    });
    expect(setCalls[0].data).toMatchObject({
      name: 'Bob',
      frequency: 'monthly',
      mollieSubscriptionId: 'sub_xyz',
    });
  });

  it('marks monthly frequency for RECURRING subscription payments too', async () => {
    const { db, setCalls } = makeDb();
    await handlePaidPayment({
      db,
      payment: basePayment({
        sequenceType: 'recurring',
        subscriptionId: 'sub_xyz',
        metadata: { displayOnConsent: true, donorName: 'Bob' },
      }),
    });
    expect(setCalls[0].data).toMatchObject({
      frequency: 'monthly',
    });
  });

  it('is idempotent: writing twice for the same subscription overwrites the same donor doc', async () => {
    const initial = {
      donor_mollie_sub_sub_xyz: { order: 100, createdAt: 'preset' },
    };
    const { db, setCalls } = makeDb(initial);
    await handlePaidPayment({
      db,
      payment: basePayment({
        sequenceType: 'recurring',
        subscriptionId: 'sub_xyz',
        metadata: { displayOnConsent: true, donorName: 'Bob' },
      }),
    });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].data).toMatchObject({ order: 100, createdAt: 'preset' });
  });

  it('stores the cleaned comment from the payment metadata', async () => {
    const { db, setCalls } = makeDb();
    await handlePaidPayment({
      db,
      payment: basePayment({
        metadata: { displayOnConsent: true, donorName: 'Anna', comment: ' <i>Danke</i>\neuch! ' },
      }),
    });
    expect(setCalls[0].data).toMatchObject({ comment: 'Danke euch!', note: null });
  });

  it('stores no comment without consent', async () => {
    const { db, setCalls } = makeDb();
    const result = await handlePaidPayment({
      db,
      payment: basePayment({ metadata: { displayOnConsent: false, comment: 'Hallo' } }),
    });
    expect(result).toEqual({ written: false, reason: 'no-consent' });
    expect(setCalls).toHaveLength(0);
  });

  it('keeps a comment and note an admin changed or deleted when Mollie resends the webhook', async () => {
    const { db, setCalls } = makeDb({
      donor_mollie_tr_001: { order: 0, createdAt: 'preset', comment: null, note: 'intern' },
    });
    await handlePaidPayment({
      db,
      payment: basePayment({
        metadata: { displayOnConsent: true, donorName: 'Anna', comment: 'Original' },
      }),
    });
    expect(setCalls[0].data).toMatchObject({ comment: null, note: 'intern' });
  });

  it('stores the region of the donation from the payment metadata', async () => {
    const { db, setCalls } = makeDb();
    await handlePaidPayment({
      db,
      payment: basePayment({
        metadata: { displayOnConsent: true, donorName: 'Anna', regionId: 'tirol' },
      }),
    });
    expect(setCalls[0].data).toMatchObject({ regionId: 'tirol' });
  });

  it('falls back to Vorarlberg without a known region in the metadata', async () => {
    for (const regionId of [undefined, 'atlantis', 42]) {
      const { db, setCalls } = makeDb();
      await handlePaidPayment({
        db,
        payment: basePayment({ metadata: { displayOnConsent: true, regionId } }),
      });
      expect(setCalls[0].data).toMatchObject({ regionId: 'vorarlberg' });
    }
  });

  it('keeps the stored region on a later write (an admin may have moved the donor)', async () => {
    const { db, setCalls } = makeDb({
      donor_mollie_sub_sub_1: { order: 0, createdAt: 'preset', regionId: 'wien' },
    });
    await handlePaidPayment({
      db,
      payment: basePayment({
        subscriptionId: 'sub_1',
        sequenceType: 'first',
        metadata: { displayOnConsent: true, regionId: 'tirol' },
      }),
    });
    expect(setCalls[0].data).toMatchObject({ regionId: 'wien' });
  });
});

describe('donationRegionId', () => {
  it('accepts known region ids only', () => {
    expect(donationRegionId('steiermark')).toBe('steiermark');
    expect(donationRegionId('oesterreich')).toBe('vorarlberg');
    expect(donationRegionId(null)).toBe('vorarlberg');
  });
});

describe('sanitizeDonorComment', () => {
  it.each([
    [undefined, null],
    [42, null],
    ['   ', null],
    ['<script>x</script>', 'x'],
    ['a\u0000b\u202Ec\td', 'a b c d'],
    ['1 < 2 > 0', '1 2 0'],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeDonorComment(input)).toBe(expected);
  });

  it('cuts to 140 characters without splitting an emoji', () => {
    expect(sanitizeDonorComment('x'.repeat(300))).toHaveLength(140);
    const cut = sanitizeDonorComment('x'.repeat(139) + '😀');
    expect(cut).toBe('x'.repeat(139));
  });
});

describe('processMollieWebhook — Next-gen', () => {
  it('writes a donor from an embedded payment.paid event without fetching (CXxscjhl)', async () => {
    const { db, setCalls } = makeDb();
    const fetchPayment = vi.fn();

    const result = await processMollieWebhook({
      body: {
        format: 'next-gen',
        type: 'payment.paid',
        eventId: 'event_001',
        payment: {
          id: 'tr_001',
          status: 'paid',
          amount: { value: '15.00', currency: 'EUR' },
          subscriptionId: null,
          sequenceType: 'one-off',
          metadata: { displayOnConsent: true, donorName: 'Carla' },
        },
      },
      fetchPayment,
      db,
    });

    expect(result).toEqual({ status: 200, body: { received: true, written: true } });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].data).toMatchObject({ name: 'Carla', amount: 15 });
    expect(fetchPayment).not.toHaveBeenCalled();
  });

  it('skips the recurring continuation payment of a subscription', async () => {
    const { db, setCalls } = makeDb();
    const result = await processMollieWebhook({
      body: {
        format: 'next-gen',
        type: 'payment.paid',
        eventId: 'event_002',
        payment: {
          id: 'tr_rec_001',
          status: 'paid',
          amount: { value: '10.00', currency: 'EUR' },
          subscriptionId: 'sub_x',
          sequenceType: 'recurring',
          metadata: { displayOnConsent: true, donorName: 'Dave' },
        },
      },
      db,
    });

    expect(result).toEqual({
      status: 200,
      body: { received: true, action: 'skip-recurring' },
    });
    expect(setCalls).toHaveLength(0);
  });

  it('writes a donor for the FIRST subscription payment (sequenceType=first)', async () => {
    const { db, setCalls } = makeDb();
    const fetchCustomer = vi.fn(async () => ({
      id: 'cst_x',
      name: 'Greta',
      metadata: { displayOnConsent: true, donorName: 'Greta' },
    }));
    const result = await processMollieWebhook({
      body: {
        format: 'next-gen',
        type: 'payment.paid',
        eventId: 'event_003',
        payment: {
          id: 'tr_first_001',
          status: 'paid',
          amount: { value: '12.00', currency: 'EUR' },
          subscriptionId: 'sub_x',
          sequenceType: 'first',
          customerId: 'cst_x',
          metadata: {},
        },
      },
      fetchCustomer,
      db,
    });

    expect(result).toEqual({ status: 200, body: { received: true, written: true } });
    expect(fetchCustomer).toHaveBeenCalledWith('cst_x');
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].data).toMatchObject({
      name: 'Greta',
      amount: 12,
      frequency: 'monthly',
      mollieSubscriptionId: 'sub_x',
      molliePaymentId: 'tr_first_001',
    });
  });

  it('200-acks non-payment.paid events without writing', async () => {
    const { db, setCalls } = makeDb();
    const result = await processMollieWebhook({
      body: {
        format: 'next-gen',
        type: 'payment.failed',
        eventId: 'event_004',
        payment: null,
      },
      db,
    });

    expect(result).toEqual({
      status: 200,
      body: { received: true, action: 'ignored', reason: 'payment.failed' },
    });
    expect(setCalls).toHaveLength(0);
  });
});

describe('processMollieWebhook — Classic', () => {
  it('fetches the payment by id and writes the donor', async () => {
    const { db, setCalls } = makeDb();
    const fetchPayment = vi.fn(async () => ({
      id: 'tr_001',
      status: 'paid',
      amount: { value: '15.00', currency: 'EUR' },
      subscriptionId: null,
      sequenceType: 'one-off',
      metadata: { displayOnConsent: true, donorName: 'Eve' },
    }));

    const result = await processMollieWebhook({
      body: { format: 'classic', id: 'tr_001' },
      fetchPayment,
      db,
    });

    expect(result).toEqual({ status: 200, body: { received: true, written: true } });
    expect(fetchPayment).toHaveBeenCalledWith('tr_001');
    expect(setCalls[0].data).toMatchObject({ name: 'Eve' });
  });

  it('returns 500 when the classic fetch throws', async () => {
    const { db } = makeDb();
    const fetchPayment = vi.fn(async () => {
      throw new Error('mollie down');
    });
    const result = await processMollieWebhook({
      body: { format: 'classic', id: 'tr_001' },
      fetchPayment,
      db,
    });
    expect(result.status).toBe(500);
  });

  it('returns 200 for an unpaid payment and writes nothing', async () => {
    const { db, setCalls } = makeDb();
    const fetchPayment = vi.fn(async () => ({
      id: 'tr_001',
      status: 'failed',
      amount: { value: '15.00', currency: 'EUR' },
      subscriptionId: null,
      sequenceType: 'one-off',
      metadata: { displayOnConsent: true, donorName: 'Frank' },
    }));
    const result = await processMollieWebhook({
      body: { format: 'classic', id: 'tr_001' },
      fetchPayment,
      db,
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ received: true, action: 'ignored' });
    expect(setCalls).toHaveLength(0);
  });
});

describe('processMollieWebhook — input validation', () => {
  it('returns 400 for an unknown body shape', async () => {
    const result = await processMollieWebhook({
      body: { format: 'unknown', reason: 'unrecognised-body' },
      db: { collection: () => undefined },
    });
    expect(result.status).toBe(400);
  });

  it('returns 400 for a classic body missing the id', async () => {
    // @ts-expect-error – forcing the unsafe input to verify the guard
    const result = await processMollieWebhook({
      body: { format: 'classic', id: null },
      db: { collection: () => undefined },
    });
    expect(result.status).toBe(400);
  });
});

describe('processMollieWebhook — first payment of a monthly donation', () => {
  const firstPayment = () => ({
    id: 'tr_first',
    status: 'paid',
    amount: { value: '15.00', currency: 'EUR' },
    sequenceType: 'first',
    customerId: 'cst_1',
    mandateId: 'mdt_1',
    paidAt: '2026-10-28T10:00:00+00:00',
    webhookUrl: 'https://www.thetribe.at/mollieWebhook',
    metadata: { donationType: 'monthly', displayOnConsent: true, donorName: 'Greta' },
  });

  it('creates the subscription after the first payment is paid and records a monthly donor', async () => {
    const { db, setCalls } = makeDb();
    const ensureSubscription = vi.fn(async () => ({ id: 'sub_1' }));
    const result = await processMollieWebhook({
      body: { format: 'next-gen', type: 'payment.paid', eventId: 'ev', payment: firstPayment() },
      ensureSubscription,
      db,
    });

    expect(result).toEqual({ status: 200, body: { received: true, written: true } });
    expect(ensureSubscription).toHaveBeenCalledWith({
      customerId: 'cst_1',
      amount: '15.00',
      startDate: '2026-11-28',
      firstPaymentId: 'tr_first',
      mandateId: 'mdt_1',
      webhookUrl: 'https://www.thetribe.at/mollieWebhook',
    });
    expect(setCalls[0].data).toMatchObject({ frequency: 'monthly', mollieSubscriptionId: 'sub_1' });
  });

  it('reports to the Verwaltung and asks Mollie to retry when the subscription cannot be created', async () => {
    const { db, setCalls } = makeDb();
    const reportFailure = vi.fn(async () => {});
    const result = await processMollieWebhook({
      body: { format: 'next-gen', type: 'payment.paid', eventId: 'ev', payment: firstPayment() },
      ensureSubscription: vi.fn(async () => {
        throw new Error('Mollie /customers/cst_1/subscriptions 422: No mandate');
      }),
      reportFailure,
      db,
    });

    expect(result.status).toBe(500);
    expect(setCalls).toHaveLength(0);
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'abo-anlegen',
        ids: { customer: 'cst_1', payment: 'tr_first' },
        alertId: 'mollie_abo_tr_first',
      })
    );
  });

  it('does not create a subscription for a one-time donation', async () => {
    const { db } = makeDb();
    const ensureSubscription = vi.fn();
    await processMollieWebhook({
      body: {
        format: 'next-gen',
        type: 'payment.paid',
        eventId: 'ev',
        payment: {
          id: 'tr_once',
          status: 'paid',
          amount: { value: '20.00', currency: 'EUR' },
          sequenceType: 'oneoff',
          metadata: { displayOnConsent: true, donorName: 'Max' },
        },
      },
      ensureSubscription,
      db,
    });
    expect(ensureSubscription).not.toHaveBeenCalled();
  });
});

describe('subscriptionStartDate', () => {
  it('starts one month after the first payment', () => {
    expect(subscriptionStartDate(new Date('2026-10-28T10:00:00Z'))).toBe('2026-11-28');
    expect(subscriptionStartDate(new Date('2026-12-15T10:00:00Z'))).toBe('2027-01-15');
  });

  it('clamps to the end of a shorter next month', () => {
    expect(subscriptionStartDate(new Date('2027-01-31T10:00:00Z'))).toBe('2027-02-28');
    expect(subscriptionStartDate(new Date('2028-01-31T10:00:00Z'))).toBe('2028-02-29');
  });
});

describe('ledger mirror', () => {
  function makeLedgerDb(existing: Record<string, Record<string, unknown>> = {}) {
    const writes: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [];
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          async get() {
            const fields = name === 'ledger' ? existing[id] : undefined;
            return makeSnapshot(Boolean(fields), fields ?? {});
          },
          async set(data: Record<string, unknown>) {
            writes.push({ collection: name, id, data });
          },
        }),
        orderBy: () => ({ limit: () => ({ get: async () => makeSnapshot(false, {}, []) }) }),
      }),
    };
    return { db, writes };
  }

  const paid = (over = {}) => ({
    id: 'tr_ledger',
    status: 'paid',
    amount: { value: '25.00', currency: 'EUR' },
    paidAt: '2026-10-28T23:30:00Z',
    metadata: {},
    ...over,
  });

  it('books a one-off donation without display consent as income', async () => {
    const { db, writes } = makeLedgerDb();
    const r = await recordLedgerIncome({ db, payment: paid() });
    expect(r.written).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].collection).toBe('ledger');
    expect(writes[0].id).toBe(ledgerIdForPayment('tr_ledger'));
    expect(writes[0].data).toMatchObject({
      type: 'income',
      amount: 25,
      // 23:30 UTC is already the next day in Vienna
      date: '2026-10-29',
      description: 'Spende via Mollie (einmalig)',
      category: 'Spenden',
      source: 'mollie',
      molliePaymentId: 'tr_ledger',
    });
  });

  it('labels recurring payments as monthly', async () => {
    const { db, writes } = makeLedgerDb();
    await recordLedgerIncome({
      db,
      payment: paid({ sequenceType: 'recurring', subscriptionId: 'sub_1' }),
    });
    expect(writes[0].data.description).toBe('Spende via Mollie (monatlich)');
  });

  it('never overwrites an entry that already exists (admin edits survive retries)', async () => {
    const { db, writes } = makeLedgerDb({ [ledgerIdForPayment('tr_ledger')]: { amount: 20 } });
    const r = await recordLedgerIncome({ db, payment: paid() });
    expect(r).toEqual({ written: false, reason: 'exists' });
    expect(writes).toHaveLength(0);
  });

  it('ignores unpaid, non-EUR and zero payments', async () => {
    const { db, writes } = makeLedgerDb();
    await recordLedgerIncome({ db, payment: paid({ status: 'open' }) });
    await recordLedgerIncome({ db, payment: paid({ amount: { value: '5.00', currency: 'USD' } }) });
    await recordLedgerIncome({ db, payment: paid({ amount: { value: '0.00', currency: 'EUR' } }) });
    expect(writes).toHaveLength(0);
  });

  it('does not throw when the books fail, and reports the error', async () => {
    const onError = vi.fn();
    const db = {
      collection: () => {
        throw new Error('firestore down');
      },
    };
    const r = await recordLedgerIncome({ db, payment: paid(), onError });
    expect(r).toEqual({ written: false, reason: 'error' });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('webhook answer and donor entry are unchanged, recurring payments are booked too', async () => {
    const { db, writes } = makeLedgerDb();
    const recurring = await processMollieWebhook({
      body: {
        format: 'next-gen',
        type: 'payment.paid',
        eventId: 'ev',
        payment: paid({ id: 'tr_rec', sequenceType: 'recurring', subscriptionId: 'sub_9' }),
      },
      db,
    });
    expect(recurring).toEqual({
      status: 200,
      body: { received: true, action: 'skip-recurring' },
    });
    expect(writes.map((w) => w.collection)).toEqual(['ledger']);

    const consent = await processMollieWebhook({
      body: {
        format: 'next-gen',
        type: 'payment.paid',
        eventId: 'ev2',
        payment: paid({
          id: 'tr_one',
          sequenceType: 'oneoff',
          metadata: { displayOnConsent: true, donorName: 'Max' },
        }),
      },
      db,
    });
    expect(consent).toEqual({ status: 200, body: { received: true, written: true } });
    expect(writes.map((w) => w.collection).sort()).toEqual(['donors', 'ledger', 'ledger']);
  });

  it('keeps the webhook working when the ledger write fails', async () => {
    const { db: base, writes } = makeLedgerDb();
    const db = {
      collection: (name: string) => {
        if (name === 'ledger') throw new Error('ledger broken');
        return base.collection(name);
      },
    };
    const r = await processMollieWebhook({
      body: {
        format: 'next-gen',
        type: 'payment.paid',
        eventId: 'ev3',
        payment: paid({ id: 'tr_x', metadata: { displayOnConsent: true, donorName: 'Max' } }),
      },
      db,
    });
    expect(r).toEqual({ status: 200, body: { received: true, written: true } });
    expect(writes.map((w) => w.collection)).toEqual(['donors']);
  });
});

describe('viennaDateString', () => {
  it('uses the Vienna calendar day', () => {
    expect(viennaDateString(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(viennaDateString(new Date('2026-07-01T10:00:00Z'))).toBe('2026-07-01');
  });
});
