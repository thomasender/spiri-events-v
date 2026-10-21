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
  Smile,
} from 'lucide-react';
import { sanitizeHtml, getPlainTextLength, MAX_DESCRIPTION_LENGTH } from '../utils/sanitize';
import { uploadDescriptionImage, MAX_INPUT_SIZE_BYTES } from '../lib/imageUpload';
import './RichTextEditor.css';

const EMOJIS = [
  '😊',
  '😀',
  '😁',
  '😂',
  '🥰',
  '😍',
  '😘',
  '🙂',
  '😉',
  '😌',
  '🤗',
  '🤔',
  '😅',
  '😢',
  '🙏',
  '🙌',
  '👍',
  '👏',
  '💪',
  '👋',
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '✨',
  '🌟',
  '🔥',
  '🌈',
  '☀️',
  '🌙',
  '🌿',
  '🌸',
  '🌻',
  '🍀',
  '🌍',
  '🕉️',
  '🧘',
  '🕯️',
  '🎶',
  '🎉',
  '📅',
  '📍',
  '✅',
  '⚠️',
  '❗',
  '❓',
];

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Dropping or pasting a whole folder by accident would otherwise start dozens of uploads.
const MAX_IMAGES_PER_INSERT = 5;

const hasFiles = (dataTransfer) => Array.from(dataTransfer?.types || []).includes('Files');

const getImageFiles = (dataTransfer) =>
  Array.from(dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'));

const ToolbarButton = ({ active, onClick, disabled, label, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-pressed={Boolean(active)}
    title={label}
    tabIndex={-1}
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
  uploadImage,
  onImageError,
  enableEmoji = true,
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInitial, setLinkInitial] = useState('');
  const [plainLength, setPlainLength] = useState(() => getPlainTextLength(value));
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [imageError, setImageError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const imageUploading = uploadCount > 0;
  const fileInputRef = useRef(null);
  // useEditor captures editorProps once, so the drop/paste handlers reach the
  // current props and upload logic through this ref instead of a stale closure.
  const insertImageFilesRef = useRef(() => {});
  // Tracks the last HTML we forwarded to the parent via onChange, so the
  // `value`-`setContent` effect can distinguish a parent-driven update from
  // the roundtrip of our own onChange. Without this, every keystroke
  // re-invokes setContent (re-parses the doc, normalizes whitespace, drops the
  // trailingBreak DOM hack), which is what makes the first character after an
  // image upload silently disappear.
  const lastForwardedHtml = useRef('');

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
        // Inline images sit inside the surrounding paragraph, so inserting an
        // image no longer splits the doc into a block image plus an empty
        // trailing paragraph (whose <br class="ProseMirror-trailingBreak"> DOM
        // hack swallows the user's first keystroke).
        inline: true,
        allowBase64: false,
        HTMLAttributes: { class: 'rte-embedded-image' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    editorProps: {
      handleDrop(view, event) {
        const files = getImageFiles(event.dataTransfer);
        if (files.length === 0) {
          // Dropped files that are not images must not navigate away from the page.
          if (hasFiles(event.dataTransfer)) {
            event.preventDefault();
            insertImageFilesRef.current([]);
            return true;
          }
          return false;
        }
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        insertImageFilesRef.current(files, coords?.pos);
        return true;
      },
      handlePaste(view, event) {
        const files = getImageFiles(event.clipboardData);
        if (files.length === 0) return false;
        event.preventDefault();
        insertImageFilesRef.current(files);
        return true;
      },
      attributes: {
        class: `rte-content${hasError ? ' rte-content--error' : ''}`,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(id ? { id } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
      },
      // Preserve trailing whitespace inside paragraphs so a single space typed
      // between words or after an image isn't collapsed on the next re-render.
      parseOptions: {
        preserveWhitespace: 'full',
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      const clean = sanitizeHtml(html);
      const len = getPlainTextLength(clean);
      setPlainLength(len);
      if (onChange) {
        lastForwardedHtml.current = clean;
        onChange(clean);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    // Ignore the roundtrip from our own onChange. Otherwise every keystroke
    // would tear down the doc and re-parse it via setContent, losing the
    // trailing whitespace the user just typed.
    if (value === lastForwardedHtml.current) return;
    // External value change (initial load, profile switch): sync once.
    lastForwardedHtml.current = value || '';
    editor.commands.setContent(value || '', { emitUpdate: false });
    setPlainLength(getPlainTextLength(value || ''));
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

  const reportImageError = (msg) => {
    setImageError(msg);
    onImageError?.(msg);
  };

  const validateImageFile = (file) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Nur JPEG, PNG und WebP erlaubt';
    if (file.size > MAX_INPUT_SIZE_BYTES) {
      return `Bild ist zu groß (max. ${Math.round(MAX_INPUT_SIZE_BYTES / 1024 / 1024)}MB)`;
    }
    return null;
  };

  const insertImageFiles = async (files, pos) => {
    if (!editor) return;
    setImageError(null);
    const batch = files.slice(0, MAX_IMAGES_PER_INSERT);
    if (files.length > batch.length) {
      reportImageError(`Es werden nur die ersten ${MAX_IMAGES_PER_INSERT} Bilder eingefügt`);
    } else if (files.length === 0) {
      reportImageError('Nur JPEG, PNG und WebP erlaubt');
      return;
    }
    // Land the first image where it was dropped; later ones follow the cursor.
    if (pos != null) editor.commands.setTextSelection(pos);

    for (const file of batch) {
      const validationError = validateImageFile(file);
      if (validationError) {
        reportImageError(validationError);
        continue;
      }
      setUploadCount((n) => n + 1);
      try {
        const url = uploadImage
          ? await uploadImage(file)
          : await uploadDescriptionImage(file, eventId);
        const alt = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Eingebettetes Bild';
        editor.chain().focus().setImage({ src: url, alt }).run();
      } catch (err) {
        console.error('Description image upload failed:', err);
        reportImageError('Bild-Upload fehlgeschlagen');
      } finally {
        setUploadCount((n) => n - 1);
      }
    }
  };
  useEffect(() => {
    // Runs after every render so the drop/paste handlers never see stale props.
    insertImageFilesRef.current = (files, pos) => insertImageFiles(files, pos);
  });

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

  const handleImageFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length > 0) insertImageFiles(files.slice(0, 1));
  };

  return (
    <div
      className={`rte-wrapper${hasError ? ' rte-wrapper--error' : ''}${dragOver ? ' rte-wrapper--dragover' : ''}`}
      data-testid={testId}
      onDragOver={(e) => {
        if (hasFiles(e.dataTransfer)) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
      }}
      onDrop={() => setDragOver(false)}
    >
      <EditorContent editor={editor} className="rte-editor-surface" />
      {dragOver && (
        <div className="rte-drop-hint" aria-hidden="true">
          Bild hier ablegen
        </div>
      )}

      <div className={`rte-counter${overLimit ? ' rte-counter--over' : ''}`}>
        {plainLength} / {maxLength} Zeichen
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
        {enableEmoji && (
          <ToolbarButton
            label="Emoji einfügen"
            active={emojiOpen}
            onClick={() => setEmojiOpen((open) => !open)}
          >
            <Smile size={16} />
          </ToolbarButton>
        )}
      </div>

      {enableEmoji && emojiOpen && (
        <div className="rte-emoji-popover" role="dialog" aria-label="Emoji auswählen">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rte-emoji-btn"
              aria-label={`Emoji ${emoji}`}
              onClick={() => {
                editor.chain().focus().insertContent(emoji).run();
                setEmojiOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

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
    </div>
  );
}

export default RichTextEditor;
