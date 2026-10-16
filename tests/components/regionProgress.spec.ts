import { describe, expect, it } from 'vitest';
import { progressPercent } from '../../src/utils/regionProgress';

describe('progressPercent', () => {
  it('is a whole percent of the goal of 30, capped at 100', () => {
    expect(progressPercent(0)).toBe(0);
    expect(progressPercent(15)).toBe(50);
    expect(progressPercent(10)).toBe(33);
    expect(progressPercent(29)).toBe(96);
    expect(progressPercent(30)).toBe(100);
    expect(progressPercent(99)).toBe(100);
  });

  it('treats unknown or invalid counts as 0', () => {
    expect(progressPercent(null)).toBe(0);
    expect(progressPercent(undefined)).toBe(0);
    expect(progressPercent(-3)).toBe(0);
    expect(progressPercent(NaN)).toBe(0);
  });
});
