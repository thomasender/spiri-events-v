import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li'];
const ALLOWED_ATTR = ['href', 'rel', 'target'];

const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    KEEP_CONTENT: true,
  });
}

export function stripHtml(html) {
  const clean = sanitizeHtml(html);
  if (typeof document === 'undefined') {
    return clean
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = clean;
  return (tmp.textContent || '').replace(/ /g, ' ').trim();
}

export function getPlainTextLength(html) {
  return stripHtml(html).length;
}

export function isHtmlEmpty(html) {
  return getPlainTextLength(html) === 0;
}

export function truncateHtmlText(html, maxChars) {
  const text = stripHtml(html);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + '…';
}

export const MAX_DESCRIPTION_LENGTH = 5000;
