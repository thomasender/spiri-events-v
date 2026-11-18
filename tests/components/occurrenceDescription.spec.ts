import { describe, it, expect } from 'vitest';
import { describeOccurrence as describeServer } from '../../functions/src/occurrenceDescription';
import { describeOccurrence as describeClient } from '../../src/utils/occurrenceDescription';

// Tuesday 17 November 2026, 12:00 in Vienna (CET, UTC+1).
const NOW = new Date('2026-11-17T11:00:00Z');

const IMPLEMENTATIONS = [
  ['functions/src', describeServer],
  ['src/utils', describeClient],
] as const;

describe.each(IMPLEMENTATIONS)('describeOccurrence (%s)', (_name, describe_) => {
  it('says "heute" and "morgen" with weekday and part of the day', () => {
    expect(describe_('2026-11-17', '19:30', NOW)).toBe('heute Dienstagabend um 19:30 Uhr');
    expect(describe_('2026-11-18', '10:00', NOW)).toBe('morgen Mittwochvormittag um 10:00 Uhr');
  });

  it('says "diese Woche" until Sunday of the current week', () => {
    expect(describe_('2026-11-20', '08:00', NOW)).toBe('diese Woche am Freitagmorgen um 8:00 Uhr');
    expect(describe_('2026-11-22', '14:15', NOW)).toBe(
      'diese Woche am Sonntagnachmittag um 14:15 Uhr'
    );
  });

  it('names the full date from next Monday on', () => {
    expect(describe_('2026-11-23', '12:00', NOW)).toBe(
      'am Montag, 23. November, mittags um 12:00 Uhr'
    );
    expect(describe_('2026-11-24', '19:30', NOW)).toBe(
      'am Dienstag, 24. November, abends um 19:30 Uhr'
    );
  });

  it('adds the year when it is not the current one, also for past dates', () => {
    expect(describe_('2027-01-05', '18:00', NOW)).toBe(
      'am Dienstag, 5. Januar 2027, abends um 18:00 Uhr'
    );
    expect(describe_('2026-11-10', '18:00', NOW)).toBe(
      'am Dienstag, 10. November, abends um 18:00 Uhr'
    );
  });

  it('names only the day without a time', () => {
    expect(describe_('2026-11-17', '', NOW)).toBe('heute');
    expect(describe_('2026-11-18', null, NOW)).toBe('morgen');
    expect(describe_('2026-11-20', undefined, NOW)).toBe('diese Woche am Freitag');
    expect(describe_('2026-11-24', 'bald', NOW)).toBe('am Dienstag, 24. November');
  });

  it('uses the boundaries morgens 5, vormittags 10, mittags 12, nachmittags 14, abends 18, nachts 22', () => {
    const part = (time: string) => describe_('2026-11-24', time, NOW).split(', ')[2];
    expect(part('04:59')).toBe('nachts um 4:59 Uhr');
    expect(part('05:00')).toBe('morgens um 5:00 Uhr');
    expect(part('09:59')).toBe('morgens um 9:59 Uhr');
    expect(part('10:00')).toBe('vormittags um 10:00 Uhr');
    expect(part('12:00')).toBe('mittags um 12:00 Uhr');
    expect(part('14:00')).toBe('nachmittags um 14:00 Uhr');
    expect(part('18:00')).toBe('abends um 18:00 Uhr');
    expect(part('22:00')).toBe('nachts um 22:00 Uhr');
    expect(describe_('2026-11-17', '23:30', NOW)).toBe('heute Dienstagnacht um 23:30 Uhr');
  });

  it('takes "today" in Vienna, not in UTC, around midnight', () => {
    // 23:59 in Vienna on the 17th is still 22:59 UTC on the 17th ...
    expect(describe_('2026-11-17', '20:00', new Date('2026-11-17T22:59:00Z'))).toBe(
      'heute Dienstagabend um 20:00 Uhr'
    );
    // ... and 00:00 in Vienna on the 18th is 23:00 UTC on the 17th: already "heute" for the 18th.
    const justAfterMidnight = new Date('2026-11-17T23:00:00Z');
    expect(describe_('2026-11-18', '20:00', justAfterMidnight)).toBe(
      'heute Mittwochabend um 20:00 Uhr'
    );
    expect(describe_('2026-11-17', '20:00', justAfterMidnight)).toBe(
      'am Dienstag, 17. November, abends um 20:00 Uhr'
    );
    // Summer time (UTC+2): 22:00 UTC on 14 July is midnight on the 15th in Vienna.
    expect(describe_('2026-07-15', '09:00', new Date('2026-07-14T22:00:00Z'))).toBe(
      'heute Mittwochmorgen um 9:00 Uhr'
    );
  });

  it('is empty for a missing or malformed date', () => {
    expect(describe_(null, '19:30', NOW)).toBe('');
    expect(describe_('', '19:30', NOW)).toBe('');
    expect(describe_('24.11.2026', '19:30', NOW)).toBe('');
  });
});
