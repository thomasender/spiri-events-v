import { describe, it, expect } from 'vitest';
import {
  DM_MAIL_WINDOW_MS,
  chatMailBaseUrl,
  decideBroadcastRecipient,
  decideDmMail,
  decideEventChatMail,
  directMessageUrl,
  dmMailMarkerId,
  dmRecipientUid,
  eventChatUrl,
  isBanActive,
  isBroadcastMessage,
  parseDmThreadId,
  shouldSendDmMail,
  shouldSendEventChatMail,
  viennaDay,
  type DmMailInput,
  type EventChatMailInput,
} from '../../functions/src/chatMailNotify';

const active = { email: 'a@example.com', disabled: false, emailVerified: true };

function dm(overrides: Partial<DmMailInput> = {}): DmMailInput {
  return {
    mode: 'all',
    recipientIsAdmin: false,
    authorUid: 'alice',
    recipientUid: 'bob',
    text: 'Hallo Bob',
    prefEnabled: true,
    blocked: false,
    recipientAllowsDirectMessages: true,
    authorBanned: false,
    author: active,
    recipient: { ...active, email: 'bob@example.com' },
    ...overrides,
  };
}

function room(overrides: Partial<EventChatMailInput> = {}): EventChatMailInput {
  return {
    mode: 'all',
    organizerIsAdmin: false,
    authorUid: 'guest',
    organizerUid: 'host',
    eventStatus: 'approved',
    text: 'Gibt es noch Plätze?',
    prefEnabled: true,
    blocked: false,
    authorBanned: false,
    author: active,
    organizer: { email: 'host@example.com', disabled: false, emailVerified: false },
    ...overrides,
  };
}

describe('thread ids', () => {
  it('reads both participants and finds the recipient', () => {
    expect(parseDmThreadId('alice_bob')).toEqual(['alice', 'bob']);
    expect(dmRecipientUid('alice_bob', 'alice')).toBe('bob');
    expect(dmRecipientUid('alice_bob', 'bob')).toBe('alice');
  });

  it('rejects malformed ids, outsiders and self-threads', () => {
    expect(parseDmThreadId('alice')).toBeNull();
    expect(parseDmThreadId('a_b_c')).toBeNull();
    expect(parseDmThreadId('alice_alice')).toBeNull();
    expect(dmRecipientUid('alice_bob', 'carol')).toBeNull();
    expect(dmRecipientUid('alice_bob', '')).toBeNull();
  });

  it('builds one marker per conversation and recipient', () => {
    expect(dmMailMarkerId('alice_bob', 'bob')).toBe('alice_bob_bob');
    expect(dmMailMarkerId('alice_bob', 'alice')).not.toBe(dmMailMarkerId('alice_bob', 'bob'));
  });
});

describe('Postfach throttle (fixed one-hour window)', () => {
  const t0 = Date.UTC(2026, 9, 31, 10, 0, 0);

  it('sends the first mail', () => {
    expect(shouldSendDmMail(null, t0)).toBe(true);
  });

  it('stays quiet within the hour and sends again after it', () => {
    expect(shouldSendDmMail(t0, t0 + 1000)).toBe(false);
    expect(shouldSendDmMail(t0, t0 + DM_MAIL_WINDOW_MS - 1)).toBe(false);
    expect(shouldSendDmMail(t0, t0 + DM_MAIL_WINDOW_MS)).toBe(true);
  });
});

describe('Event Chat throttle (one mail per Vienna calendar day)', () => {
  it('uses the calendar day in Vienna, not UTC', () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Vienna (UTC+1 after the DST change).
    expect(viennaDay(Date.UTC(2026, 9, 31, 23, 30))).toBe('2026-11-01');
    expect(viennaDay(Date.UTC(2026, 9, 31, 10, 0))).toBe('2026-10-31');
  });

  it('sends once a day', () => {
    const morning = Date.UTC(2026, 9, 31, 8, 0);
    const evening = Date.UTC(2026, 9, 31, 20, 0);
    const nextDay = Date.UTC(2026, 10, 1, 8, 0);
    expect(shouldSendEventChatMail(null, morning)).toBe(true);
    expect(shouldSendEventChatMail(viennaDay(morning), evening)).toBe(false);
    expect(shouldSendEventChatMail(viennaDay(morning), nextDay)).toBe(true);
  });
});

