import { useLayoutEffect, useRef } from 'react';

// Inline text: plain text in view mode; in edit mode the very same element
// becomes editable (plain text only, so pasted formatting never sneaks in).
// `multiline` allows line breaks (Enter), otherwise Enter just leaves the field.
export default function EditableText({
  value,
  onChange,
  editing,
  as: Tag = 'span',
  multiline = false,
  placeholder = 'Text eingeben …',
  className = '',
  maxLength = 1200,
}) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    const current = el.innerText.replace(/\n$/, '');
    if (current !== value) el.textContent = value;
  }, [value, editing]);

  if (!editing) {
    return <Tag className={`xmas-text ${className}`.trim()}>{value}</Tag>;
  }

  return (
    <Tag
      ref={ref}
      className={`xmas-text xmas-text--edit ${className}`.trim()}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline={multiline}
      aria-label={placeholder}
      data-placeholder={placeholder}
      data-empty={value ? undefined : 'true'}
      onInput={(e) => onChange(e.currentTarget.innerText.replace(/\n$/, '').slice(0, maxLength))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
