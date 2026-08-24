// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html) => {
      if (!html || typeof html !== 'string') return '';
      return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/ on[a-z]+="[^"]*"/gi, '')
        .replace(/ on[a-z]+='[^']*'/gi, '')
        .replace(/<a\b[^>]*>/gi, (match) => {
          if (/href="javascript:/i.test(match)) return '<a>';
          return match;
        });
    },
  },
}));

import { render, screen } from '@testing-library/react';
import RichTextView from '../../src/components/RichTextView';

describe('RichTextView', () => {
  it('renders allowed html', () => {
    const { container } = render(<RichTextView html="<p>Hallo <strong>Welt</strong>!</p>" />);
    expect(container.querySelector('strong')).toBeInTheDocument();
    expect(container.textContent).toContain('Hallo Welt!');
  });

  it('renders lists', () => {
    const { container } = render(
      <RichTextView html="<ul><li>erstens</li><li>zweitens</li></ul>" />
    );
    expect(container.querySelector('ul')).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('strips script tags', () => {
    const { container } = render(<RichTextView html="<p>safe</p><script>alert(1)</script>" />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('safe');
  });

  it('strips iframe tags', () => {
    const { container } = render(
      <RichTextView html='<iframe src="https://evil.example"></iframe><p>ok</p>' />
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('strips inline event handlers', () => {
    const { container } = render(<RichTextView html='<p><img src="x" onerror="alert(1)"></p>' />);
    const rendered = container.innerHTML;
    expect(rendered).not.toContain('onerror');
  });

  it('strips javascript: URLs', () => {
    const { container } = render(<RichTextView html='<a href="javascript:alert(1)">x</a>' />);
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('returns null for empty input', () => {
    const { container } = render(<RichTextView html="" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null for non-string input', () => {
    const { container } = render(<RichTextView html={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('truncates when truncate prop is set', () => {
    const long = 'a'.repeat(500);
    render(<RichTextView html={`<p>${long}</p>`} truncate={50} />);
    const text = screen.getByText(/…$/);
    expect(text.textContent.length).toBeLessThanOrEqual(51);
  });

  it('renders full text when below truncate length', () => {
    render(<RichTextView html="<p>kurz</p>" truncate={100} />);
    expect(screen.getByText('kurz')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<RichTextView html="<p>x</p>" className="event-description" />);
    expect(container.querySelector('.event-description')).toBeInTheDocument();
  });
});
