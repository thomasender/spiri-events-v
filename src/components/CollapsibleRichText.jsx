import { useEffect, useId, useRef, useState } from 'react';
import RichTextView from './RichTextView';
import './CollapsibleRichText.css';

/**
 * Event description limited to about ten lines. The "Weiterlesen" toggle only
 * appears when the text really is cut off (measured on the rendered element, so
 * it holds for any screen width). Line height and max-height are both in em, so
 * "ten lines" stays ten lines whatever the font size.
 */
export default function CollapsibleRichText({ html }) {
  const contentRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentId = useId();

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return undefined;
    const measure = () => {
      // While expanded the full text is visible and nothing is cut off, so the
      // last measurement (taken when collapsed) must stay.
      if (el.classList.contains('collapsible-rich-text__content--expanded')) return;
      setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [html]);

  const collapsed = overflowing && !expanded;

  return (
    <div className="collapsible-rich-text">
      <div
        ref={contentRef}
        id={contentId}
        className={`collapsible-rich-text__content${
          expanded ? ' collapsible-rich-text__content--expanded' : ''
        }${collapsed ? ' collapsible-rich-text__content--faded' : ''}`}
      >
        <RichTextView html={html} />
      </div>
      {overflowing && (
        <button
          type="button"
          className="collapsible-rich-text__toggle detail-link"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Weniger lesen' : 'Weiterlesen'}
        </button>
      )}
    </div>
  );
}
