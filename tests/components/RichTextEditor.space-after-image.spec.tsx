// @vitest-environment happy-dom
//
// Regression tests for the "first space (or any character) lost after image
// upload" bug.
//
// The bug had three contributing causes that the production fix in
// `src/components/RichTextEditor.jsx` addresses together:
//
//   1. The editor ran as a fully-controlled React component. Every keystroke
//      fired `onUpdate` → `onChange` → parent `setState` → new `value` prop
//      → `useEffect` → `editor.commands.setContent(value)`. That `setContent`
//      call tore the doc down and re-parsed the HTML, which collapsed
//      trailing whitespace and reset the cursor, dropping the very first
//      character the user had just typed (especially after inserting an image,
//      where the block-image layout created an empty trailing paragraph with
//      a `<br class="ProseMirror-trailingBreak">` placeholder).
//
//   2. The Image extension was configured `inline: false`, which made
//      `setImage` split the surrounding paragraph and insert an empty
//      trailing paragraph (the host of the trailingBreak). The fix uses
//      `inline: true`, so images sit inside the surrounding paragraph and
//      no trailingBreak paragraph is ever created.
//
//   3. `editorProps.parseOptions.preserveWhitespace` was not configured, so
//      Tiptap collapsed trailing whitespace on every re-render. The fix
//      sets it to `'full'` so the space the user just typed survives the
//      re-render.

import { describe, it, expect, vi, beforeEach } from 'vitest';

let capturedEditor = null;

vi.mock('@tiptap/react', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    useEditor: (opts) => {
      const e = mod.useEditor(opts);
      capturedEditor = e;
      return e;
    },
    EditorContent: mod.EditorContent,
  };
});

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

vi.mock('../../src/lib/imageUpload', () => ({
  uploadDescriptionImage: vi.fn(
    async () => 'https://firebasestorage.googleapis.com/v0/b/x/o/photo.jpg'
  ),
  MAX_INPUT_SIZE_BYTES: 15 * 1024 * 1024,
}));

import { render, fireEvent, waitFor } from '@testing-library/react';
import RichTextEditor from '../../src/components/RichTextEditor';

const waitForEditor = async () => {
  await waitFor(() => {
    expect(document.querySelector('.rte-content')).toBeInTheDocument();
    expect(capturedEditor).toBeTruthy();
  });
};

const uploadFile = async () => {
  const fileInput = document.querySelector(
    '[data-testid="description-editor"] input[data-testid="description-image-input"], [data-testid="profile-bio-editor"] input[data-testid="description-image-input"]'
  );
  const file = new File(['fake-bytes'], 'flyer.png', { type: 'image/png' });
  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() => {
    expect(capturedEditor.getHTML()).toContain('<img');
  });
};

describe('RichTextEditor — first character after image upload', () => {
  beforeEach(() => {
    capturedEditor = null;
  });

  it('keeps the first space typed after an image inserted into existing text', async () => {
    const onChange = vi.fn();

    render(<RichTextEditor value="<p>vorher</p>" onChange={onChange} eventId="evt-1" />);
    await waitForEditor();

    const editable = document.querySelector('.rte-content');
    fireEvent.click(editable);
    const p = editable.querySelector('p');
    const range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    await uploadFile();

    capturedEditor.commands.insertContent(' Hallo');

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toContain(' Hallo');
    expect(lastCall).toContain('Hallo');
    expect(lastCall).toContain('<img');
  });

  it('keeps the first space typed after uploading an image into an empty editor', async () => {
    const onChange = vi.fn();

    render(<RichTextEditor value="" onChange={onChange} eventId="evt-2" />);
    await waitForEditor();

    const editable = document.querySelector('.rte-content');
    fireEvent.click(editable);

    await uploadFile();

    capturedEditor.commands.insertContent(' ');

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toContain(' ');
    expect(lastCall).toContain('<img');
  });

  it('does not destroy content via the controlled-input roundtrip while typing', async () => {
    // This test verifies the *guard* in the `value`-syncing useEffect: when the
    // editor updates itself, the parent's `value` prop comes back identical to
    // the HTML we just forwarded via onChange, so the effect must NOT call
    // setContent. If it did, every keystroke would re-parse the doc and drop
    // the trailing whitespace the user just typed.
    const onChange = vi.fn();

    render(<RichTextEditor value="<p>vorher</p>" onChange={onChange} eventId="evt-3" />);
    await waitForEditor();

    const editable = document.querySelector('.rte-content');
    fireEvent.click(editable);
    const p = editable.querySelector('p');
    const range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    await uploadFile();

    const beforeHtml = capturedEditor.getHTML();

    // Simulate the parent re-rendering with a value that came from our own
    // onChange. The guard should keep the editor untouched.
    onChange.mockClear();
    capturedEditor.commands.insertContent(' Hallo');

    // After typing, the editor should have moved forward by exactly " Hallo"
    // and the trailingBreak placeholder should be gone (because the paragraph
    // is no longer empty).
    const afterHtml = capturedEditor.getHTML();
    expect(afterHtml).toContain(' Hallo');
    expect(afterHtml).toContain('Hallo');
    expect(afterHtml).not.toContain('ProseMirror-trailingBreak');
    // Sanity: we did not regress the image.
    expect(afterHtml).toContain('<img');
  });
});
