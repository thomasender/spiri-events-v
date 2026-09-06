import { describe, it, expect } from 'vitest';
import {
  normalizeCategoryInput,
  isValidCategoryInput,
  MAX_CATEGORY_LENGTH,
  MIN_CATEGORY_LENGTH,
} from '../../src/utils/categoryInput';

describe('normalizeCategoryInput', () => {
  it('capitalizes the first letter', () => {
    expect(normalizeCategoryInput('yoga')).toBe('Yoga');
    expect(normalizeCategoryInput('pilates')).toBe('Pilates');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeCategoryInput('  Qi Gong  ')).toBe('Qi Gong');
  });

  it('collapses internal whitespace runs', () => {
    expect(normalizeCategoryInput('Qi    Gong')).toBe('Qi Gong');
    expect(normalizeCategoryInput('Tai\tChi')).toBe('Tai Chi');
    expect(normalizeCategoryInput('A\nB')).toBe('A B');
  });

  it('returns empty string for empty/null/undefined input', () => {
    expect(normalizeCategoryInput('')).toBe('');
    expect(normalizeCategoryInput(null)).toBe('');
    expect(normalizeCategoryInput(undefined)).toBe('');
  });

  it('preserves umlauts and special characters', () => {
    expect(normalizeCategoryInput('bühnen-yoga')).toBe('Bühnen-yoga');
    expect(normalizeCategoryInput('äÖÜ')).toBe('ÄÖÜ');
  });

  it('does not change already-normalized input', () => {
    expect(normalizeCategoryInput('Yoga')).toBe('Yoga');
  });

  it('coerces non-string input', () => {
    expect(normalizeCategoryInput(123)).toBe('123');
  });
});

describe('isValidCategoryInput', () => {
  it('accepts valid normalized categories', () => {
    expect(isValidCategoryInput('Yoga')).toBe(true);
    expect(isValidCategoryInput('qi gong')).toBe(true);
    expect(isValidCategoryInput('  Pilates  ')).toBe(true);
  });

  it(`accepts categories up to ${MAX_CATEGORY_LENGTH} characters`, () => {
    const exactlyMax = 'a'.repeat(MAX_CATEGORY_LENGTH - 1) + 'A';
    expect(isValidCategoryInput(exactlyMax)).toBe(true);
  });

  it(`rejects categories longer than ${MAX_CATEGORY_LENGTH} characters`, () => {
    const tooLong = 'a'.repeat(MAX_CATEGORY_LENGTH) + 'A';
    expect(isValidCategoryInput(tooLong)).toBe(false);
  });

  it(`rejects categories shorter than ${MIN_CATEGORY_LENGTH} characters`, () => {
    expect(isValidCategoryInput('A')).toBe(false);
    expect(isValidCategoryInput('')).toBe(false);
    expect(isValidCategoryInput('   ')).toBe(false);
  });
});
