import { describe, it, expect } from 'vitest';
import {
  buildCustomDeleteOccurrenceUpdate,
  buildCustomDeleteFromDateUpdate,
} from '../../src/utils/customSeriesUpdates';

describe('buildCustomDeleteOccurrenceUpdate', () => {
  it('removes the date from customDates', () => {
    const event = {
      date: '2026-08-27',
      customDates: ['2026-08-27', '2026-08-28', '2026-08-29'],
    };
    expect(buildCustomDeleteOccurrenceUpdate(event, '2026-08-28')).toEqual({
      customDates: ['2026-08-27', '2026-08-29'],
    });
  });

  it('adds an exception date when deleting the initial event date', () => {
    const event = {
      date: '2026-08-27',
      customDates: ['2026-08-28', '2026-08-29'],
    };
    expect(buildCustomDeleteOccurrenceUpdate(event, '2026-08-27')).toEqual({
      customDates: ['2026-08-28', '2026-08-29'],
      exceptionDates: ['2026-08-27'],
    });
  });

  it('does not duplicate an existing exception date', () => {
    const event = {
      date: '2026-08-27',
      customDates: ['2026-08-28'],
      exceptionDates: ['2026-08-27'],
    };
    expect(buildCustomDeleteOccurrenceUpdate(event, '2026-08-27')).toEqual({
      customDates: ['2026-08-28'],
    });
  });
});

describe('buildCustomDeleteFromDateUpdate', () => {
  it('keeps only earlier custom dates', () => {
    const event = {
      date: '2026-08-27',
      customDates: ['2026-08-27', '2026-08-28', '2026-08-29'],
    };
    expect(buildCustomDeleteFromDateUpdate(event, '2026-08-28')).toEqual({
      customDates: ['2026-08-27'],
    });
  });

  it('excepts the implicit initial date when it is on or after the delete date', () => {
    const event = {
      date: '2026-08-27',
      customDates: ['2026-08-28', '2026-08-29'],
    };
    expect(buildCustomDeleteFromDateUpdate(event, '2026-08-27')).toEqual({
      customDates: [],
      exceptionDates: ['2026-08-27'],
    });
  });

  it('leaves the initial date untouched when it is before the delete date', () => {
    const event = {
      date: '2026-08-27',
      customDates: ['2026-08-28', '2026-08-29'],
    };
    expect(buildCustomDeleteFromDateUpdate(event, '2026-08-29')).toEqual({
      customDates: ['2026-08-28'],
    });
  });
});
