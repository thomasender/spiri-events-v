// Thin helpers that build privacy-safe parameters for trackEvent calls.
// Never pass free text or personal data through here.
import { EVENTS, trackEvent } from './analytics';
import { getPrimaryCategory } from '../utils/eventFormat';

/** Hostname of an http(s) URL that leaves this site, otherwise null. */
export function externalDomain(href, base) {
  try {
    const url = new URL(href, base ?? window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const own = new URL(base ?? window.location.href).hostname;
    return url.hostname === own ? null : url.hostname;
  } catch {
    return null;
  }
}

/** select_content for an opened event card / list row. */
export function trackEventOpen(event) {
  if (!event) return;
  trackEvent(EVENTS.SELECT_CONTENT, {
    content_type: 'event',
    item_id: event.slug || event.id,
    category: getPrimaryCategory(event) || undefined,
  });
}

/** filter_apply; `value` must be a category / region / preset name, never free text. */
export function trackFilter(filterType, value) {
  trackEvent(EVENTS.FILTER_APPLY, { filter_type: filterType, value });
}

/** Strip e-mail addresses and cut to 100 chars for the exception event. */
export function safeErrorDescription(error) {
  const raw = String(error?.message ?? error ?? 'unknown');
  return raw.replace(/[^\s@]+@[^\s@]+/g, '[email]').slice(0, 100);
}
