import { describe, expect, it } from 'vitest';
import {
  MENTION_MAX,
  findMentionToken,
  foldName,
  foldQuery,
  mentionsInText,
  replaceMentionToken,
  sanitizeMentions,
  splitMentions,
} from '../../src/utils/mentions';

describe('foldName', () => {
  it('lowercases, drops accents and collapses spaces', () => {
    expect(foldName('  Zoë   Müller ')).toBe('zoe muller');
  });
});

describe('foldQuery', () => {
  it('keeps a trailing space so a finished name does not match any more', () => {
    expect(foldQuery('Anna')).toBe('anna');
    expect(foldQuery('Anna ')).toBe('anna ');
    expect(foldQuery('Anna Maria ')).toBe('anna maria ');
  });
});

describe('findMentionToken', () => {
  it('finds the @ at the start of a word', () => {
    expect(findMentionToken('Hallo @An', 9)).toEqual({ start: 6, end: 9, query: 'An' });
    expect(findMentionToken('@Anna', 5)).toEqual({ start: 0, end: 5, query: 'Anna' });
  });

  it('allows names with spaces, up to three words', () => {
    expect(findMentionToken('@Anna Ma', 8)?.query).toBe('Anna Ma');
    expect(findMentionToken('@a b c d', 8)).toBeNull();
  });

  it('ignores e-mail addresses and a bare @', () => {
    expect(findMentionToken('mail anna@web.at', 16)).toBeNull();
    expect(findMentionToken('Hallo @', 7)).toBeNull();
    expect(findMentionToken('Hallo @ Anna', 12)).toBeNull();
  });

  it('only looks before the caret and stops at line breaks', () => {
    expect(findMentionToken('@Anna und mehr', 5)?.query).toBe('Anna');
    expect(findMentionToken('@Anna\nzwei', 10)).toBeNull();
  });
});

describe('replaceMentionToken', () => {
  it('inserts the name with a trailing space and moves the caret behind it', () => {
    const token = findMentionToken('Hi @an dort', 6)!;
    expect(replaceMentionToken('Hi @an dort', token, 'Anna Maria')).toEqual({
      text: 'Hi @Anna Maria  dort',
      caret: 15,
    });
  });
});

describe('sanitizeMentions', () => {
  it('keeps only string names, trimmed, capped at MENTION_MAX', () => {
    const raw: Record<string, unknown> = { a: ' Anna ', b: 5, c: '', d: null };
    for (let i = 0; i < 20; i++) raw[`u${i}`] = `Name ${i}`;
    const clean = sanitizeMentions(raw);
    expect(clean.a).toBe('Anna');
    expect(clean.b).toBeUndefined();
    expect(clean.c).toBeUndefined();
    expect(Object.keys(clean)).toHaveLength(MENTION_MAX);
  });

  it('rejects non-objects', () => {
    expect(sanitizeMentions(null)).toEqual({});
    expect(sanitizeMentions(['x'])).toEqual({});
    expect(sanitizeMentions('x')).toEqual({});
  });
});

describe('mentionsInText', () => {
  const picked = { u1: 'Anna', u2: 'Anna Maria', u3: 'Bob' };

  it('keeps picked people whose name is still in the text', () => {
    expect(mentionsInText('Hallo @Anna und @Bob!', picked)).toEqual({ u1: 'Anna', u3: 'Bob' });
  });

  it('drops a mention whose name was deleted', () => {
    expect(mentionsInText('Hallo Bob', picked)).toEqual({});
  });

  it('does not count a longer name as the shorter one', () => {
    expect(mentionsInText('Hi @Anna Maria', picked)).toEqual({ u2: 'Anna Maria' });
    expect(mentionsInText('Hi @Annabelle', picked)).toEqual({});
  });
});

describe('splitMentions', () => {
  it('marks mentions and keeps the surrounding text', () => {
    expect(splitMentions('Hi @Anna Maria, komm!', { u2: 'Anna Maria' })).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'mention', value: '@Anna Maria', uid: 'u2' },
      { type: 'text', value: ', komm!' },
    ]);
  });

  it('handles neighbouring mentions', () => {
    const parts = splitMentions('@Anna @Bob', { u1: 'Anna', u3: 'Bob' });
    expect(parts.filter((p) => p.type === 'mention').map((p) => p.uid)).toEqual(['u1', 'u3']);
  });

  it('leaves an @Name without an entry as plain text', () => {
    expect(splitMentions('Hi @Anna', {})).toEqual([{ type: 'text', value: 'Hi @Anna' }]);
    expect(splitMentions('Hi @Anna', { u3: 'Bob' })).toEqual([{ type: 'text', value: 'Hi @Anna' }]);
  });

  it('takes the longest name first and respects word boundaries', () => {
    const parts = splitMentions('@Anna Maria und @Annabel', { u1: 'Anna', u2: 'Anna Maria' });
    expect(parts.filter((p) => p.type === 'mention')).toEqual([
      { type: 'mention', value: '@Anna Maria', uid: 'u2' },
    ]);
  });

  it('is safe with regex characters in names', () => {
    const parts = splitMentions('Hi @A.(b)+', { u1: 'A.(b)+' });
    expect(parts[1]).toEqual({ type: 'mention', value: '@A.(b)+', uid: 'u1' });
  });
});
