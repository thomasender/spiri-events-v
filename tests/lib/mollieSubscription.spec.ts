import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ensureMollieSubscription,
  mollieRequest,
  startMollieSubscriptionCheckout,
} from '../../functions/src/mollie';
import { buildPaymentAlert } from '../../functions/src/paymentAlerts';

type FetchCall = { url: string; init: RequestInit };

function stubFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: FetchCall[] = [];
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = queue.shift() ?? { status: 500, body: {} };
      return {
        ok: next.status >= 200 && next.status < 300,
        status: next.status,
        text: async () => JSON.stringify(next.body),
      };
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('startMollieSubscriptionCheckout', () => {
  it('starts with a first payment for the customer instead of a subscription without mandate', async () => {
    const calls = stubFetch([
      {
        status: 201,
        body: {
          id: 'tr_first',
          status: 'open',
          _links: { checkout: { href: 'https://www.mollie.com/checkout/x', type: 'text/html' } },
        },
      },
    ]);

    const result = await startMollieSubscriptionCheckout('test_key', {
      customerId: 'cst_1',
      amount: 15,
      appBaseUrl: 'https://www.thetribe.at',
      name: 'Greta',
      displayOnConsent: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.mollie.com/v2/payments');
    expect(calls[0].url).not.toContain('/subscriptions');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      amount: { currency: 'EUR', value: '15.00' },
      customerId: 'cst_1',
      sequenceType: 'first',
      redirectUrl: 'https://www.thetribe.at/spenden/danke',
      webhookUrl: 'https://www.thetribe.at/mollieWebhook',
      metadata: { donationType: 'monthly', displayOnConsent: true, donorName: 'Greta' },
    });
    expect(result).toEqual({
      checkoutUrl: 'https://www.mollie.com/checkout/x',
      customerId: 'cst_1',
      paymentId: 'tr_first',
    });
  });
});

describe('ensureMollieSubscription', () => {
  const params = {
    customerId: 'cst_1',
    amount: '15.00',
    startDate: '2026-11-28',
    firstPaymentId: 'tr_first',
    mandateId: 'mdt_1',
    webhookUrl: 'https://www.thetribe.at/mollieWebhook',
  };

  it('creates a monthly subscription starting next month with the mandate', async () => {
    const calls = stubFetch([
      { status: 200, body: { _embedded: { subscriptions: [] } } },
      { status: 201, body: { id: 'sub_1', status: 'active' } },
    ]);

    await expect(ensureMollieSubscription('test_key', params)).resolves.toEqual({
      id: 'sub_1',
      created: true,
    });
    expect(calls[1].url).toBe('https://api.mollie.com/v2/customers/cst_1/subscriptions');
    expect(calls[1].init.method).toBe('POST');
    expect((calls[1].init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'sub-tr_first'
    );
    expect(JSON.parse(String(calls[1].init.body))).toMatchObject({
      amount: { currency: 'EUR', value: '15.00' },
      interval: '1 month',
      startDate: '2026-11-28',
      mandateId: 'mdt_1',
    });
  });

  it('does not create a second subscription when one already exists (webhook retry)', async () => {
    const calls = stubFetch([
      { status: 200, body: { _embedded: { subscriptions: [{ id: 'sub_1', status: 'active' }] } } },
    ]);
    await expect(ensureMollieSubscription('test_key', params)).resolves.toEqual({
      id: 'sub_1',
      created: false,
    });
    expect(calls).toHaveLength(1);
  });
});

describe('mollieRequest errors', () => {
  it('includes the Mollie `detail` and `field` instead of a bare status code', async () => {
    stubFetch([
      {
        status: 422,
        body: { status: 422, title: 'Unprocessable Entity', detail: 'No mandate', field: 'x' },
      },
    ]);
    await expect(mollieRequest('k', '/payments', { method: 'POST', body: {} })).rejects.toThrow(
      'Mollie /payments 422: No mandate (field: x)'
    );
  });
});

describe('buildPaymentAlert', () => {
  it('builds a new Verwaltung feedback entry with the raw error but no donor data', () => {
    const err = Object.assign(new Error('Mollie /payments 422: No mandate'), { status: 422 });
    const alert = buildPaymentAlert({
      step: 'monatliche-spende-start',
      error: err,
      amount: 15,
      pageUrl: 'https://www.thetribe.at/spenden',
    });
    expect(alert).toMatchObject({
      status: 'new',
      name: 'System: Zahlungen (Mollie)',
      pageUrl: 'https://www.thetribe.at/spenden',
    });
    expect(alert.description).toContain('Monatliche Spende');
    expect(alert.description).toContain('Mollie /payments 422: No mandate');
    expect(alert.description).toContain('15 EUR');
    expect(alert).not.toHaveProperty('email');
  });
});
