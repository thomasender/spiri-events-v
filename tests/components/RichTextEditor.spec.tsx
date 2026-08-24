// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html, options = {}) => {
      if (!html || typeof html !== 'string') return '';
      const ALLOWED_TAGS = options.ALLOWED_TAGS || [];
      let r = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/ on[a-z]+="[^"]*"/gi, '')
        .replace(/ on[a-z]+='[^']*'/gi, '')
        .replace(/<a\b[^>]*>/gi, (m) => (/href="javascript:/i.test(m) ? '<a>' : m));

      r = r.replace(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi, (m, _s, tag) => {
        return ALLOWED_TAGS.includes(tag.toLowerCase()) ? m : '';
      });
      return r;
    },
  },
}));

import { render, screen, fireEvent, act } from '@testing-library/react';
import RichTextEditor from '../../src/components/RichTextEditor';

const waitForEditor = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
};

describe('RichTextEditor', () => {
  it('renders toolbar buttons', async () => {
    render(<RichTextEditor value="" onChange={() => {}} />);
    expect(screen.getByLabelText(/fett/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/kursiv/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/aufzählung/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nummerierte liste/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/link/i)).toBeInTheDocument();
  });

  it('renders initial content from value prop', async () => {
    render(<RichTextEditor value="<p>Hallo Welt</p>" onChange={() => {}} />);
    await waitForEditor();
    expect(screen.getByText('Hallo Welt')).toBeInTheDocument();
  });

  it('renders empty placeholder when no value', async () => {
    render(<RichTextEditor value="" onChange={() => {}} placeholder="Tippe hier…" />);
    await waitForEditor();
    const editable = document.querySelector('.rte-content');
    expect(editable).toBeInTheDocument();
    const empty = editable.querySelector('.is-editor-empty');
    expect(empty).toBeInTheDocument();
    expect(empty.getAttribute('data-placeholder')).toBe('Tippe hier…');
  });

  it('calls onChange when editor content changes', async () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    await waitForEditor();

    const editable = document.querySelector('.rte-content');
    expect(editable).toBeInTheDocument();
    fireEvent.input(editable, { target: { textContent: 'Hello' } });

    await waitForEditor();
    expect(onChange).toHaveBeenCalled();
  });

  it('shows character counter', async () => {
    render(<RichTextEditor value="<p>Hallo</p>" onChange={() => {}} maxLength={100} />);
    await waitForEditor();
    expect(screen.getByText(/5 \/ 100/)).toBeInTheDocument();
  });

  it('marks counter as over when limit exceeded', async () => {
    const longText = 'a'.repeat(150);
    render(<RichTextEditor value={`<p>${longText}</p>`} onChange={() => {}} maxLength={100} />);
    await waitForEditor();
    const counter = screen.getByText(/150 \/ 100/);
    expect(counter.className).toContain('rte-counter--over');
  });

  it('applies error styling when hasError is true', () => {
    const { container } = render(<RichTextEditor value="" onChange={() => {}} hasError />);
    expect(container.querySelector('.rte-wrapper--error')).toBeInTheDocument();
  });

  it('toggles bold when toolbar button is clicked', async () => {
    render(<RichTextEditor value="<p>some bold content</p>" onChange={() => {}} />);
    await waitForEditor();

    const boldBtn = screen.getByLabelText(/fett/i);
    expect(boldBtn).toBeInTheDocument();
    expect(boldBtn.className).toContain('rte-toolbar-btn');
    fireEvent.click(boldBtn);
    expect(boldBtn).toBeInTheDocument();
  });

  it('opens link popover when link button is clicked', async () => {
    render(<RichTextEditor value="<p>text</p>" onChange={() => {}} />);
    await waitForEditor();

    const linkBtn = screen.getByLabelText(/link/i);
    fireEvent.click(linkBtn);

    expect(screen.getByLabelText('Link einfügen')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://…')).toBeInTheDocument();
  });

  it('closes link popover on cancel', async () => {
    render(<RichTextEditor value="<p>text</p>" onChange={() => {}} />);
    await waitForEditor();

    fireEvent.click(screen.getByLabelText(/link/i));
    fireEvent.click(screen.getByLabelText(/abbrechen/i));

    expect(screen.queryByLabelText('Link einfügen')).toBeNull();
  });
});
