import { describe, it, expect } from 'vitest';
import {
  CATEGORY_FALLBACKS,
  DEFAULT_EVENT_FALLBACK,
  getCategoryFallbackImage,
  getEventFallbackImage,
} from '../../src/utils/eventFallbacks';

describe('eventFallbacks', () => {
  describe('CATEGORY_FALLBACKS', () => {
    it('has a fallback for every category in KATEGORIEN', () => {
      const kategorien = ['Yoga', 'Meditation', 'Tanz', 'Singen', 'Atemarbeit', 'Sonstiges'];
      for (const cat of kategorien) {
        expect(CATEGORY_FALLBACKS[cat]).toBeTruthy();
        expect(CATEGORY_FALLBACKS[cat]).toMatch(/^\/event-fallbacks\//);
      }
    });
  });

  describe('getCategoryFallbackImage', () => {
    it('returns the mapped image for a known category', () => {
      expect(getCategoryFallbackImage('Yoga')).toBe('/event-fallbacks/yoga.jpg');
      expect(getCategoryFallbackImage('Meditation')).toBe('/event-fallbacks/meditation.jpg');
      expect(getCategoryFallbackImage('Tanz')).toBe('/event-fallbacks/tanz.jpg');
      expect(getCategoryFallbackImage('Singen')).toBe('/event-fallbacks/singen.png');
      expect(getCategoryFallbackImage('Atemarbeit')).toBe('/event-fallbacks/atemarbeit.jpg');
      expect(getCategoryFallbackImage('Sonstiges')).toBe('/event-fallbacks/sonstiges.svg');
    });

    it('falls back to the default for unknown categories', () => {
      expect(getCategoryFallbackImage('UnknownCategory')).toBe(DEFAULT_EVENT_FALLBACK);
    });

    it('falls back to the default for null/undefined input', () => {
      expect(getCategoryFallbackImage(null)).toBe(DEFAULT_EVENT_FALLBACK);
      expect(getCategoryFallbackImage(undefined)).toBe(DEFAULT_EVENT_FALLBACK);
      expect(getCategoryFallbackImage('')).toBe(DEFAULT_EVENT_FALLBACK);
    });
  });

  describe('getEventFallbackImage', () => {
    it('uses the first category of the event', () => {
      expect(getEventFallbackImage({ categories: ['Yoga', 'Tanz'] })).toBe(
        '/event-fallbacks/yoga.jpg'
      );
      expect(getEventFallbackImage({ categories: ['Meditation'] })).toBe(
        '/event-fallbacks/meditation.jpg'
      );
    });

    it('returns the default when the event has no categories', () => {
      expect(getEventFallbackImage({})).toBe(DEFAULT_EVENT_FALLBACK);
      expect(getEventFallbackImage({ categories: [] })).toBe(DEFAULT_EVENT_FALLBACK);
    });

    it('returns the default for null/undefined events', () => {
      expect(getEventFallbackImage(null)).toBe(DEFAULT_EVENT_FALLBACK);
      expect(getEventFallbackImage(undefined)).toBe(DEFAULT_EVENT_FALLBACK);
    });
  });
});
