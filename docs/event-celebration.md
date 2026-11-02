# Event celebration (confetti)

Read this ONLY when you touch the confetti after submitting an event.

After an event was submitted successfully, confetti rains over the "Vielen Dank!" dialog.

- **Trigger:** `src/components/EventFormWizard.jsx` calls `useConfettiCelebration(successState !== null)`.
  It starts exactly when the `SuccessDialog` opens. Saving a draft (navigates straight to `/admin`)
  and editing an event (`EventForm.jsx`) show no confetti. Applies to all users including admins.
- **Implementation:** `src/hooks/useConfettiCelebration.js`. About 5 seconds (`CONFETTI_DURATION_MS`),
  then nothing is left on screen. Colors come from the theme variables (`--accent-primary`,
  `--accent-secondary`, `--accent-create-event`, `--heading-color`, `--category-teal`, `--sound-healing`).
- **Reduced motion:** with `prefers-reduced-motion: reduce` there is no confetti.
- **Layering and clicks:** the canvas has `z-index: 2000` (dialog overlays use 1100) and
  `pointer-events: none`, so it never blocks clicks.
- **Cleanup:** on unmount (for example when the dialog navigates to `/admin`) the animation frame is
  cancelled and `confetti.reset()` removes the canvas.
- **Dependency:** `canvas-confetti` (+ `@types/canvas-confetti`), loaded lazily via `import()` on trigger.
  `useWorker: false`, because the CSP (`script-src 'self'`, `firebase.json`) would block the blob worker;
  no CSP change is needed.
- **Tests:** `tests/components/useConfettiCelebration.spec.tsx`, plus two cases in
  `tests/components/EventFormWizardProfileCta.spec.tsx`.
