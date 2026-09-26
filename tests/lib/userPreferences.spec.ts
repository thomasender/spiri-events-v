import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizePreferences,
} from '../../functions/src/userPreferences';

describe('normalizePreferences', () => {
  it('returns the defaults when no document data is given', () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('returns the defaults when the document data is empty', () => {
    expect(normalizePreferences({})).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('keeps the default for preferences that are missing on the doc', () => {
    expect(normalizePreferences({ notifyOnPublished: false })).toEqual({
      notifyOnSubmitted: true,
      notifyOnChangesRequested: true,
      notifyOnPublished: false,
      notifyOnDeleted: true,
      notifyNewsletter: false,
      notifyOnContactMessage: true,
    });
  });

  it('ignores non-boolean preference values and falls back to the default', () => {
    expect(
      normalizePreferences({
        notifyOnSubmitted: 'yes',
        notifyOnPublished: 0,
        notifyOnDeleted: null,
      })
    ).toEqual({
      notifyOnSubmitted: true,
      notifyOnChangesRequested: true,
      notifyOnPublished: true,
      notifyOnDeleted: true,
      notifyNewsletter: false,
      notifyOnContactMessage: true,
    });
  });

  it('honours explicit boolean overrides for each preference', () => {
    expect(
      normalizePreferences({
        notifyOnSubmitted: false,
        notifyOnChangesRequested: false,
        notifyOnPublished: true,
        notifyOnDeleted: false,
        notifyNewsletter: true,
        notifyOnContactMessage: false,
      })
    ).toEqual({
      notifyOnSubmitted: false,
      notifyOnChangesRequested: false,
      notifyOnPublished: true,
      notifyOnDeleted: false,
      notifyNewsletter: true,
      notifyOnContactMessage: false,
    });
  });

  it('defaults notifyNewsletter to false (opt-in) for users without the field set', () => {
    expect(normalizePreferences({ notifyOnPublished: true })).toMatchObject({
      notifyNewsletter: false,
    });
  });

  it('honours an explicit notifyNewsletter override', () => {
    expect(normalizePreferences({ notifyNewsletter: true, notifyOnPublished: true })).toMatchObject(
      {
        notifyNewsletter: true,
      }
    );
    expect(normalizePreferences({ notifyNewsletter: false })).toMatchObject({
      notifyNewsletter: false,
    });
  });
});
