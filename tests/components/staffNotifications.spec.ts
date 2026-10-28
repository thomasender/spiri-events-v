import { describe, it, expect } from 'vitest';
import {
  messageIsUnreadFor,
  newReviewEventIds,
  responsibleStaffUid,
} from '../../src/utils/staffNotifications';

describe('newReviewEventIds', () => {
  it('everything counts while Review was never opened', () => {
    expect(newReviewEventIds(['a', 'b'], null)).toEqual(['a', 'b']);
  });

  it('seen events stay quiet; unseen ones count', () => {
    expect(newReviewEventIds(['a', 'b'], { eventIds: ['a'], atMs: 10 })).toEqual(['b']);
  });

  it('an organizer change counts only when it came after the last visit', () => {
    const seen = { eventIds: ['a', 'b'], atMs: 100 };
    const alerts = { a: { atMs: 50 }, b: { atMs: 150 } };
    expect(newReviewEventIds(['a', 'b'], seen, alerts)).toEqual(['b']);
  });
});

describe('responsibleStaffUid', () => {
  it('is the author of the first staff message, by time', () => {
    const t = (ms: number) => ({ toMillis: () => ms });
    expect(
      responsibleStaffUid([
        { authorRole: 'User', authorUid: 'owner', createdAt: t(1) },
        { authorRole: 'Admin', authorUid: 'late', createdAt: t(30) },
        { authorRole: 'Admin', authorUid: 'first', createdAt: t(20) },
      ])
    ).toBe('first');
  });

  it('is null while no staff member has written', () => {
    expect(responsibleStaffUid([{ authorRole: 'User', authorUid: 'owner' }])).toBeNull();
  });
});

describe('messageIsUnreadFor', () => {
  const reply = { authorRole: 'User', authorUid: 'owner', readByRecipient: false };
  const staffMsg = { authorRole: 'Admin', authorUid: 'anna', readByRecipient: false };

  it('the organizer sees every unread message by someone else (unchanged)', () => {
    const ctx = { viewerUid: 'owner', viewerIsOwner: true, responsibleUid: 'anna' };
    expect(messageIsUnreadFor(staffMsg, ctx)).toBe(true);
    expect(messageIsUnreadFor(reply, ctx)).toBe(false);
  });

  it("an organizer's reply reaches only the staff member who asked", () => {
    expect(
      messageIsUnreadFor(reply, { viewerUid: 'anna', viewerIsOwner: false, responsibleUid: 'anna' })
    ).toBe(true);
    expect(
      messageIsUnreadFor(reply, { viewerUid: 'ben', viewerIsOwner: false, responsibleUid: 'anna' })
    ).toBe(false);
  });

  it("every staff member sees it while nobody has answered yet; colleagues' messages never count", () => {
    const ctx = { viewerUid: 'ben', viewerIsOwner: false, responsibleUid: null };
    expect(messageIsUnreadFor(reply, ctx)).toBe(true);
    expect(messageIsUnreadFor(staffMsg, ctx)).toBe(false);
    expect(messageIsUnreadFor({ ...reply, readByRecipient: true }, ctx)).toBe(false);
  });
});
