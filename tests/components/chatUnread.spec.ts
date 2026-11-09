import { beforeEach, describe, expect, it } from 'vitest';
import {
  countUnreadChatMessages,
  lagerfeuerSeenKey,
  markLagerfeuerSeen,
  readLagerfeuerSeen,
} from '../../src/utils/chat';

describe('countUnreadChatMessages', () => {
  const msgs = [
    { authorUid: 'a', createdAt: 100 },
    { authorUid: 'b', createdAt: 200 },
    { authorUid: 'me', createdAt: 300 },
    { authorUid: 'b', createdAt: 400 },
  ];
  it('counts only newer messages by others', () => {
    expect(countUnreadChatMessages(msgs, 150, 'me')).toBe(2);
  });
  it('is 0 after the chat was opened (seen = newest)', () => {
    expect(countUnreadChatMessages(msgs, 400, 'me')).toBe(0);
  });
});

describe('seen marker per room', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps the old key for "lagerfeuer" (Vorarlberg) and adds the room for others', () => {
    expect(lagerfeuerSeenKey('me')).toBe('lagerfeuerSeen:me');
    expect(lagerfeuerSeenKey('me', 'lagerfeuer')).toBe('lagerfeuerSeen:me');
    expect(lagerfeuerSeenKey('me', 'tirol')).toBe('lagerfeuerSeen:me:tirol');
  });

  it('an existing Vorarlberg marker stays valid', () => {
    window.localStorage.setItem('lagerfeuerSeen:me', '500');
    expect(readLagerfeuerSeen('me')).toBe(500);
    expect(readLagerfeuerSeen('me', 'lagerfeuer')).toBe(500);
  });

  it('rooms are counted separately and markers only move forward', () => {
    markLagerfeuerSeen('me', 100, 'tirol');
    markLagerfeuerSeen('me', 300);
    expect(readLagerfeuerSeen('me', 'tirol')).toBe(100);
    expect(readLagerfeuerSeen('me')).toBe(300);
    markLagerfeuerSeen('me', 50, 'tirol');
    expect(readLagerfeuerSeen('me', 'tirol')).toBe(100);
  });
});
