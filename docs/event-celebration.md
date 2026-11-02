# Event celebration (confetti)

Read this ONLY when you touch the confetti after submitting an event.

After an event was submitted successfully, confetti rains over the "Vielen Dank!" dialog.

- **Trigger:** `src/components/EventFormWizard.jsx` calls `useConfettiCelebration(successState !== null)`.
  It starts exactly when the `SuccessDialog` opens. Saving a draft (navigates straight to `/admin`)
  and editing an event (`EventForm.jsx`) show no confetti. Applies to all users including admins.
- **Implementation:** `src/hooks/useConfettiCelebration.js`. About 5 seconds (`CONFETTI_DURATION_MS`),
  then nothing is left on screen. Colors come from the theme variables (`--accent-primary`,
  `--accent-secondary`, `--accent-create-event`, `--heading-color`, `--category-teal`, `--sound-healing`).
- **Reduced motion:** with `prefers-reduced-motion: reduce` (e.g. macOS "Bewegung reduzieren",
  iOS "Bewegung reduzieren", Windows "Animationseffekte" off) there is deliberately no confetti and no
  fallback: the dialog with its check icon already confirms the submit, and the setting is an
  accessibility choice we respect.
- **Layering and clicks:** the canvas has `z-index: 2000` (dialog overlays use 1100) and
  `pointer-events: none`, so it never blocks clicks.
- **Cleanup:** on unmount (for example when the dialog navigates to `/admin`) the animation frame is
  cancelled and `confetti.reset()` removes the canvas.
- **Dependency:** `canvas-confetti` (+ `@types/canvas-confetti`), loaded lazily via `import()` on trigger.
- **No worker (CSP):** the hook draws through its own instance,
  `confetti.create(null, { resize: true, useWorker: false, disableForReducedMotion: true })`. Never call
  the library's default `confetti()`: it always hands the canvas to a `blob:` worker and ignores a
  per-call `useWorker: false`. The CSP (`script-src 'self'`, `firebase.json`) blocks that worker, so the
  canvas stays empty in production while the dev server (no CSP) shows confetti. That was bug R4axj5O1.
  No CSP change is needed.
- **Tests:** `tests/components/useConfettiCelebration.spec.tsx`, plus two cases in
  `tests/components/EventFormWizardProfileCta.spec.tsx`.
