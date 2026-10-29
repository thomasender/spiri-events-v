import { describe, expect, it } from 'vitest';
import { countUnreadChatMessages } from '../../src/utils/chat';

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
