# App Check (reCAPTCHA)

**Read this when** you touch Firebase App Check, `appCheckOptions()` in a callable, the CSP
for reCAPTCHA or `ENFORCE_APP_CHECK`.

Firebase App Check lets Firestore, Storage and the callable Cloud Functions tell
requests from the real website apart from scripts. It is rolled out in steps
(see the Trello column "App Check (reCAPTCHA)"): code first and inert, then an
observation phase, then enforcement one product at a time in the Firebase
console.

- **Client:** `src/lib/appCheck.js`, called from `src/lib/firebase.js`. Active
  only with `VITE_RECAPTCHA_SITE_KEY` set, never with `VITE_USE_EMULATORS=true`,
  never in plain dev builds. Emulators and all tests are not checked.
  `VITE_RECAPTCHA_PROVIDER` is `enterprise` (default) or `v3`.
- **Site key in production:** the GitHub _variable_ `VITE_RECAPTCHA_SITE_KEY`
  (and optionally `VITE_RECAPTCHA_PROVIDER`), read by `deploy.yml` when it builds.
  It is public, not a secret. Empty variable = App Check off.
- **Local development against production:** put a debug token (Firebase console →
  App Check → Manage debug tokens) in `.env.local` as `VITE_APPCHECK_DEBUG_TOKEN`
  together with the site key. Never commit it.
- **Callable functions:** `functions/src/appCheck.ts`. Every browser-facing
  `onCall` spreads `...appCheckOptions()` into its options and calls
  `logMissingAppCheck(name, request)` first. Requests without a token are logged
  as "callable without app check". `ENFORCE_APP_CHECK` is `false`; setting it to
  `true` and deploying makes all of them reject requests without a valid token.
- **Never enforce** `mollieWebhook` (called by Mollie) or `calendarFeed`
  (token-protected iCalendar feed fetched by calendar apps, see below). `tests/lib/appCheck.spec.ts` guards this and
  fails if a new `onCall` forgets the helpers.
- **If the CSP changes:** reCAPTCHA needs `https://www.google.com/recaptcha/` and
  `https://www.gstatic.com/recaptcha/` in `script-src` and
  `https://www.google.com/recaptcha/` plus `https://recaptcha.google.com/recaptcha/`
  in `frame-src` (`firebase.json`, guarded by `tests/lib/hostingCsp.spec.ts`).
- **Users whose browser blocks reCAPTCHA** get a one-time banner
  (`AppCheckBanner`), triggered only by App Check's own token failure.
- **Rollback:** Firebase console → App Check → APIs → the product → "Not enforced"
  (takes effect in about 15 minutes). For functions, set `ENFORCE_APP_CHECK` back
  to `false` and deploy.
