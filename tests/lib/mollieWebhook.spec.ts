import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  parseWebhookBody,
  donorIdForPayment,
  handlePaidPayment,
  processMollieWebhook,
  verifyMollieSignature,
} from '../../src/lib/mollieWebhook';

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
