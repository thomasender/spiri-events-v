import { describe, it, expect } from 'vitest';
import {
  CHAT_MAX_LENGTH,
  CHAT_PERMANENT_UNTIL_MS,
  canEnterChat,
  chatAuthorName,
  chatPhotoUrl,
  chatTextLength,
  cooldownRemainingMs,
  describeChatBan,
  describeOnline,
  onlineMembers,
  PRESENCE_ONLINE_MS,
  formatChatTime,
  isChatBanActive,
  isEmojiOnly,
  isUnsentMessage,
  normalizeChatText,
  splitChatLinks,
  validateChatText,
} from '../../src/utils/chat';
import {
  MENTION_EXCERPT_MAX,
  MENTION_MAX,
  REPORT_MAIL_MIN_INTERVAL_MS,
  buildReportMail,
  canReceiveChatMention,
  mentionExcerpt,
  mentionTargets,
  retentionCutoffMs,
  shouldSendReportMail,
} from '../../functions/src/chatLogic';

describe('normalizeChatText', () => {
  it('trims, unifies line breaks and limits blank lines', () => {
    expect(normalizeChatText('  a\r\nb\n\n\n\nc  ')).toBe('a\nb\n\nc');
  });

  it('strips invisible and direction-overriding characters', () => {
    expect(normalizeChatText('a​b‮c\u0000d﻿')).toBe('abcd');
  });

  it('keeps emoji including joined sequences', () => {
    expect(normalizeChatText('Hallo 🌿 👨‍👩‍👧')).toBe('Hallo 🌿 👨‍👩‍👧');
  });

  it('returns an empty string for non-strings', () => {
    expect(normalizeChatText(null as unknown as string)).toBe('');
  });
});

describe('chatTextLength', () => {
  it('counts an emoji as one character, even a family or a flag', () => {
    expect(chatTextLength('a🌿')).toBe(2);
    expect(chatTextLength('👨‍👩‍👧')).toBe(1);
    expect(chatTextLength('🇦🇹')).toBe(1);
  });
});

describe('validateChatText', () => {
  it('rejects empty and whitespace-only text', () => {
    expect(validateChatText('   \n ').ok).toBe(false);
  });

  it('accepts text at the limit and rejects one over it', () => {
    expect(validateChatText('a'.repeat(CHAT_MAX_LENGTH)).ok).toBe(true);
    expect(validateChatText('a'.repeat(CHAT_MAX_LENGTH + 1)).ok).toBe(false);
  });

  it('allows 500 emoji, which the rules accept as at most 2000 units', () => {
    const emoji = '😀'.repeat(CHAT_MAX_LENGTH);
    expect(validateChatText(emoji).ok).toBe(true);
    expect(emoji.length).toBeLessThanOrEqual(2000);
  });

  it('returns the normalised text', () => {
    expect(validateChatText('  Hi​ ').text).toBe('Hi');
  });
});

describe('cooldownRemainingMs', () => {
  it('is zero when nothing was sent', () => {
    expect(cooldownRemainingMs(0)).toBe(0);
  });
  it('counts down from the last send', () => {
    expect(cooldownRemainingMs(10_000, 11_000)).toBe(2000);
    expect(cooldownRemainingMs(10_000, 20_000)).toBe(0);
  });
});

describe('splitChatLinks', () => {
  it('turns http(s) URLs into links and keeps the text around them', () => {
    expect(splitChatLinks('Schau https://thetribe.at/chat, ok?')).toEqual([
      { type: 'text', value: 'Schau ' },
      { type: 'link', value: 'https://thetribe.at/chat', href: 'https://thetribe.at/chat' },
      { type: 'text', value: ', ok?' },
    ]);
  });

  it('never creates links for javascript: or other schemes', () => {
    const parts = splitChatLinks('javascript:alert(1) ftp://x.at data:text/html,hi');
    expect(parts.every((p) => p.type === 'text')).toBe(true);
  });

  it('leaves HTML as plain text for React to escape', () => {
    expect(splitChatLinks('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'text', value: '<img src=x onerror=alert(1)>' },
    ]);
  });
});

