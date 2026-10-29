// Pure maths for moving and zooming a crop by hand (mouse, touch, wheel).
// No React. The geometry is the one the tile, the event page and the server
// side Instagram crop use: the photo is "cover" fitted into the frame, shifted
// with `object-position: x% y%` and scaled by `zoom` about that same point
// (see coverImageStyle in eventImage.js, functions/src/instagram/instagramImage.ts).

const WHEEL_ZOOM_SPEED = 0.0015;
const MIN_RANGE = 1e-6;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function clampFocal(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return {
    x: Number.isFinite(x) ? clamp(x, 0, 1) : 0.5,
    y: Number.isFinite(y) ? clamp(y, 0, 1) : 0.5,
  };
}

export function clampZoom(value, min = 1, max = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return clamp(n, min, max);
}

/**
 * How many screen pixels the photo moves per unit of focal point, per axis.
 * The photo is cover-fitted (so it overflows the frame on one axis, or on both
 * when zoomed), then scaled by `zoom` about the focal point:
 *   range = zoom * coveredSize - frameSize
 * Zero means that axis cannot move.
 */
export function focalRange({ frameWidth, frameHeight, imageWidth, imageHeight, zoom = 1 }) {
  if (!(frameWidth > 0) || !(frameHeight > 0) || !(imageWidth > 0) || !(imageHeight > 0)) {
    return { x: 0, y: 0 };
  }
  const z = Math.max(1, zoom);
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  return {
    x: Math.max(0, z * imageWidth * scale - frameWidth),
    y: Math.max(0, z * imageHeight * scale - frameHeight),
  };
}

/**
 * New focal point after dragging by (dx, dy) screen pixels. The photo follows
 * the finger/mouse 1:1, so the focal point moves the other way. Axes that
 * cannot move (no overflow) keep their value.
 */
export function dragFocalPoint(point, dx, dy, geometry) {
  const start = clampFocal(point);
  const range = focalRange(geometry);
  return clampFocal({
    x: range.x > MIN_RANGE ? start.x - dx / range.x : start.x,
    y: range.y > MIN_RANGE ? start.y - dy / range.y : start.y,
  });
}

/** Zoom after a pinch: fingers twice as far apart = twice the zoom. */
export function pinchZoom(startZoom, startDistance, distance, min = 1, max = 3) {
  if (!(startDistance > 0) || !(distance > 0)) return clampZoom(startZoom, min, max);
  return clampZoom(startZoom * (distance / startDistance), min, max);
}

/** Zoom after a mouse wheel tick (deltaY < 0 = scroll up = zoom in). */
export function wheelZoom(zoom, deltaY, min = 1, max = 3) {
  if (!Number.isFinite(deltaY)) return clampZoom(zoom, min, max);
  return clampZoom(zoom * Math.exp(-deltaY * WHEEL_ZOOM_SPEED), min, max);
}
