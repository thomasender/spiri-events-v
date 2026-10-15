import { describe, it, expect } from 'vitest';
import {
  detectNewCancellations,
  selectFavoriteRecipients,
  todayInVienna,
  FavoriteUserInfo,
} from '../../functions/src/eventCancellation';
import { buildFavoriteCancelledPayload } from '../../functions/src/emailTemplates';

const TODAY = '2026-09-01';
const series = {
  status: 'approved',
  recurrence: 'weekly',
  date: '2026-08-03',
};

describe('detectNewCancellations', () => {
  it('reports newly cancelled dates of a series, sorted', () => {
    expect(
      detectNewCancellations(
        { ...series, cancelledDates: ['2026-09-07'] },
        { ...series, cancelledDates: ['2026-09-21', '2026-09-07', '2026-09-14'] },
        TODAY
      )
    ).toEqual({ wholeEvent: false, dates: ['2026-09-14', '2026-09-21'] });
  });

  it('sends nothing when the event is saved again without new cancellations', () => {
    const doc = { ...series, cancelledDates: ['2026-09-07'], updatedAt: 1 };
    expect(detectNewCancellations(doc, { ...doc, updatedAt: 2 }, TODAY)).toBeNull();
    const whole = { status: 'approved', date: '2026-09-10', cancelled: true };
    expect(detectNewCancellations(whole, { ...whole, title: 'x' }, TODAY)).toBeNull();
  });

  it('sends nothing when a cancellation is taken back', () => {
    expect(
      detectNewCancellations(
        { ...series, cancelledDates: ['2026-09-07'] },
        { ...series, cancelledDates: [] },
        TODAY
      )
    ).toBeNull();
    expect(
      detectNewCancellations(
        { status: 'approved', date: '2026-09-10', cancelled: true },
        { status: 'approved', date: '2026-09-10', cancelled: false },
        TODAY
      )
    ).toBeNull();
  });

  it('ignores dates that are already over', () => {
    expect(
      detectNewCancellations(series, { ...series, cancelledDates: ['2026-08-31'] }, TODAY)
    ).toBeNull();
  });

  it('names the date when a single event is cancelled', () => {
    const ev = { status: 'approved', date: '2026-09-10' };
    expect(detectNewCancellations(ev, { ...ev, cancelled: true }, TODAY)).toEqual({
      wholeEvent: true,
      dates: ['2026-09-10'],
    });
  });

  it('reports a whole cancelled series without listing dates', () => {
    expect(detectNewCancellations(series, { ...series, cancelled: true }, TODAY)).toEqual({
      wholeEvent: true,
      dates: [],
    });
  });

  it('only announces cancellations of published events', () => {
    const draft = { ...series, status: 'draft' };
    expect(
      detectNewCancellations(draft, { ...draft, cancelledDates: ['2026-09-07'] }, TODAY)
    ).toBeNull();
  });

  it('does not announce single dates while the whole event is already cancelled', () => {
    const before = { ...series, cancelled: true };
    expect(
      detectNewCancellations(before, { ...before, cancelledDates: ['2026-09-07'] }, TODAY)
    ).toBeNull();
  });
});

describe('selectFavoriteRecipients', () => {
  const users = new Map<string, FavoriteUserInfo>([
    ['a', { email: 'a@example.com', displayName: 'Anna' }],
    ['b', { email: null }],
    ['c', { email: 'c@example.com', disabled: true }],
    ['d', { email: 'd@example.com' }],
    ['owner', { email: 'owner@example.com' }],
    ['dup', { email: 'A@example.com' }],
  ]);

  it('skips users without e-mail, disabled accounts, opt-outs, the organizer and duplicates', () => {
    const recipients = selectFavoriteRecipients(
      ['a', 'b', 'c', 'd', 'owner', 'dup', 'a', 'missing'],
      users,
      (uid) => uid !== 'd',
      'owner'
    );
    expect(recipients).toEqual([{ uid: 'a', email: 'a@example.com', displayName: 'Anna' }]);
  });
});

describe('todayInVienna', () => {
  it('uses the Vorarlberg date, not UTC', () => {
    expect(todayInVienna(new Date('2026-09-01T22:30:00Z'))).toBe('2026-09-02');
  });
});

describe('buildFavoriteCancelledPayload', () => {
  const event = { id: 'e1', title: 'Wochen-Yoga <3', slug: 'wochen-yoga' };

  it('names the event and the concrete cancelled date, addressed to one recipient', () => {
    const payload = buildFavoriteCancelledPayload({
      event,
      recipient: 'a@example.com',
      recipientName: 'Anna',
      dates: ['2026-09-14'],
      wholeEvent: false,
    });
    expect(payload.to).toBe('a@example.com');
    expect(payload.subject).toBe('Abgesagt: Wochen-Yoga <3 am Montag, 14. September 2026');
    expect(payload.text).toContain('Hallo Anna,');
    expect(payload.text).toContain('Montag, 14. September 2026');
    expect(payload.text).toContain('https://www.thetribe.at/event/wochen-yoga');
    expect(payload.html).toContain('Wochen-Yoga &lt;3');
    expect(payload.html).not.toContain('Wochen-Yoga <3');
  });

  it('lists several dates and handles a whole cancelled series', () => {
    const several = buildFavoriteCancelledPayload({
      event,
      recipient: 'a@example.com',
      dates: ['2026-09-14', '2026-09-21'],
      wholeEvent: false,
    });
    expect(several.text).toContain('• Montag, 14. September 2026');
    expect(several.text).toContain('• Montag, 21. September 2026');

    const whole = buildFavoriteCancelledPayload({
      event,
      recipient: 'a@example.com',
      dates: [],
      wholeEvent: true,
    });
    expect(whole.subject).toBe('Abgesagt: Wochen-Yoga <3');
    expect(whole.text).toContain('alle Termine');
  });
});
