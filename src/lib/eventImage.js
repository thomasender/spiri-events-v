export const DEFAULT_FOCAL_POINT = { x: 0.5, y: 0.5 };

export function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function normalizeFocalPoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

export function isDefaultFocalPoint(point) {
  if (!point) return true;
  const dx = Math.abs((point.x ?? 0.5) - DEFAULT_FOCAL_POINT.x);
  const dy = Math.abs((point.y ?? 0.5) - DEFAULT_FOCAL_POINT.y);
  return dx < 1e-6 && dy < 1e-6;
}

export function focalPointToStyle(point) {
  const normalized = normalizeFocalPoint(point);
  if (!normalized) return undefined;
  return { objectPosition: `${normalized.x * 100}% ${normalized.y * 100}%` };
}

export function focalPointToPercentString(point) {
  const normalized = normalizeFocalPoint(point);
  if (!normalized) return '';
  return `${Math.round(normalized.x * 100)}% / ${Math.round(normalized.y * 100)}%`;
}