describe('isEmojiOnly', () => {
  it('is true for up to three emoji', () => {
    expect(isEmojiOnly('🌿')).toBe(true);
    expect(isEmojiOnly('🙏 ❤️ ✨')).toBe(true);
    expect(isEmojiOnly('👨‍👩‍👧')).toBe(true);
  });
  it('is false for text, digits, many emoji or nothing', () => {
    expect(isEmojiOnly('Hallo 🌿')).toBe(false);
    expect(isEmojiOnly('123')).toBe(false);
    expect(isEmojiOnly('🌿🌿🌿🌿')).toBe(false);
    expect(isEmojiOnly('')).toBe(false);
  });
});

describe('formatChatTime', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  it('shows only the time today', () => {
    expect(formatChatTime(new Date('2026-10-21T10:32:00Z'), now)).toBe('12:32');
  });
  it('says "Gestern" for yesterday', () => {
    expect(formatChatTime(new Date('2026-10-20T10:32:00Z'), now)).toBe('Gestern 12:32');
  });
  it('shows day and month for older messages', () => {
    expect(formatChatTime(new Date('2026-10-12T10:32:00Z'), now)).toBe('12.10. 12:32');
  });
  it('is empty without a date', () => {
    expect(formatChatTime(null)).toBe('');
  });
});

describe('bans', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  it('is active until the end date', () => {
    expect(isChatBanActive({ until: now + 1000 }, now)).toBe(true);
    expect(isChatBanActive({ until: now - 1000 }, now)).toBe(false);
    expect(isChatBanActive(null, now)).toBe(false);
  });
  it('describes a permanent ban and a temporary mute differently', () => {
    expect(describeChatBan({ until: CHAT_PERMANENT_UNTIL_MS }, now)).toMatch(/ausgeschlossen/);
    expect(describeChatBan({ until: now + 3_600_000 }, now)).toMatch(/stumm geschaltet/);
    expect(describeChatBan({ until: now - 1 }, now)).toBe('');
  });
});

describe('canEnterChat (feature flag)', () => {
  it('follows the mode', () => {
    expect(canEnterChat({ mode: 'off', isAdmin: true })).toBe(false);
    expect(canEnterChat({ mode: undefined, isAdmin: true })).toBe(false);
    expect(canEnterChat({ mode: 'admins', isAdmin: false })).toBe(false);
    expect(canEnterChat({ mode: 'admins', isAdmin: true })).toBe(true);
    expect(canEnterChat({ mode: 'all', isAdmin: false })).toBe(true);
  });
});

describe('chatAuthorName', () => {
  it('prefers the profile name, then the account name, then "Gast"', () => {
    expect(chatAuthorName({ displayName: ' Mira ' }, { displayName: 'x' })).toBe('Mira');
    expect(chatAuthorName({ displayName: '' }, { displayName: 'Tom' })).toBe('Tom');
    expect(chatAuthorName(null, null)).toBe('Gast');
    expect(chatAuthorName({ displayName: 'a'.repeat(200) }, null)).toHaveLength(80);
  });
});

