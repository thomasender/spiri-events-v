import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li', 'img'];
const ALLOWED_ATTR = ['href', 'rel', 'target', 'src', 'alt', 'title'];

const ALLOWED_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const PROD_IMG_SRC_REGEXP =
  /^https:\/\/(?:firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//i;
const EMULATOR_IMG_SRC_REGEXP = /^http:\/\/localhost:9299\//i;
const ALLOWED_IMG_SRC_REGEXP =
  import.meta.env.VITE_USE_EMULATORS === 'true'
    ? /^(?:https:\/\/(?:firebasestorage\.googleapis\.com|storage\.googleapis\.com)\/|http:\/\/localhost:9299\/)/i
    : PROD_IMG_SRC_REGEXP;

export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const cleaned = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    KEEP_CONTENT: true,
    ALLOW_DATA_ATTR: false,
  });
  return stripUnsafeImages(cleaned);
}

function stripUnsafeImages(html) {
  if (typeof document === 'undefined') {
    return html.replace(/<img\b[^>]*>/gi, (match) => {
      const srcMatch = match.match(/src=(["'])([^"']+)\1/i);
      const src = srcMatch ? srcMatch[2] : '';
      return ALLOWED_IMG_SRC_REGEXP.test(src) ? match : '';
    });
  }
  if (typeof document === 'undefined') return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const imgs = tmp.querySelectorAll('img');
  imgs.forEach((img) => {
    if (!ALLOWED_IMG_SRC_REGEXP.test(img.getAttribute('src') || '')) {
      img.remove();
    }
  });
  return tmp.innerHTML;
}

export function isAllowedImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return ALLOWED_IMG_SRC_REGEXP.test(url);
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
