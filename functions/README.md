# Cloud Functions

Server-side backend for [tribe Vorarlberg](https://events.thetribe.at).
Powers the Mollie donation flow (one-time and recurring SEPA / card).

## Endpoints

| Name                       | Type           | Purpose                                                                        |
| -------------------------- | -------------- | ------------------------------------------------------------------------------ |
| `createMolliePayment`      | HTTPS callable | Creates a one-time Mollie payment and returns its checkout URL.                |
| `createMollieSubscription` | HTTPS callable | Creates a Mollie customer + monthly subscription and returns its checkout URL. |
| `mollieWebhook`            | HTTPS callable | Receives subscription / payment status updates from Mollie.                    |

Both callable endpoints accept `{ amount: number, name?: string | null }`.
`amount` must be a number of at least `5.00` EUR; larger values are accepted.

## Local development

```bash
cd functions
npm install
npm run build
firebase emulators:start --only functions
```

The emulator exposes the callables at
`http://localhost:5001/spirieventsvbg/europe-west3/createMolliePayment` and
`http://localhost:5001/spirieventsvbg/europe-west3/createMollieSubscription`,
plus the webhook at
`http://localhost:5001/spirieventsvbg/europe-west3/mollieWebhook`.

For webhook testing use the [Mollie CLI](https://docs.mollie.com/reference/overview)
or the dashboard's "Test webhook" button. The emulator logs the payload.

## Secrets

The Mollie API key is never read from the environment directly. It is bound
as a Firebase Functions secret and resolved at runtime:

```bash
firebase functions:secrets:set MOLLIE_API_KEY
```

The deploy step (`.github/workflows/*` or local `npm run deploy`) requires
that secret to exist; otherwise both callable handlers return an `unavailable`
error to the client.

## CORS

Both callable endpoints declare `cors: ['https://events.thetribe.at']` so
they can be invoked from the production origin. The Firebase Functions
emulator bypasses CORS locally.
