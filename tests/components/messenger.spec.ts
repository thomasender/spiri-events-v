import { describe, it, expect } from 'vitest';
import {
  DM_SNIPPET_LENGTH,
  buildReportExcerpt,
  countUnreadThreads,
  dmSnippet,
  isThreadUnread,
  otherUid,
  threadIdFor,
} from '../../src/utils/messenger';

describe('threadIdFor / otherUid', () => {
  it('is the same for both directions and sorted', () => {
    expect(threadIdFor('bob', 'alice')).toBe('alice_bob');
    expect(threadIdFor('alice', 'bob')).toBe('alice_bob');
  });
  it('finds the other person from a thread or an id', () => {
    expect(otherUid({ participants: ['alice', 'bob'] }, 'alice')).toBe('bob');
    expect(otherUid('alice_bob', 'bob')).toBe('alice');
    expect(otherUid('alice_bob', 'carol')).toBe('alice');
  });
});

describe('dmSnippet', () => {
  it('makes one line and cuts long text', () => {
    expect(dmSnippet('Hallo\n\nWelt  ')).toBe('Hallo Welt');
    const long = dmSnippet('a'.repeat(500));
    expect(Array.from(long)).toHaveLength(DM_SNIPPET_LENGTH);
    expect(long.endsWith('…')).toBe(true);
  });
  it('does not split emoji when cutting', () => {
    const cut = dmSnippet('😀'.repeat(300));
    expect(Array.from(cut).every((c) => c === '😀' || c === '…')).toBe(true);
  });
});

describe('unread', () => {
  const thread = (over = {}) => ({
    lastMessageAt: 100,
    lastMessageBy: 'bob',
    readAt: {},
    ...over,
  });
  it('is unread when the other wrote last and I have not read since', () => {
    expect(isThreadUnread(thread(), 'alice')).toBe(true);
    expect(isThreadUnread(thread({ readAt: { alice: 99 } }), 'alice')).toBe(true);
  });
  it('is read after opening, and never for my own last message', () => {
    expect(isThreadUnread(thread({ readAt: { alice: 100 } }), 'alice')).toBe(false);
    expect(isThreadUnread(thread({ lastMessageBy: 'alice' }), 'alice')).toBe(false);
  });
  it('ignores threads without a message time (still being written)', () => {
    expect(isThreadUnread(thread({ lastMessageAt: null }), 'alice')).toBe(false);
  });
  it('counts unread conversations', () => {
    const list = [thread(), thread({ readAt: { alice: 200 } }), thread()];
    expect(countUnreadThreads(list, 'alice')).toBe(2);
  });
});

describe('buildReportExcerpt', () => {
  it('lists the last messages with names, oldest first', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      authorUid: i % 2 ? 'a' : 'b',
      text: `m${i}`,
    }));
    const out = buildReportExcerpt(msgs, (u: string) => (u === 'a' ? 'Anna' : 'Bob'), 3);
    expect(out).toBe('Anna: m7\nBob: m8\nAnna: m9');
  });
});
