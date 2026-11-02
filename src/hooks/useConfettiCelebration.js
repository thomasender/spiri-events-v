import { useEffect } from 'react';

export const CONFETTI_DURATION_MS = 5000;
const CONFETTI_Z_INDEX = 2000; // above the dialog overlays (z-index 1100)
const CONFETTI_PARTICLES_PER_FRAME = 3;
const CONFETTI_FALLBACK_COLORS = ['#c48e6a', '#667c62', '#e5a72e', '#a6a487', '#4a7572', '#6b568b'];
const CONFETTI_COLOR_VARIABLES = [
  '--accent-primary',
  '--accent-secondary',
  '--accent-create-event',
  '--heading-color',
  '--category-teal',
  '--sound-healing',
];

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return CONFETTI_COLOR_VARIABLES.map(
    (name, index) => styles.getPropertyValue(name).trim() || CONFETTI_FALLBACK_COLORS[index]
  );
}

/**
 * Lets confetti rain from the top for CONFETTI_DURATION_MS while `isActive` is true.
 * Loads canvas-confetti lazily, does nothing with reduced motion and cleans up on unmount.
 */
export function useConfettiCelebration(isActive) {
  useEffect(() => {
    if (!isActive || prefersReducedMotion()) return undefined;

    let isCancelled = false;
    let animationFrame = 0;
    let confetti = null;

    import('canvas-confetti').then((module) => {
      if (isCancelled) return;
      // An own instance, because the default one always draws in a blob: worker and ignores a
      // per-call `useWorker: false`. The CSP (script-src 'self') blocks that worker, so nothing
      // would be drawn in production.
      confetti = module.default.create(null, {
        resize: true,
        useWorker: false,
        disableForReducedMotion: true,
      });
      const colors = readThemeColors();
      const endTime = Date.now() + CONFETTI_DURATION_MS;

      const rain = () => {
        if (isCancelled || Date.now() >= endTime) return;
        confetti({
          particleCount: CONFETTI_PARTICLES_PER_FRAME,
          angle: 90,
          spread: 120,
          startVelocity: 20,
          origin: { x: Math.random(), y: -0.1 },
          colors,
          zIndex: CONFETTI_Z_INDEX,
        });
        animationFrame = requestAnimationFrame(rain);
      };
      rain();
    });

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animationFrame);
      confetti?.reset();
    };
  }, [isActive]);
}
