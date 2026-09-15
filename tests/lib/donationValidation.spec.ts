import { describe, it, expect } from 'vitest';
import {
  MIN_DONATION_AMOUNT,
  DONATION_AMOUNT_PRESETS,
  isValidDonationAmount,
  parseDonationAmount,
} from '../../src/lib/donationValidation';

describe('donationValidation', () => {
  describe('MIN_DONATION_AMOUNT', () => {
    it('is €5.00 (filters out tiny one-off round-downs)', () => {
      expect(MIN_DONATION_AMOUNT).toBe(5.0);
    });
  });

  describe('DONATION_AMOUNT_PRESETS', () => {
    it('only contains values ≥ MIN_DONATION_AMOUNT', () => {
      for (const preset of DONATION_AMOUNT_PRESETS) {
        expect(preset).toBeGreaterThanOrEqual(MIN_DONATION_AMOUNT);
      }
    });
  });

  describe('parseDonationAmount', () => {
    it('returns a number as-is when finite', () => {
      expect(parseDonationAmount(10)).toBe(10);
      expect(parseDonationAmount(5.5)).toBe(5.5);
    });

    it('returns NaN for non-finite numbers', () => {
      expect(Number.isNaN(parseDonationAmount(Infinity))).toBe(true);
      expect(Number.isNaN(parseDonationAmount(NaN))).toBe(true);
    });

    it('parses comma decimal separator', () => {
      expect(parseDonationAmount('12,50')).toBe(12.5);
      expect(parseDonationAmount('7,5')).toBe(7.5);
    });

    it('parses dot decimal separator', () => {
      expect(parseDonationAmount('12.50')).toBe(12.5);
    });

    it('trims surrounding whitespace', () => {
      expect(parseDonationAmount('  20  ')).toBe(20);
    });

    it('returns NaN for empty strings or non-numeric input', () => {
      expect(Number.isNaN(parseDonationAmount(''))).toBe(true);
      expect(Number.isNaN(parseDonationAmount('   '))).toBe(true);
      expect(Number.isNaN(parseDonationAmount('abc'))).toBe(true);
      expect(Number.isNaN(parseDonationAmount(null))).toBe(true);
      expect(Number.isNaN(parseDonationAmount(undefined))).toBe(true);
    });
  });

  describe('isValidDonationAmount', () => {
    it('accepts values at or above the minimum', () => {
      expect(isValidDonationAmount(MIN_DONATION_AMOUNT)).toBe(true);
      expect(isValidDonationAmount(10)).toBe(true);
      expect(isValidDonationAmount(9999.99)).toBe(true);
    });

    it('rejects values below the minimum', () => {
      expect(isValidDonationAmount(0)).toBe(false);
      expect(isValidDonationAmount(MIN_DONATION_AMOUNT - 0.01)).toBe(false);
      expect(isValidDonationAmount(1.9)).toBe(false);
    });

    it('rejects non-finite and non-number values', () => {
      expect(isValidDonationAmount(NaN)).toBe(false);
      expect(isValidDonationAmount(Infinity)).toBe(false);
      expect(isValidDonationAmount('5')).toBe(false);
      expect(isValidDonationAmount(null)).toBe(false);
      expect(isValidDonationAmount(undefined)).toBe(false);
    });
  });
});