describe('server side retention and report mails', () => {
  it('computes the retention cutoff', () => {
    expect(retentionCutoffMs(10 * 86_400_000, 10)).toBe(0);
  });
  it('throttles report mails', () => {
    expect(shouldSendReportMail(null, 1000)).toBe(true);
    expect(shouldSendReportMail(1000, 1000 + REPORT_MAIL_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(shouldSendReportMail(1000, 1000 + REPORT_MAIL_MIN_INTERVAL_MS)).toBe(true);
  });
  it('builds a mail with a shortened one-line excerpt', () => {
    const mail = buildReportMail(
      { messageAuthorName: 'Mira', messageText: 'x\n'.repeat(300) },
      3,
      'https://example.test'
    );
    expect(mail.subject).toMatch(/Meldung/);
    expect(mail.text).toContain('Mira');
    expect(mail.text).toContain('3 Meldungen');
    expect(mail.text.split('\n').length).toBeLessThan(10);
  });
});

describe('chatPhotoUrl', () => {
  it('keeps Storage, Google and emulator photos', () => {
    for (const url of [
      'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media',
      'https://lh3.googleusercontent.com/a/abc=s96-c',
      'https://lh5.googleusercontent.com/a/abc',
      'http://127.0.0.1:9299/v0/b/x/o/a.jpg',
    ]) {
      expect(chatPhotoUrl(url)).toBe(url);
    }
  });
  it('drops data: URLs, foreign hosts and non-strings', () => {
    expect(chatPhotoUrl('data:image/svg+xml;utf8,<svg/>')).toBeNull();
    expect(chatPhotoUrl('https://evil.example/x.png')).toBeNull();
    expect(chatPhotoUrl('https://firebasestorage.googleapis.com.evil.example/x')).toBeNull();
    expect(chatPhotoUrl(null)).toBeNull();
  });
});

describe('presence', () => {
  const now = 1_000_000;
  const entry = (name: string, ageMs: number | null) => ({
    uid: name,
    name,
    lastSeenMs: ageMs === null ? null : now - ageMs,
  });
  it('counts heartbeats younger than two minutes, sorted by name', () => {
    const list = onlineMembers(
      [
        entry('Mira', 1000),
        entry('Anna', PRESENCE_ONLINE_MS - 1),
        entry('Alt', PRESENCE_ONLINE_MS),
        entry('Leer', null),
      ],
      now
    );
    expect(list.map((m) => m.name)).toEqual(['Anna', 'Mira']);
  });
  it('describes who is online', () => {
    const m = (name: string) => ({ name });
    expect(describeOnline([])).toBe('');
    expect(describeOnline([m('Mira')] as never)).toBe('Mira');
    expect(describeOnline([m('Mira'), m('Jonas')] as never)).toBe('Mira und Jonas');
    expect(describeOnline([m('A'), m('B'), m('C'), m('D')] as never)).toBe('A, B und 2 weitere');
  });
});

describe('isUnsentMessage', () => {
  // Minimal stand-in for a Firestore DocumentSnapshot.
  const snap = (hasPendingWrites: boolean, createdAt: unknown) => ({
    metadata: { hasPendingWrites },
    get: (field: string, opts?: { serverTimestamps?: string }) =>
      field === 'createdAt' && opts?.serverTimestamps === 'none' ? createdAt : undefined,
  });

  it('is true only while the create of the message is unconfirmed', () => {
    expect(isUnsentMessage(snap(true, null))).toBe(true);
    expect(isUnsentMessage(snap(false, { seconds: 1 }))).toBe(false);
  });

  it('a pending reaction on a saved message does not count as unsent', () => {
    expect(isUnsentMessage(snap(true, { seconds: 1 }))).toBe(false);
  });
});

describe('mentionTargets (server side)', () => {
  it('takes the uids, never the author, no duplicates', () => {
    expect(mentionTargets({ a: 'Anna', me: 'Ich', b: 'Bob' }, 'me')).toEqual(['a', 'b']);
  });

  it('caps at MENTION_MAX', () => {
    const raw = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`u${i}`, 'x']));
    expect(mentionTargets(raw, 'me')).toHaveLength(MENTION_MAX);
  });

  it('ignores garbage and path-like uids', () => {
    expect(mentionTargets(null, 'me')).toEqual([]);
    expect(mentionTargets(['a'], 'me')).toEqual([]);
    expect(mentionTargets('a', 'me')).toEqual([]);
    expect(mentionTargets({ 'a/b': 'x', ok: 'y' }, 'me')).toEqual(['ok']);
  });
});

describe('mentionExcerpt', () => {
  it('flattens whitespace and shortens', () => {
    expect(mentionExcerpt('  Hallo\n\n  @Anna   komm ')).toBe('Hallo @Anna komm');
    const long = mentionExcerpt('x'.repeat(500));
    expect(long).toHaveLength(MENTION_EXCERPT_MAX);
    expect(long.endsWith('…')).toBe(true);
  });

  it('survives non-strings', () => {
    expect(mentionExcerpt(undefined)).toBe('');
  });
});

describe('canReceiveChatMention', () => {
  it('follows the chat flag', () => {
    expect(canReceiveChatMention('all', false)).toBe(true);
    expect(canReceiveChatMention('admins', false)).toBe(false);
    expect(canReceiveChatMention('admins', true)).toBe(true);
    expect(canReceiveChatMention('off', true)).toBe(false);
    expect(canReceiveChatMention(undefined, true)).toBe(false);
  });
});
