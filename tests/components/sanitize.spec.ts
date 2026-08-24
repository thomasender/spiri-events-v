// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('dompurify', () => {
  return {
    default: {
      sanitize: (html, options = {}) => {
        if (!html || typeof html !== 'string') return '';
        const ALLOWED_TAGS = options.ALLOWED_TAGS || [];
        const isSafeUrl = (url) => {
          if (!url) return true;
          if (/^javascript:/i.test(url)) return false;
          if (/^data:text\/html/i.test(url)) return false;
          return true;
        };

        let result = html;

        result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        result = result.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
        result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
        result = result.replace(/ on[a-z]+="[^"]*"/gi, '');
        result = result.replace(/ on[a-z]+='[^']*'/gi, '');

        result = result.replace(/<a\b[^>]*>/gi, (match) => {
          return match.replace(/href="([^"]*)"/i, (_, href) => {
            return isSafeUrl(href) ? match : 'href=""';
          });
        });

        result = result.replace(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi, (match, slash, tag) => {
          const lower = tag.toLowerCase();
          if (ALLOWED_TAGS.includes(lower)) return match;
          return '';
        });

        return result;
      },
    },
  };
});

import {
  sanitizeHtml,
  stripHtml,
  getPlainTextLength,
  isHtmlEmpty,
  truncateHtmlText,
} from '../../src/utils/sanitize';

describe('sanitizeHtml', () => {
  it('keeps allowed tags', () => {
    expect(sanitizeHtml('<p>Hallo <strong>Welt</strong>!</p>')).toContain('<strong>');
    expect(sanitizeHtml('<p>Hallo <strong>Welt</strong>!</p>')).toContain('Hallo');
  });

  it('keeps ul/ol/li', () => {
    expect(sanitizeHtml('<ul><li>a</li><li>b</li></ul>')).toContain('<ul>');
    expect(sanitizeHtml('<ul><li>a</li><li>b</li></ul>')).toContain('<li>');
  });

  it('strips <script> tags', () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert(1)');
  });

  it('strips <iframe> tags', () => {
    const out = sanitizeHtml('<p>hi</p><iframe src="https://evil.example"></iframe>');
    expect(out).not.toContain('<iframe>');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeHtml('<p><img src="x" onerror="alert(1)"></p>');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('strips <style> tags', () => {
    const out = sanitizeHtml('<style>body{display:none}</style><p>safe</p>');
    expect(out).not.toContain('<style>');
  });

  it('keeps safe links', () => {
    const out = sanitizeHtml('<p>mehr <a href="https://example.org">hier</a></p>');
    expect(out).toContain('href="https://example.org"');
  });

  it('strips javascript: URLs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips data:text/html URLs', () => {
    const out = sanitizeHtml('<a href="data:text/html,foo">x</a>');
    expect(out).not.toContain('data:text/html');
  });

  it('strips heading tags (not in whitelist)', () => {
    const out = sanitizeHtml('<h1>title</h1><p>body</p>');
    expect(out).not.toContain('<h1>');
    expect(out).toContain('title');
    expect(out).toContain('body');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
  });
});

describe('stripHtml', () => {
  it('removes all tags and returns text content', () => {
    expect(stripHtml('<p>Hallo <strong>Welt</strong>!</p>')).toBe('Hallo Welt!');
  });

  it('returns empty string for empty html', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml('<p></p>')).toBe('');
  });
});

describe('getPlainTextLength', () => {
  it('counts plain text length ignoring tags', () => {
    expect(getPlainTextLength('<p>Hello <strong>World</strong></p>')).toBe(11);
  });

  it('returns 0 for empty html', () => {
    expect(getPlainTextLength('')).toBe(0);
    expect(getPlainTextLength('<p></p>')).toBe(0);
  });
});

describe('isHtmlEmpty', () => {
  it('returns true for empty html', () => {
    expect(isHtmlEmpty('')).toBe(true);
    expect(isHtmlEmpty('<p></p>')).toBe(true);
  });

  it('returns false for non-empty html', () => {
    expect(isHtmlEmpty('<p>x</p>')).toBe(false);
  });
});

describe('truncateHtmlText', () => {
  it('returns the plain text when shorter than max', () => {
    expect(truncateHtmlText('<p>short</p>', 100)).toBe('short');
  });

  it('truncates with ellipsis when longer', () => {
    const long = 'a'.repeat(200);
    expect(truncateHtmlText(`<p>${long}</p>`, 50)).toHaveLength(51);
    expect(truncateHtmlText(`<p>${long}</p>`, 50)).toMatch(/…$/);
  });
});
