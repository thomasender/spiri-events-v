import { describe, it, expect } from 'vitest';
import {
  validateFeedback,
  MAX_FEEDBACK_DESCRIPTION_LENGTH,
  MAX_FEEDBACK_NAME_LENGTH,
  MAX_FEEDBACK_EMAIL_LENGTH,
} from '../../src/hooks/useFeedback';

describe('validateFeedback', () => {
  describe('description', () => {
    it('rejects empty description', () => {
      const errors = validateFeedback({ description: '', name: '', email: '' });
      expect(errors.description).toBeTruthy();
    });

    it('rejects whitespace-only description', () => {
      const errors = validateFeedback({ description: '   \n\t  ', name: '', email: '' });
      expect(errors.description).toBeTruthy();
    });

    it('accepts a valid description', () => {
      const errors = validateFeedback({
        description: 'Die Filter haben einen Bug',
        name: '',
        email: '',
      });
      expect(errors.description).toBeUndefined();
    });

    it('rejects description longer than the maximum', () => {
      const errors = validateFeedback({
        description: 'a'.repeat(MAX_FEEDBACK_DESCRIPTION_LENGTH + 1),
        name: '',
        email: '',
      });
      expect(errors.description).toMatch(/maximal/);
    });
  });

  describe('name', () => {
    it('accepts an empty name (optional field)', () => {
      const errors = validateFeedback({
        description: 'Hello',
        name: '',
        email: '',
      });
      expect(errors.name).toBeUndefined();
    });

    it('rejects name longer than the maximum', () => {
      const errors = validateFeedback({
        description: 'Hello',
        name: 'a'.repeat(MAX_FEEDBACK_NAME_LENGTH + 1),
        email: '',
      });
      expect(errors.name).toBeTruthy();
    });
  });

  describe('email', () => {
    it('accepts an empty email (optional field)', () => {
      const errors = validateFeedback({
        description: 'Hello',
        name: '',
        email: '',
      });
      expect(errors.email).toBeUndefined();
    });

    it('accepts a valid email address', () => {
      const errors = validateFeedback({
        description: 'Hello',
        name: '',
        email: 'peter@example.com',
      });
      expect(errors.email).toBeUndefined();
    });

    it('rejects a malformed email address', () => {
      const errors = validateFeedback({
        description: 'Hello',
        name: '',
        email: 'not-an-email',
      });
      expect(errors.email).toBeTruthy();
    });

    it('rejects email longer than the maximum', () => {
      const errors = validateFeedback({
        description: 'Hello',
        name: '',
        email: 'a'.repeat(MAX_FEEDBACK_EMAIL_LENGTH + 1),
      });
      expect(errors.email).toBeTruthy();
    });
  });

  it('returns no errors for a fully valid payload', () => {
    const errors = validateFeedback({
      description: 'Die Plattform gefällt mir sehr gut',
      name: 'Peter Mathis',
      email: 'peter@example.com',
    });
    expect(errors).toEqual({});
  });
});
