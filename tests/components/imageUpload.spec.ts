import { describe, it, expect } from 'vitest';
import { validateAspectRatio, getAspectRatioRecommendation } from '../../src/lib/imageUpload';

describe('imageUpload', () => {
  describe('validateAspectRatio', () => {
    it('always returns true - all images are accepted', () => {
      expect(validateAspectRatio(1920, 1080)).toBe(true);
      expect(validateAspectRatio(1080, 1920)).toBe(true);
      expect(validateAspectRatio(1000, 1000)).toBe(true);
      expect(validateAspectRatio(500, 500)).toBe(true);
      expect(validateAspectRatio(0, 0)).toBe(true);
    });
  });

  describe('getAspectRatioRecommendation', () => {
    const LANDSCAPE_RATIO = 16 / 9;
    const PORTRAIT_RATIO = 9 / 16;
    const TOLERANCE = 0.1;

    const landscapeMin = LANDSCAPE_RATIO * (1 - TOLERANCE);
    const landscapeMax = LANDSCAPE_RATIO * (1 + TOLERANCE);
    const portraitMin = PORTRAIT_RATIO * (1 - TOLERANCE);
    const portraitMax = PORTRAIT_RATIO * (1 + TOLERANCE);

    it('returns isRecommended: true for 16:9 landscape images', () => {
      const result = getAspectRatioRecommendation(1920, 1080);
      expect(result.isRecommended).toBe(true);
      expect(result.ratio).toBeCloseTo(LANDSCAPE_RATIO);
    });

    it('returns isRecommended: true for 9:16 portrait images', () => {
      const result = getAspectRatioRecommendation(1080, 1920);
      expect(result.isRecommended).toBe(true);
      expect(result.ratio).toBeCloseTo(PORTRAIT_RATIO);
    });

    it('returns isRecommended: true for 16:9 at lower tolerance boundary', () => {
      const width = 1920;
      const height = Math.round(width / landscapeMin);
      const result = getAspectRatioRecommendation(width, height);
      expect(result.isRecommended).toBe(true);
    });

    it('returns isRecommended: true for 16:9 at upper tolerance boundary', () => {
      const width = 1920;
      const height = Math.round(width / landscapeMax);
      const result = getAspectRatioRecommendation(width, height);
      expect(result.isRecommended).toBe(true);
    });

    it('returns isRecommended: true for 9:16 at lower tolerance boundary', () => {
      const height = 1920;
      const width = Math.round(height * portraitMin);
      const result = getAspectRatioRecommendation(width, height);
      expect(result.isRecommended).toBe(true);
    });

    it('returns isRecommended: true for 9:16 at upper tolerance boundary', () => {
      const height = 1920;
      const width = Math.round(height * portraitMax);
      const result = getAspectRatioRecommendation(width, height);
      expect(result.isRecommended).toBe(true);
    });

    it('returns isRecommended: false for square images', () => {
      const result = getAspectRatioRecommendation(1000, 1000);
      expect(result.isRecommended).toBe(false);
      expect(result.ratio).toBe(1);
    });

    it('returns isRecommended: false for extreme landscape (banner)', () => {
      const result = getAspectRatioRecommendation(3000, 500);
      expect(result.isRecommended).toBe(false);
      expect(result.ratio).toBeCloseTo(6);
    });

    it('returns isRecommended: false for extreme portrait', () => {
      const result = getAspectRatioRecommendation(500, 3000);
      expect(result.isRecommended).toBe(false);
      expect(result.ratio).toBeCloseTo(0.167, 2);
    });

    it('returns isRecommended: true for 0x0 (edge case)', () => {
      const result = getAspectRatioRecommendation(0, 0);
      expect(result.isRecommended).toBe(true);
      expect(result.ratio).toBe(null);
    });

    it('returns ratio for non-zero dimensions', () => {
      const result = getAspectRatioRecommendation(1920, 1080);
      expect(result.ratio).toBeCloseTo(1.778, 2);
    });
  });
});