describe('decideDmMail', () => {
  it('sends for an ordinary message', () => {
    expect(decideDmMail(dm())).toEqual({ send: true });
  });

  it('never mails a message of an admin Sammelnachricht, before any other check', () => {
    expect(decideDmMail(dm({ broadcastId: 'admin_req12345' }))).toEqual({
      send: false,
      reason: 'broadcast',
    });
    expect(decideDmMail(dm({ broadcastId: 'admin_req12345', mode: 'off' }))).toEqual({
      send: false,
      reason: 'broadcast',
    });
    expect(decideDmMail(dm({ broadcastId: '' }))).toEqual({ send: true });
    expect(isBroadcastMessage({ broadcastId: 'x' })).toBe(true);
    expect(isBroadcastMessage({ text: 'Hallo', authorUid: 'alice' })).toBe(false);
    expect(isBroadcastMessage(undefined)).toBe(false);
  });

  it.each([
    ['flag off', { mode: 'off' }, 'flag_off'],
    ['flag missing', { mode: undefined }, 'flag_off'],
    ['not a participant', { recipientUid: null }, 'invalid_thread'],
    ['message to yourself', { recipientUid: 'alice' }, 'self'],
    ['admins-only mode, recipient no admin', { mode: 'admins' }, 'not_admin'],
    ['switched off in the profile', { prefEnabled: false }, 'opted_out'],
    ['empty text', { text: '   ' }, 'empty_text'],
    ['a block', { blocked: true }, 'blocked'],
    ['"keine Privatnachrichten"', { recipientAllowsDirectMessages: false }, 'no_direct_messages'],
    ['banned author', { authorBanned: true }, 'author_banned'],
    ['deleted author', { author: null }, 'author_inactive'],
    ['disabled author', { author: { ...active, disabled: true } }, 'author_inactive'],
    ['deleted recipient', { recipient: null }, 'recipient_inactive'],
    ['disabled recipient', { recipient: { ...active, disabled: true } }, 'recipient_inactive'],
    ['recipient without address', { recipient: { ...active, email: null } }, 'recipient_no_email'],
    [
      'recipient not verified',
      { recipient: { ...active, emailVerified: false } },
      'recipient_unverified',
    ],
  ] as const)('skips: %s', (_label, overrides, reason) => {
    expect(decideDmMail(dm(overrides as Partial<DmMailInput>))).toEqual({ send: false, reason });
  });

  it('admins-only mode mails admins', () => {
    expect(decideDmMail(dm({ mode: 'admins', recipientIsAdmin: true }))).toEqual({ send: true });
  });
});

describe('decideEventChatMail', () => {
  it('mails the organizer about a guest message (no verified address needed)', () => {
    expect(decideEventChatMail(room())).toEqual({ send: true });
  });

  it.each([
    ['flag off', { mode: 'off' }, 'flag_off'],
    ['no organizer', { organizerUid: null }, 'no_organizer'],
    ['organizer writes', { authorUid: 'host' }, 'author_is_organizer'],
    ['event not approved', { eventStatus: 'pending' }, 'event_not_approved'],
    ['admins-only mode, organizer no admin', { mode: 'admins' }, 'not_admin'],
    ['switched off in the profile', { prefEnabled: false }, 'opted_out'],
    ['empty text', { text: '' }, 'empty_text'],
    ['organizer blocked the author', { blocked: true }, 'blocked'],
    ['banned author', { authorBanned: true }, 'author_banned'],
    ['deleted author', { author: null }, 'author_inactive'],
    ['deleted organizer', { organizer: null }, 'recipient_inactive'],
    [
      'organizer without address',
      { organizer: { email: null, disabled: false } },
      'recipient_no_email',
    ],
  ] as const)('skips: %s', (_label, overrides, reason) => {
    expect(decideEventChatMail(room(overrides as Partial<EventChatMailInput>))).toEqual({
      send: false,
      reason,
    });
  });

  it('admins-only mode mails admin organizers', () => {
    expect(decideEventChatMail(room({ mode: 'admins', organizerIsAdmin: true }))).toEqual({
      send: true,
    });
  });
});

describe('helpers', () => {
  it('a ban counts while until is in the future', () => {
    expect(isBanActive(null, 1000)).toBe(false);
    expect(isBanActive(999, 1000)).toBe(false);
    expect(isBanActive(1001, 1000)).toBe(true);
  });

  it('links to the conversation and to the Event Chat anchor', () => {
    expect(directMessageUrl('https://www.thetribe.at', 'alice')).toBe(
      'https://www.thetribe.at/postfach/alice'
    );
    expect(eventChatUrl('https://www.thetribe.at', 'yoga-am-see', 'ev1')).toBe(
      'https://www.thetribe.at/event/yoga-am-see#kerzenraum'
    );
    expect(eventChatUrl('https://www.thetribe.at', null, 'ev1')).toBe(
      'https://www.thetribe.at/event/ev1#kerzenraum'
    );
  });

  it('points staging mails at the staging site', () => {
    expect(chatMailBaseUrl('tribe-vbg-staging')).toBe('https://tribe-vbg-staging.web.app');
    expect(chatMailBaseUrl('spirituelle-events-vorarlberg')).toBe('https://www.thetribe.at');
    expect(chatMailBaseUrl(undefined)).toBe('https://www.thetribe.at');
  });
});

describe('decideBroadcastRecipient', () => {
  const base = {
    senderUid: 'admin',
    recipientUid: 'bob',
    recipient: { email: 'bob@example.com', disabled: false, emailVerified: true },
    blocked: false,
    recipientAllowsDirectMessages: true,
  };

  it('delivers to an active, verified member who takes private messages', () => {
    expect(decideBroadcastRecipient(base)).toEqual({ send: true });
  });

  it.each([
    ['the sender herself', { recipientUid: 'admin' }, 'self'],
    ['a deleted account', { recipient: null }, 'recipient_inactive'],
    [
      'a disabled account',
      { recipient: { ...base.recipient, disabled: true } },
      'recipient_inactive',
    ],
    [
      'an unverified address',
      { recipient: { ...base.recipient, emailVerified: false } },
      'recipient_unverified',
    ],
    ['a block in either direction', { blocked: true }, 'blocked'],
    ['"keine Privatnachrichten"', { recipientAllowsDirectMessages: false }, 'no_direct_messages'],
  ])('skips %s', (_label, over, reason) => {
    expect(decideBroadcastRecipient({ ...base, ...over })).toEqual({ send: false, reason });
  });
});
