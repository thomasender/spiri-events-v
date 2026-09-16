# Cloud Functions

Server-side backend for [tribe Vorarlberg](https://events.thetribe.at).
Powers the Mollie donation flow (one-time and recurring SEPA / card) and the
event-lifecycle notification emails.

## Endpoints

| Name                       | Type              | Purpose                                                                        |
| -------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `createMolliePayment`      | HTTPS callable    | Creates a one-time Mollie payment and returns its checkout URL.                |
| `createMollieSubscription` | HTTPS callable    | Creates a Mollie customer + monthly subscription and returns its checkout URL. |
| `mollieWebhook`            | HTTPS callable    | Receives subscription / payment status updates from Mollie.                    |
| `onEventStatusChanged`     | Firestore trigger | Sends a notification email when an event transitions status.                   |
| `onAdminMessageCreated`    | Firestore trigger | Sends a notification email when an admin writes a change-request message.      |

The Mollie callables accept `{ amount: number, name?: string | null }`.
`amount` must be a number of at least `5.00` EUR; larger values are accepted.

## Notification emails

The two triggers cover the four lifecycle events:

| Event trigger                                      | Notification type   | Recipient                |
| -------------------------------------------------- | ------------------- | ------------------------ |
| `events/{id}` transitions to `pending`             | `submitted`         | All admins (Auth lookup) |
| `events/{id}` transitions to `approved`            | `published`         | Event owner              |
| `events/{id}` transitions to `trashed`             | `deleted`           | Event owner              |
| `events/{id}/messages/{msgId}` created, role=Admin | `changes_requested` | Event owner              |

When `MAILGUN_DRY_RUN=true` (see `.env.local`) the trigger logs the payload
instead of posting to Mailgun. This is the default for local development and
CI.

## Local development

```bash
cd functions
npm install
npm run build
firebase emulators:start --only functions
```

Copy `functions/.env.example` to `functions/.env.local` and set
`MAILGUN_DRY_RUN=true` to run the triggers without real Mailgun credentials.

The emulator exposes the callables at
`http://localhost:5001/spirieventsvbg/europe-west3/createMolliePayment` and
`http://localhost:5001/spirieventsvbg/europe-west3/createMollieSubscription`,
plus the webhook at
`http://localhost:5001/spirieventsvbg/europe-west3/mollieWebhook`. The
Firestore triggers are attached to the emulator automatically when both the
Firestore and Functions emulators are running.

For webhook testing use the [Mollie CLI](https://docs.mollie.com/reference/overview)
or the dashboard's "Test webhook" button. The emulator logs the payload.

## Secrets

API keys are never read from the environment directly. They are bound as
Firebase Functions secrets and resolved at runtime:

```bash
firebase functions:secrets:set MOLLIE_API_KEY
firebase functions:secrets:set MAILGUN_API_KEY
firebase functions:secrets:set MAILGUN_DOMAIN
firebase functions:secrets:set MAILGUN_FROM
```

For local dev with `MAILGUN_DRY_RUN=true`, the Mailgun secrets can stay empty.

The deploy step (`.github/workflows/*` or local `npm run deploy`) requires
the Mollie secret to exist; otherwise both callable handlers return an
`unavailable` error to the client. The Mailgun secrets are only required if
`MAILGUN_DRY_RUN` is unset or `false`.

## CORS

Both Mollie callable endpoints declare `cors: ['https://events.thetribe.at']`
so they can be invoked from the production origin. The Firebase Functions
emulator bypasses CORS locally. The Firestore triggers do not need CORS.
