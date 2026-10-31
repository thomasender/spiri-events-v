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
      notifyOnFavoriteCancelled: true,
      notifyOnDirectMessage: true,
      notifyOnEventChat: true,
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
      notifyOnFavoriteCancelled: true,
      notifyOnDirectMessage: true,
      notifyOnEventChat: true,
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
        notifyOnFavoriteCancelled: false,
        notifyOnDirectMessage: false,
        notifyOnEventChat: false,
      })
    ).toEqual({
      notifyOnSubmitted: false,
      notifyOnChangesRequested: false,
      notifyOnPublished: true,
      notifyOnDeleted: false,
      notifyNewsletter: true,
      notifyOnContactMessage: false,
      notifyOnFavoriteCancelled: false,
      notifyOnDirectMessage: false,
      notifyOnEventChat: false,
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

describe('chat mail preferences', () => {
  it('are on by default', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.notifyOnDirectMessage).toBe(true);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.notifyOnEventChat).toBe(true);
    expect(normalizePreferences({}).notifyOnDirectMessage).toBe(true);
  });

  it('can be switched off and ignore non-boolean values', () => {
    const prefs = normalizePreferences({ notifyOnDirectMessage: false, notifyOnEventChat: 'no' });
    expect(prefs.notifyOnDirectMessage).toBe(false);
    expect(prefs.notifyOnEventChat).toBe(true);
  });
});
