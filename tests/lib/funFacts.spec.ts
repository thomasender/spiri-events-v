import { describe, it, expect } from 'vitest';
import {
  FUN_FACTS_MAX_AGE_MS,
  FUN_FACTS_MIN_FORCE_MS,
  computeFunFacts,
  countReviewRounds,
  shouldRecompute,
  type FunFactLogEntry,
} from '../../functions/src/funFacts';

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 7, 26, 8, 0, 0); // 26.08.2026

let seq = 0;
function e(
  eventId: string,
  action: string,
  hoursAfterStart: number,
  extra: Partial<FunFactLogEntry> = {}
): FunFactLogEntry {
  seq += 1;
  return {
    action,
    eventId,
    atMs: T0 + hoursAfterStart * HOUR + seq, // stable order within the same hour
    eventTitle: `Event ${eventId}`,
    eventDate: '2026-12-05', // a Saturday in December
    ownerUid: `owner-${eventId}`,
    actorUid: null,
    actorName: null,
    byStaff: false,
    source: 'trigger',
    statusFrom: null,
    changedFields: [],
    ...extra,
  };
}

const staff = (uid: string, name: string) => ({ actorUid: uid, actorName: name, byStaff: true });

describe('computeFunFacts', () => {
  it('an empty log gives zeros and no "since"', () => {
    const facts = computeFunFacts([]);
    expect(facts.since).toBeNull();
    expect(facts.events).toEqual({
      total: 0,
      submitted: 0,
      directPublished: 0,
      published: 0,
      approvedRightAway: 0,
      neededReview: 0,
      neededMoreThanOneReview: 0,
      rejected: 0,
      cancelled: 0,
      unpublished: 0,
    });
    expect(facts.approvalTime).toEqual({
      count: 0,
      medianMs: null,
      averageMs: null,
      fastest: null,
      slowest: null,
    });
    expect(facts.champions).toEqual([]);
    expect(facts.organizers).toEqual({ distinct: 0, top: [] });
    expect(facts.weekdays).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  const log: FunFactLogEntry[] = [
    // a: approved right away after 2 h
    e('a', 'submitted', 0),
    e('a', 'approved', 2, { ...staff('m1', 'Mia'), statusFrom: 'pending' }),
    // b: returned once, resubmitted, approved after 10 h
    e('b', 'submitted', 0),
    e('b', 'returned', 1, staff('m1', 'Mia')),
    e('b', 'submitted', 5),
    e('b', 'approved', 10, { ...staff('p1', 'Peter'), statusFrom: 'pending' }),
    // c: question, then returned, resubmitted, team edit, approved: 2 rounds
    e('c', 'submitted', 0),
    e('c', 'clarification', 1, staff('p1', 'Peter')),
    e('c', 'returned', 2, staff('p1', 'Peter')),
    e('c', 'submitted', 3),
    e('c', 'edited', 4, { ...staff('p1', 'Peter'), changedFields: ['description'] }),
    e('c', 'approved', 30, { ...staff('p1', 'Peter'), statusFrom: 'pending' }),
    // d: rejected
    e('d', 'submitted', 0),
    e('d', 'rejected', 3, staff('m1', 'Mia')),
    // f: created by the team as approved, later cancelled
    e('f', 'approved', 1, { ...staff('p1', 'Peter'), ownerUid: 'p1' }),
    e('f', 'cancelled', 50, { ownerUid: 'p1' }),
    // g: only the Instagram crop changed before approval: still "sofort"
    e('g', 'submitted', 0, { source: 'backfill' }),
    e('g', 'edited', 1, { ...staff('p1', 'Peter'), changedFields: ['instagramImage'] }),
    e('g', 'approved', 1, { ...staff('p1', 'Peter'), statusFrom: 'pending', source: 'backfill' }),
    e('g', 'unpublished', 9, staff('p1', 'Peter')),
  ];

  it('counts the outcomes per event', () => {
    const facts = computeFunFacts(log);
    expect(facts.events).toEqual({
      total: 6,
      submitted: 5,
      directPublished: 1,
      published: 5,
      approvedRightAway: 2, // a, g
      neededReview: 2, // b, c
      neededMoreThanOneReview: 1, // c
      rejected: 1,
      cancelled: 1,
      unpublished: 1,
    });
    expect(facts.since).toBe(new Date(log[0].atMs!).toISOString());
    expect(facts.clarificationsSince).toBe(new Date(log[7].atMs!).toISOString());
    expect(facts.totalEntries).toBe(log.length);
    expect(facts.backfillEntries).toBe(2);
  });

  it('measures submitted -> approved of the first pass', () => {
    const { approvalTime } = computeFunFacts(log);
    expect(approvalTime.count).toBe(4); // a 2 h, b 10 h, c 30 h, g ~1 h
    expect(approvalTime.fastest?.eventId).toBe('g');
    expect(approvalTime.slowest).toMatchObject({ eventId: 'c', title: 'Event c' });
    expect(Math.round(approvalTime.slowest!.ms / HOUR)).toBe(30);
    expect(Math.round(approvalTime.medianMs! / HOUR)).toBe(6); // (2 + 10) / 2
    expect(Math.round(approvalTime.averageMs! / HOUR)).toBe(11); // (1 + 2 + 10 + 30) / 4
  });

  it('ranks approvers and organizers, names only from the log', () => {
    const facts = computeFunFacts([
      ...log,
      e('h', 'submitted', 0, { ownerUid: 'o9', actorUid: 'o9', actorName: 'Olga' }),
      e('i', 'submitted', 0, { ownerUid: 'o9', actorUid: 'o9', actorName: 'Olga' }),
    ]);
    expect(facts.champions).toEqual([
      { name: 'Peter', approvals: 4 },
      { name: 'Mia', approvals: 1 },
    ]);
    expect(facts.organizers.distinct).toBe(7);
    expect(facts.organizers.top[0]).toEqual({ name: 'Olga', events: 2 });
    // Organizers who never acted in the log stay anonymous.
    expect(facts.organizers.top.find((o) => o.events === 1)?.name).toBeNull();
  });

  it('a resubmitted event counts with its first pass only', () => {
    const facts = computeFunFacts([
      e('r', 'submitted', 0),
      e('r', 'approved', 1, { ...staff('m1', 'Mia'), statusFrom: 'pending' }),
      e('r', 'unpublished', 2, staff('m1', 'Mia')),
      e('r', 'submitted', 3),
      e('r', 'returned', 4, staff('m1', 'Mia')),
      e('r', 'submitted', 5),
      e('r', 'approved', 50, { ...staff('m1', 'Mia'), statusFrom: 'pending' }),
    ]);
    expect(facts.events).toMatchObject({
      submitted: 1,
      published: 1,
      approvedRightAway: 1,
      neededReview: 0,
      unpublished: 1,
    });
    expect(facts.approvalTime.count).toBe(1);
    expect(Math.round(facts.approvalTime.medianMs! / HOUR)).toBe(1);
  });

  it('a decision from pending without a logged submission still counts as submitted', () => {
    const facts = computeFunFacts([
      e('x', 'approved', 1, { ...staff('m1', 'Mia'), statusFrom: 'pending', source: 'backfill' }),
    ]);
    expect(facts.events).toMatchObject({ submitted: 1, directPublished: 0, published: 1 });
    expect(facts.approvalTime.count).toBe(0);
  });

  it('counts published events by weekday and month of their date', () => {
    const facts = computeFunFacts([
      e('w1', 'approved', 1, { ...staff('p1', 'Peter'), eventDate: '2026-12-05' }), // Sa
      e('w2', 'approved', 1, { ...staff('p1', 'Peter'), eventDate: '2027-01-04' }), // Mo
      e('w3', 'submitted', 1, { eventDate: '2027-01-05' }), // not published
    ]);
    expect(facts.weekdays).toEqual([1, 0, 0, 0, 0, 1, 0]);
    expect(facts.months[11]).toBe(1);
    expect(facts.months[0]).toBe(1);
  });
});

describe('countReviewRounds', () => {
  it('works with and without clarification entries', () => {
    const base = [e('z', 'submitted', 0)];
    expect(countReviewRounds(base)).toBe(0);
    expect(countReviewRounds([...base, e('z', 'clarification', 1, staff('m1', 'Mia'))])).toBe(1);
    expect(
      countReviewRounds([
        ...base,
        e('z', 'clarification', 1, staff('m1', 'Mia')),
        e('z', 'clarification', 2, staff('m1', 'Mia')),
        e('z', 'edited', 3, { ...staff('m1', 'Mia'), changedFields: ['title'] }),
      ])
    ).toBe(1);
  });

  it('organizer edits are no review round', () => {
    expect(
      countReviewRounds([
        e('z', 'submitted', 0),
        e('z', 'edited', 1, { actorUid: 'o1', changedFields: ['title'] }),
      ])
    ).toBe(0);
  });
});

describe('shouldRecompute', () => {
  const now = T0;
  it('computes when nothing is stored', () => {
    expect(shouldRecompute(null, now, false)).toBe(true);
  });
  it('keeps the stored result for 6 hours', () => {
    expect(shouldRecompute(now - FUN_FACTS_MAX_AGE_MS + 1000, now, false)).toBe(false);
    expect(shouldRecompute(now - FUN_FACTS_MAX_AGE_MS, now, false)).toBe(true);
  });
  it('"Aktualisieren" recomputes at most once a minute', () => {
    expect(shouldRecompute(now - 1000, now, true)).toBe(false);
    expect(shouldRecompute(now - FUN_FACTS_MIN_FORCE_MS, now, true)).toBe(true);
  });
});
