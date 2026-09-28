# Cloud Functions

Server-side backend for [tribe Vorarlberg](https://www.thetribe.at).
Powers the Mollie donation flow (one-time and recurring SEPA / card) and the
event-lifecycle notification emails.

## Endpoints

| Name                       | Type              | Purpose                                                                          |
| -------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| `createMolliePayment`      | HTTPS callable    | Creates a one-time Mollie payment and returns its checkout URL.                  |
| `createMollieSubscription` | HTTPS callable    | Creates a Mollie customer + monthly subscription and returns its checkout URL.   |
| `mollieWebhook`            | HTTPS request     | Receives `payment.paid` webhooks (Next-gen + Classic) and writes the donor list. |
| `onEventStatusChanged`     | Firestore trigger | Sends a notification email when an event transitions status.                     |
| `onAdminMessageCreated`    | Firestore trigger | Sends a notification email when an admin writes a change-request message.        |

The Mollie callables accept `{ amount: number, name?: string | null, displayOnConsent?: boolean }`.
`amount` must be a number of at least `5.00` EUR; larger values are accepted.
`displayOnConsent` (default `false`) controls whether the donation is added
to the public donor list on the "Über uns" page after a successful payment.

## Donor automation (Mollie webhook)

When a guest donates through `/spenden` (or the donation block on
`/ueber-uns`) and ticks the "namentlich auf der Über-uns-Seite erscheinen"
checkbox, the corresponding `donors/{donorId}` document is created
automatically once Mollie confirms the payment. The flow:

1. Callable `createMolliePayment` / `createMollieSubscription` writes
   `displayOnConsent` (and `donorName` for one-off payments) into the
   payment / customer `metadata`.
2. Mollie posts a Next-gen `payment.paid` event to `mollieWebhook`. One-off
   AND the FIRST payment of every monthly subscription fire this same event
   — there are no subscription events in the Next-gen webhook system.
3. The webhook verifies the `X-Mollie-Signature` HMAC-SHA256 header
   against the raw body (when `MOLLIE_WEBHOOK_SIGNING_SECRET` is set),
   reads the embedded payment, and writes a Firestore donor entry with
   `source: 'mollie'`. Idempotency is enforced via a stable
   `donor_mollie_<id>` document key so retries never duplicate.
4. The admin "Spender" tab treats Mollie-sourced entries identically to
   manual ones — admins can edit or delete them.

`mollieWebhook` is a plain HTTPS request handler (not a callable). The URL
to configure in the Mollie dashboard (Developers → Webhooks → New webhook)
is:

```
https://europe-west3-spirieventsvbg.cloudfunctions.net/mollieWebhook
```

Event type to subscribe to: **`payment.paid`**. That single event covers
both one-off and monthly subscription donations in the Next-gen webhook
system. Mollie's dashboard does not expose subscription-created events
anymore — the first subscription payment is signalled by the same
`payment.paid` event with `sequenceType: 'first'` and `subscriptionId`
populated on the embedded payment.

The dashboard also asks for a **signing secret**. Store whatever Mollie
generates (or set your own) as a Firebase Functions secret:

```bash
firebase functions:secrets:set MOLLIE_WEBHOOK_SIGNING_SECRET
```

When the secret is unset, the webhook accepts unsigned requests — fine
for local emulator testing, unsafe for production.

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
A local donation flow works end-to-end against the emulator when
`VITE_USE_EMULATORS=true` — after the test payment completes, the donor
appears under `donors/` in the Firestore emulator UI.

## Secrets

API keys are never read from the environment directly. They are bound as
Firebase Functions secrets and resolved at runtime:

```bash
firebase functions:secrets:set MOLLIE_API_KEY
firebase functions:secrets:set MOLLIE_WEBHOOK_SIGNING_SECRET   # recommended, see Donor automation section
firebase functions:secrets:set MAILGUN_API_KEY
firebase functions:secrets:set MAILGUN_DOMAIN
firebase functions:secrets:set MAILGUN_FROM
# Optional: a shared inbox that always receives "Neuer Event-Vorschlag" emails
# in addition to per-admin recipients from the admin_users collection.
firebase functions:secrets:set SUBMITTED_NOTIFICATION_INBOX
```

For local dev with `MAILGUN_DRY_RUN=true`, the Mailgun secrets can stay empty.

The deploy step (`.github/workflows/*` or local `npm run deploy`) requires
the Mollie secret to exist; otherwise both callable handlers return an
`unavailable` error to the client. The webhook signing secret is optional
in development but should always be set in production. The Mailgun secrets
are only required if `MAILGUN_DRY_RUN` is unset or `false`.

## CORS

Both Mollie callable endpoints declare `cors: ['https://www.thetribe.at', 'https://thetribe.at']`
so they can be invoked from the production origin. The Firebase Functions
emulator bypasses CORS locally. The Firestore triggers do not need CORS.
