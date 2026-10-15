// Progress towards opening a region on the coming-soon page. The goal is an
// internal number: visitors only ever see a percentage.
export const REGION_EVENT_GOAL = 30;

/** Whole percent (0-100) of the goal, rounded down so 100 means "really done". */
export function progressPercent(count, goal = REGION_EVENT_GOAL) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0 || goal <= 0) return 0;
  return Math.min(100, Math.floor((n / goal) * 100));
}
