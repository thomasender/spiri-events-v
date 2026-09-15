# Cloud Functions

Server-side backend for [tribe Vorarlberg](https://events.thetribe.at).
Currently exposes the donation flow via Mollie (recurring SEPA / card).

## Endpoints

| Name                       | Type                | Purpose                                                                |
| -------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `createMollieSubscription` | HTTPS callable      | Creates a Mollie customer + subscription and returns the checkout URL. |
| `mollieWebhook`            | HTTPS (public POST) | Receives subscription / payment status updates from Mollie.            |

## Local development

```bash
cd functions
npm install
npm run build
firebase emulators:start --only functions
```

The emulator exposes the callable at
`http://localhost:5001/spirieventsvbg/us-central1/createMollieSubscription`
and the webhook at
`http://localhost:5001/spirieventsvbg/us-central1/mollieWebhook`.

For webhook testing use the [Mollie CLI](https://docs.mollie.com/reference/overview)
or the dashboard's "Test webhook" button. The emulator logs the payload.

## Secrets

The Mollie API key is never read from the environment directly. It is bound
as a Firebase Functions secret and resolved at runtime:

```bash
firebase functions:secrets:set MOLLIE_API_KEY
```

The deploy step (`.github/workflows/*` or local `npm run deploy`) requires
that secret to exist; otherwise `createMollieSubscription` returns an
`unavailable` error to the client.
