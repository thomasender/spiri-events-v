import { describe, it, expect } from 'vitest';
import { replaceEmoticonBeforeCaret, replaceTrailingEmoticon } from '../../src/utils/emoticons';

describe('replaceEmoticonBeforeCaret', () => {
  it('converts an emoticon once a space follows it', () => {
    const r = replaceEmoticonBeforeCaret('Hallo :) ');
    expect(r?.text).toBe('Hallo 🙂 ');
    expect(r?.caret).toBe('Hallo 🙂 '.length);
    expect(r?.original).toBe(':) ');
  });
  it('works at the start of the text and with a nose', () => {
    expect(replaceEmoticonBeforeCaret(':-D ')?.text).toBe('😀 ');
    expect(replaceEmoticonBeforeCaret('<3 ')?.text).toBe('❤️ ');
  });
  it('prefers the longer emoticon', () => {
    expect(replaceEmoticonBeforeCaret('</3 ')?.text).toBe('💔 ');
    expect(replaceEmoticonBeforeCaret(':-) ')?.text).toBe('🙂 ');
  });
  it('only touches the emoticon before the caret', () => {
    const r = replaceEmoticonBeforeCaret('a :) b', 5);
    expect(r?.text).toBe('a 🙂 b');
  });
  it('ignores emoticons without a space, inside words, URLs and times', () => {
    expect(replaceEmoticonBeforeCaret('Hallo :)')).toBeNull();
    expect(replaceEmoticonBeforeCaret('foo:) ')).toBeNull();
    expect(replaceEmoticonBeforeCaret('https://thetribe.at ')).toBeNull();
    expect(replaceEmoticonBeforeCaret('um 12:30 ')).toBeNull();
    expect(replaceEmoticonBeforeCaret('(Test) ')).toBeNull();
  });
});

describe('replaceTrailingEmoticon', () => {
  it('converts an emoticon at the very end of a message', () => {
    expect(replaceTrailingEmoticon('Danke :)')).toBe('Danke 🙂');
    expect(replaceTrailingEmoticon(';)')).toBe('😉');
  });
  it('leaves everything else alone', () => {
    expect(replaceTrailingEmoticon('Danke :) dir')).toBe('Danke :) dir');
    expect(replaceTrailingEmoticon('Link https://x.at/:)')).toBe('Link https://x.at/:)');
  });
});
