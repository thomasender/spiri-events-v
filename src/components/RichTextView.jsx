import { memo } from 'react';
import { sanitizeHtml, stripHtml, truncateHtmlText } from '../utils/sanitize';
import './RichTextView.css';

function RichTextViewInner({ html, className = '', truncate }) {
  if (!html || typeof html !== 'string') return null;

  const clean = sanitizeHtml(html);
  if (!clean) return null;

  if (truncate && typeof truncate === 'number' && stripHtml(clean).length > truncate) {
    const truncated = truncateHtmlText(clean, truncate);
    return (
      <div className={`rich-text-view rich-text-view--truncated ${className}`.trim()}>
        {truncated}
      </div>
    );
  }

  return (
    <div
      className={`rich-text-view ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

const RichTextView = memo(RichTextViewInner);
export default RichTextView;
