import { describe, it, expect } from 'vitest';
import {
  clampFocal,
  clampZoom,
  dragFocalPoint,
  focalRange,
  pinchZoom,
  wheelZoom,
} from '../../src/lib/cropGesture';
import { coverImageStyle } from '../../src/lib/eventImage';

// 320x180 frame (16:9).
const frame = { frameWidth: 320, frameHeight: 180 };

describe('focalRange', () => {
  it('landscape photo wider than the frame: only x can move at zoom 1', () => {
    // 2000x900 covers 320x180 at scale 0.2 -> 400x180
    const r = focalRange({ ...frame, imageWidth: 2000, imageHeight: 900, zoom: 1 });
    expect(r.x).toBeCloseTo(80);
    expect(r.y).toBeCloseTo(0);
  });

  it('portrait photo: only y can move at zoom 1', () => {
    // 900x1200 covers at scale 320/900 -> 320x426.67
    const r = focalRange({ ...frame, imageWidth: 900, imageHeight: 1200, zoom: 1 });
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(246.67, 1);
  });

  it('photo with the frame ratio at zoom 1 cannot move; zoom opens both axes', () => {
    const still = focalRange({ ...frame, imageWidth: 1600, imageHeight: 900, zoom: 1 });
    expect(still).toEqual({ x: 0, y: 0 });
    const zoomed = focalRange({ ...frame, imageWidth: 1600, imageHeight: 900, zoom: 2 });
    expect(zoomed.x).toBeCloseTo(320);
    expect(zoomed.y).toBeCloseTo(180);
  });

  it('returns zeros for unknown sizes', () => {
    expect(focalRange({ ...frame, imageWidth: 0, imageHeight: 0, zoom: 1 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('dragFocalPoint', () => {
  const landscape = { ...frame, imageWidth: 2000, imageHeight: 900, zoom: 1 };

  it('moves the focal point against the drag so the photo follows the finger 1:1', () => {
    // Full range is 80px: dragging 40px right shows more of the left side.
    const next = dragFocalPoint({ x: 0.5, y: 0.5 }, 40, 0, landscape);
    expect(next.x).toBeCloseTo(0);
    expect(next.y).toBe(0.5);
  });

  it('keeps a fixed axis untouched', () => {
    expect(dragFocalPoint({ x: 0.5, y: 0.3 }, 0, 50, landscape).y).toBe(0.3);
  });

  it('handles portrait photos on the y axis', () => {
    const portrait = { ...frame, imageWidth: 900, imageHeight: 1200, zoom: 1 };
    const next = dragFocalPoint({ x: 0.5, y: 0.5 }, 10, -123.335, portrait);
    expect(next.x).toBe(0.5);
    expect(next.y).toBeCloseTo(1, 2);
  });

  it('matches the rendered image: the pixel under the finger stays under it', () => {
    // Zoom 2 on a 1600x900 photo in a 320x180 frame: range 320 -> 100px = 0.3125.
    const geo = { ...frame, imageWidth: 1600, imageHeight: 900, zoom: 2 };
    const next = dragFocalPoint({ x: 0.5, y: 0.5 }, -100, 0, geo);
    expect(next.x).toBeCloseTo(0.8125);
    // The style that renders it uses the same focal point.
    expect(coverImageStyle(next, 2)?.objectPosition).toBe('81.25% 50%');
  });

  it('clamps to 0..1', () => {
    expect(dragFocalPoint({ x: 0.9, y: 0.5 }, -1000, 0, landscape).x).toBe(1);
    expect(dragFocalPoint({ x: 0.1, y: 0.5 }, 1000, 0, landscape).x).toBe(0);
  });
});

describe('pinchZoom and wheelZoom', () => {
  it('scales the zoom with the finger distance', () => {
    expect(pinchZoom(1.5, 100, 200)).toBeCloseTo(3);
    expect(pinchZoom(2, 100, 50)).toBeCloseTo(1);
  });

  it('clamps to the given bounds', () => {
    expect(pinchZoom(2, 100, 400)).toBe(3);
    expect(pinchZoom(2, 100, 10)).toBe(1);
    expect(pinchZoom(2, 100, 400, 1, 2.5)).toBe(2.5);
  });

  it('ignores a zero distance', () => {
    expect(pinchZoom(2, 0, 100)).toBe(2);
    expect(pinchZoom(2, 100, 0)).toBe(2);
  });

  it('zooms in when scrolling up and out when scrolling down', () => {
    expect(wheelZoom(1.5, -100)).toBeGreaterThan(1.5);
    expect(wheelZoom(1.5, 100)).toBeLessThan(1.5);
    expect(wheelZoom(1, 100)).toBe(1);
    expect(wheelZoom(3, -100)).toBe(3);
    expect(wheelZoom(2, NaN)).toBe(2);
  });
});

describe('defaults', () => {
  it('falls back to the centre and zoom 1 for garbage', () => {
    expect(clampFocal(null)).toEqual({ x: 0.5, y: 0.5 });
    expect(clampFocal({ x: 'a', y: 2 })).toEqual({ x: 0.5, y: 1 });
    expect(clampZoom(undefined)).toBe(1);
    expect(clampZoom(9)).toBe(3);
  });
});
