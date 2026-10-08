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

export const MIN_IMAGE_ZOOM = 1;
export const MAX_IMAGE_ZOOM = 3;

export function normalizeImageZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MIN_IMAGE_ZOOM;
  return Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, n));
}

// Cover style: focal point via object-position, zoom as a scale about that
// same point so the chosen spot stays put. The wrappers clip the overflow.
export function coverImageStyle(point, zoom) {
  const base = focalPointToStyle(point);
  const z = normalizeImageZoom(zoom);
  if (z <= MIN_IMAGE_ZOOM) return base;
  const focal = normalizeFocalPoint(point) ?? DEFAULT_FOCAL_POINT;
  return {
    ...base,
    transform: `scale(${z})`,
    transformOrigin: `${focal.x * 100}% ${focal.y * 100}%`,
  };
}
