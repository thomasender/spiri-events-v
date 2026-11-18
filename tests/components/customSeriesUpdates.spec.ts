import { describe, it, expect } from 'vitest';
import {
  buildCustomDeleteOccurrenceUpdate,
  buildCustomDeleteFromDateUpdate,
  buildCustomTimesPayload,
  formCustomTime,
  invalidCustomTimeDates,
  moveFormCustomTime,
  setFormCustomTime,
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

describe('own times of single dates (customTimes, 6afd86b4)', () => {
  const event = {
    date: '2026-08-27',
    time: '10:00',
    customDates: ['2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'],
    customTimes: {
      '2026-08-28': { time: '18:00', endTime: '' },
      '2026-08-30': { time: '07:00', endTime: '08:00' },
    },
  };

  it('deleting a date also drops its own time', () => {
    expect(buildCustomDeleteOccurrenceUpdate(event, '2026-08-28')).toEqual({
      customDates: ['2026-08-27', '2026-08-29', '2026-08-30'],
      customTimes: { '2026-08-30': { time: '07:00', endTime: '08:00' } },
    });
  });

  it('deleting from a date on drops the own times from there on', () => {
    expect(buildCustomDeleteFromDateUpdate(event, '2026-08-29')).toEqual({
      customDates: ['2026-08-27', '2026-08-28'],
      customTimes: { '2026-08-28': { time: '18:00', endTime: '' } },
    });
  });

  it('events without own times get no customTimes in the update', () => {
    const { customTimes: _unused, ...old } = event;
    expect(buildCustomDeleteOccurrenceUpdate(old, '2026-08-28')).not.toHaveProperty('customTimes');
  });

  const defaults = { time: '10:00', endTime: '12:00' };

  it('form rows show the own value, else the one from above', () => {
    const times = setFormCustomTime({}, '2026-09-01', 'time', '18:00');
    expect(formCustomTime(times, '2026-09-01', defaults)).toEqual({
      time: '18:00',
      endTime: '12:00',
    });
    expect(formCustomTime(times, '2026-09-02', defaults)).toEqual(defaults);
  });

  it('a row that gets another date takes its time along unless another row keeps the old date', () => {
    const times = { '2026-09-01': { time: '18:00' } };
    expect(moveFormCustomTime(times, '2026-09-01', '2026-09-03', ['2026-09-03'])).toEqual({
      '2026-09-03': { time: '18:00' },
    });
    expect(
      moveFormCustomTime(times, '2026-09-01', '2026-09-03', ['2026-09-01', '2026-09-03'])
    ).toEqual({ '2026-09-01': { time: '18:00' }, '2026-09-03': { time: '18:00' } });
    // A removed row (no new date) drops the entry.
    expect(moveFormCustomTime(times, '2026-09-01', '', [])).toEqual({});
  });

  it('the payload keeps only differing, complete entries of dates in the series', () => {
    const times = {
      '2026-09-01': { time: '18:00' },
      '2026-09-02': { time: '10:00', endTime: '12:00' }, // same as above
      '2026-09-03': { endTime: '' }, // no end on this date
      '2026-09-09': { time: '07:00' }, // date no longer in the series
    };
    expect(
      buildCustomTimesPayload(times, ['2026-09-03', '2026-09-01', '2026-09-02'], defaults)
    ).toEqual({
      '2026-09-01': { time: '18:00', endTime: '12:00' },
      '2026-09-03': { time: '10:00', endTime: '' },
    });
  });

  it('finds rows whose end lies before their start', () => {
    const times = { '2026-09-01': { time: '13:00' }, '2026-09-02': { endTime: '11:00' } };
    expect(
      invalidCustomTimeDates(times, ['2026-09-01', '2026-09-02', '2026-09-03'], defaults)
    ).toEqual(['2026-09-01']);
  });
});
