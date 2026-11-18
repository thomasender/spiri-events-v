import { describe, it, expect } from 'vitest';
import {
  filterUidsByPushPreference,
  ownerReviewMessagePush,
  ownerStatusPush,
} from '../../functions/src/pushRouting';
import type { NotificationDecision } from '../../functions/src/notificationRouting';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../functions/src/userPreferences';

const event = { id: 'ev1', title: 'Klangreise', slug: 'klangreise', organizer: null };

const decision = (type: string, extra: Record<string, unknown> = {}) =>
  ({ type, event, recipient: 'owner@x.at', ...extra }) as unknown as NotificationDecision;

describe('ownerStatusPush', () => {
  it('"genehmigt" goes to the organizer with the event title and link', () => {
    expect(
      ownerStatusPush({
        decision: decision('published'),
        beforeStatus: 'pending',
        ownerUid: 'owner',
        actorUid: 'admin',
      })
    ).toEqual({
      uids: ['owner'],
      prefKey: 'pushOnEventStatus',
      message: {
        title: 'Dein Event ist online',
        body: '„Klangreise“ wurde genehmigt und ist jetzt im Kalender.',
        link: '/event/klangreise',
        tag: 'event-status-ev1',
      },
    });
  });

  it('"abgelehnt" goes to the organizer', () => {
    const plan = ownerStatusPush({
      decision: decision('rejected', { reason: 'Privates' }),
      beforeStatus: 'pending',
      ownerUid: 'owner',
    });
    expect(plan?.uids).toEqual(['owner']);
    expect(plan?.message.title).toBe('Dein Event wurde abgelehnt');
    // The reason stays in the mail / the app, never in the push text.
    expect(plan?.message.body).not.toContain('Privates');
  });

  it('no push for "zurück in Entwurf", "gelöscht" or a submission', () => {
    for (const type of ['unpublished', 'deleted', 'submitted']) {
      expect(
        ownerStatusPush({ decision: decision(type), beforeStatus: 'approved', ownerUid: 'owner' })
      ).toBeNull();
    }
  });

  it('no push when the organizer edited her already approved event', () => {
    expect(
      ownerStatusPush({
        decision: decision('published'),
        beforeStatus: 'approved',
        ownerUid: 'owner',
      })
    ).toBeNull();
  });

  it('no push when the organizer approved her own event', () => {
    expect(
      ownerStatusPush({
        decision: decision('published'),
        beforeStatus: 'pending',
        ownerUid: 'owner',
        actorUid: 'owner',
      })
    ).toBeNull();
  });

  it('no push without decision or organizer uid', () => {
    expect(
      ownerStatusPush({ decision: null, beforeStatus: 'pending', ownerUid: 'owner' })
    ).toBeNull();
    expect(
      ownerStatusPush({ decision: decision('published'), beforeStatus: 'pending', ownerUid: null })
    ).toBeNull();
  });

  it('shortens very long titles and falls back without one', () => {
    const long = { ...event, title: 'A'.repeat(200) };
    const plan = ownerStatusPush({
      decision: { type: 'published', event: long, recipient: 'x' } as NotificationDecision,
      beforeStatus: 'pending',
      ownerUid: 'owner',
    });
    expect(plan!.message.body.length).toBeLessThan(140);
    const untitled = ownerStatusPush({
      decision: {
        type: 'published',
        event: { ...event, title: '', slug: null },
        recipient: 'x',
      } as NotificationDecision,
      beforeStatus: 'pending',
      ownerUid: 'owner',
    });
    expect(untitled!.message.body).toMatch(/^Dein Event wurde genehmigt/);
    expect(untitled!.message.link).toBe('/admin');
  });
});

describe('ownerReviewMessagePush', () => {
  const question = decision('changes_requested', {
    context: {
      messageId: 'm1',
      authorName: 'Jana',
      text: 'Bitte Ort ergänzen, private Nummer 0664…',
    },
  });

  it('"Rückfrage" goes to the organizer without the chat text', () => {
    const plan = ownerReviewMessagePush({
      decision: question,
      ownerUid: 'owner',
      authorUid: 'jana',
    });
    expect(plan?.uids).toEqual(['owner']);
    expect(plan?.prefKey).toBe('pushOnReviewMessage');
    expect(plan?.message.body).toBe('Das Team hat eine Frage zu „Klangreise“.');
    expect(JSON.stringify(plan)).not.toContain('0664');
  });

  it('no push for the organizer’s own message or other decisions', () => {
    expect(
      ownerReviewMessagePush({ decision: question, ownerUid: 'owner', authorUid: 'owner' })
    ).toBeNull();
    expect(
      ownerReviewMessagePush({ decision: decision('published'), ownerUid: 'owner' })
    ).toBeNull();
    expect(ownerReviewMessagePush({ decision: null, ownerUid: 'owner' })).toBeNull();
  });
});

describe('filterUidsByPushPreference', () => {
  it('keeps only explicit opt-ins (default is off)', () => {
    const prefs = new Map([
      ['anna', { ...DEFAULT_NOTIFICATION_PREFERENCES, pushOnEventStatus: true }],
      ['ben', { ...DEFAULT_NOTIFICATION_PREFERENCES }],
    ]);
    expect(filterUidsByPushPreference(['anna', 'ben', 'carl'], 'pushOnEventStatus', prefs)).toEqual(
      ['anna']
    );
    expect(filterUidsByPushPreference(['anna'], 'pushOnReviewMessage', prefs)).toEqual([]);
  });
});
