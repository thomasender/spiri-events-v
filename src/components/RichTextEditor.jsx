import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Check, X } from 'lucide-react';
import { sanitizeHtml, getPlainTextLength, MAX_DESCRIPTION_LENGTH } from '../utils/sanitize';
import './RichTextEditor.css';

const ToolbarButton = ({ active, onClick, disabled, label, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-pressed={Boolean(active)}
    title={label}
    className={`rte-toolbar-btn${active ? ' rte-toolbar-btn--active' : ''}`}
  >
    {children}
  </button>
);

const LinkPopover = ({ initialUrl, onApply, onCancel }) => {
  const [url, setUrl] = useState(initialUrl || '');

  useEffect(() => {
    setUrl(initialUrl || '');
  }, [initialUrl]);

  return (
    <div className="rte-link-popover" role="dialog" aria-label="Link einfügen">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className="rte-link-input"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onApply(url.trim());
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <button
        type="button"
        className="rte-link-btn rte-link-btn--confirm"
        onClick={() => onApply(url.trim())}
        aria-label="Link bestätigen"
      >
        <Check size={16} />
      </button>
      <button
        type="button"
        className="rte-link-btn rte-link-btn--cancel"
        onClick={onCancel}
        aria-label="Abbrechen"
      >
        <X size={16} />
      </button>
    </div>
  );
};

function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Beschreibe das Event…',
  maxLength = MAX_DESCRIPTION_LENGTH,
  hasError = false,
  describedBy,
  id,
  testId = 'description-editor',
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInitial, setLinkInitial] = useState('');
  const [plainLength, setPlainLength] = useState(() => getPlainTextLength(value));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        hardBreak: true,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: `rte-content${hasError ? ' rte-content--error' : ''}`,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(id ? { id } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      const clean = sanitizeHtml(html);
      const len = getPlainTextLength(clean);
      setPlainLength(len);
      if (onChange) onChange(clean);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
      setPlainLength(getPlainTextLength(value || ''));
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;
    if (hasError) {
      el.classList.add('rte-content--error');
    } else {
      el.classList.remove('rte-content--error');
    }
  }, [hasError, editor]);

  useEffect(() => {
    return () => {
      if (editor) editor.destroy();
    };
  }, [editor]);

  if (!editor) {
    return <div className="rte-loading">Editor lädt…</div>;
  }

  const overLimit = plainLength > maxLength;
  const openLinkPopover = () => {
    const previous = editor.getAttributes('link').href || '';
    setLinkInitial(previous);
    setLinkOpen(true);
  };

  const applyLink = (url) => {
    setLinkOpen(false);
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    let normalized = url;
    if (!/^(https?:|mailto:|tel:)/i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run();
  };

  return (
    <div className={`rte-wrapper${hasError ? ' rte-wrapper--error' : ''}`} data-testid={testId}>
      <div className="rte-toolbar" role="toolbar" aria-label="Formatierung">
        <ToolbarButton
          label="Fett (Strg+B)"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Kursiv (Strg+I)"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolbarButton>
        <span className="rte-toolbar-sep" aria-hidden="true" />
        <ToolbarButton
          label="Aufzählung"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Nummerierte Liste"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <span className="rte-toolbar-sep" aria-hidden="true" />
        <ToolbarButton
          label="Link (Strg+K)"
          active={editor.isActive('link')}
          onClick={openLinkPopover}
        >
          <LinkIcon size={16} />
        </ToolbarButton>
      </div>

      {linkOpen && (
        <LinkPopover
          initialUrl={linkInitial}
          onApply={applyLink}
          onCancel={() => setLinkOpen(false)}
        />
      )}

      <EditorContent editor={editor} className="rte-editor-surface" />

      <div className={`rte-counter${overLimit ? ' rte-counter--over' : ''}`}>
        {plainLength} / {maxLength} Zeichen
      </div>
    </div>
  );
}

export default RichTextEditor;
