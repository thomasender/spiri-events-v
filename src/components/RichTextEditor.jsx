import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Check,
  X,
  ImagePlus,
} from 'lucide-react';
import { sanitizeHtml, getPlainTextLength, MAX_DESCRIPTION_LENGTH } from '../utils/sanitize';
import { uploadDescriptionImage, MAX_INPUT_SIZE_BYTES } from '../lib/imageUpload';
import './RichTextEditor.css';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  eventId = 'temp',
  onImageError,
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInitial, setLinkInitial] = useState('');
  const [plainLength, setPlainLength] = useState(() => getPlainTextLength(value));
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState(null);
  const fileInputRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        hardBreak: true,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: 'rte-embedded-image' },
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

  const handleImageButtonClick = () => {
    setImageError(null);
    fileInputRef.current?.click();
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      const msg = 'Nur JPEG, PNG und WebP erlaubt';
      setImageError(msg);
      onImageError?.(msg);
      return;
    }
    if (file.size > MAX_INPUT_SIZE_BYTES) {
      const msg = `Bild ist zu groß (max. ${Math.round(MAX_INPUT_SIZE_BYTES / 1024 / 1024)}MB)`;
      setImageError(msg);
      onImageError?.(msg);
      return;
    }

    setImageError(null);
    setImageUploading(true);
    try {
      const url = await uploadDescriptionImage(file, eventId);
      const alt = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Eingebettetes Bild';
      editor.chain().focus().setImage({ src: url, alt }).run();
    } catch (err) {
      console.error('Description image upload failed:', err);
      const msg = 'Bild-Upload fehlgeschlagen';
      setImageError(msg);
      onImageError?.(msg);
    } finally {
      setImageUploading(false);
    }
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
        <ToolbarButton
          label="Bild einfügen"
          active={editor.isActive('image')}
          disabled={imageUploading}
          onClick={handleImageButtonClick}
        >
          <ImagePlus size={16} />
        </ToolbarButton>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleImageFileChange}
        className="rte-image-file-input"
        data-testid="description-image-input"
        aria-hidden="true"
        tabIndex={-1}
      />

      {linkOpen && (
        <LinkPopover
          initialUrl={linkInitial}
          onApply={applyLink}
          onCancel={() => setLinkOpen(false)}
        />
      )}

      {imageUploading && (
        <div className="rte-image-status" role="status" data-testid="description-image-uploading">
          Bild wird hochgeladen…
        </div>
      )}
      {imageError && !imageUploading && (
        <div className="rte-image-status rte-image-status--error" role="alert">
          {imageError}
        </div>
      )}

      <EditorContent editor={editor} className="rte-editor-surface" />

      <div className={`rte-counter${overLimit ? ' rte-counter--over' : ''}`}>
        {plainLength} / {maxLength} Zeichen
      </div>
    </div>
  );
}

export default RichTextEditor;
