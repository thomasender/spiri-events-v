import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FOCAL_POINT,
  clamp01,
  focalPointToPercentString,
  focalPointToStyle,
  isDefaultFocalPoint,
  normalizeFocalPoint,
} from '../../src/lib/eventImage';

describe('eventImage helpers', () => {
  describe('clamp01', () => {
    it('clamps negatives to 0', () => {
      expect(clamp01(-0.5)).toBe(0);
    });
    it('clamps above 1', () => {
      expect(clamp01(1.7)).toBe(1);
    });
    it('passes through values inside the range', () => {
      expect(clamp01(0.42)).toBe(0.42);
    });
    it('treats NaN and non-numbers as 0.5', () => {
      expect(clamp01(NaN)).toBe(0.5);
      expect(clamp01(undefined)).toBe(0.5);
      expect(clamp01('not a number')).toBe(0.5);
    });
  });

  describe('normalizeFocalPoint', () => {
    it('returns null for missing or invalid input', () => {
      expect(normalizeFocalPoint(null)).toBeNull();
      expect(normalizeFocalPoint(undefined)).toBeNull();
      expect(normalizeFocalPoint({})).toBeNull();
      expect(normalizeFocalPoint({ x: 'bad' })).toBeNull();
    });
    it('clamps values outside the range', () => {
      expect(normalizeFocalPoint({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 });
    });
    it('passes through a valid point', () => {
      expect(normalizeFocalPoint({ x: 0.3, y: 0.7 })).toEqual({ x: 0.3, y: 0.7 });
    });
  });

  describe('isDefaultFocalPoint', () => {
    it('treats null/undefined as default', () => {
      expect(isDefaultFocalPoint(null)).toBe(true);
      expect(isDefaultFocalPoint(undefined)).toBe(true);
    });
    it('treats {0.5, 0.5} as default', () => {
      expect(isDefaultFocalPoint({ x: 0.5, y: 0.5 })).toBe(true);
      expect(isDefaultFocalPoint(DEFAULT_FOCAL_POINT)).toBe(true);
    });
    it('rejects anything else', () => {
      expect(isDefaultFocalPoint({ x: 0.4, y: 0.5 })).toBe(false);
      expect(isDefaultFocalPoint({ x: 0.5, y: 0.6 })).toBe(false);
    });
  });

  describe('focalPointToStyle', () => {
    it('returns undefined for missing point', () => {
      expect(focalPointToStyle(null)).toBeUndefined();
      expect(focalPointToStyle(undefined)).toBeUndefined();
    });
    it('emits object-position for a saved point', () => {
      expect(focalPointToStyle({ x: 0.25, y: 0.75 })).toEqual({
        objectPosition: '25% 75%',
      });
    });
    it('clamps out-of-range inputs', () => {
      expect(focalPointToStyle({ x: -0.1, y: 1.2 })).toEqual({
        objectPosition: '0% 100%',
      });
    });
    it('accepts the default center point (no-op rendering, harmless)', () => {
      expect(focalPointToStyle(DEFAULT_FOCAL_POINT)).toEqual({
        objectPosition: '50% 50%',
      });
    });
  });

  describe('focalPointToPercentString', () => {
    it('rounds and formats with % separator', () => {
      expect(focalPointToPercentString({ x: 0.345, y: 0.201 })).toBe('35% / 20%');
    });
    it('returns empty string for invalid point', () => {
      expect(focalPointToPercentString(null)).toBe('');
    });
  });
});
