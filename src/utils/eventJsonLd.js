// schema.org/Event structured data, shared by the browser (EventDetailPage)
// and the build-time prerender (scripts/prerender.mjs) so crawlers and
// AI assistants see the same facts whichever HTML they fetch. Pure and free of
// browser APIs: the prerender runs it in plain Node.
import { DEFAULT_CURRENCY } from './currency.js';
import { isEventCancelled } from './eventCancellation.js';

const SITE_URL = 'https://www.thetribe.at';
const TIME_ZONE = 'Europe/Vienna';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// "+02:00" / "+01:00" for Vorarlberg on the given day (summer/winter time).
// Empty string when Intl cannot tell, so callers fall back to a bare date.
function viennaOffset(dateStr) {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      timeZoneName: 'longOffset',
    })
      .formatToParts(new Date(Date.UTC(y, m - 1, d, 12)))
      .find((p) => p.type === 'timeZoneName');
    const match = /GMT([+-]\d{2}:\d{2})/.exec(part?.value || '');
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

// Google wants a full ISO 8601 date-time with offset; a bare date is only the
// fallback for events without a (valid) start time.
export function toIsoDateTime(dateStr, timeStr) {
  if (!DATE_RE.test(dateStr || '')) return undefined;
  if (!TIME_RE.test(timeStr || '')) return dateStr;
  const offset = viennaOffset(dateStr);
  return offset ? `${dateStr}T${timeStr}:00${offset}` : dateStr;
}

export function stripHtmlToText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function buildOffers(event) {
  const currency = event.priceCurrency || DEFAULT_CURRENCY;
  const availability = 'https://schema.org/InStock';
  const withNote = (offer) => (event.feeNote ? { ...offer, description: event.feeNote } : offer);

  if (event.contribution === 'free') {
    return { '@type': 'Offer', price: '0', priceCurrency: currency, availability };
  }
  if (event.contribution === 'donation') {
    return {
      '@type': 'Offer',
      price: '0',
      priceCurrency: currency,
      availability,
      description: 'Freie Spende',
    };
  }
  if (event.fee != null && event.fee !== '') {
    if (event.feeMax != null && event.feeMax !== '' && Number(event.feeMax) > Number(event.fee)) {
      return withNote({
        '@type': 'AggregateOffer',
        lowPrice: String(event.fee),
        highPrice: String(Number(event.feeMax)),
        priceCurrency: currency,
        availability,
      });
    }
    return withNote({
      '@type': 'Offer',
      price: String(event.fee),
      priceCurrency: currency,
      availability,
    });
  }
  return null;
}

function buildLocation(event) {
  if (event.isOnline) {
    return {
      '@type': 'VirtualLocation',
      ...(event.link && { url: event.link }),
    };
  }
  return {
    '@type': 'Place',
    name: event.place || event.bezirk || 'Vorarlberg',
    address: {
      '@type': 'PostalAddress',
      addressLocality: event.city || event.bezirk || 'Vorarlberg',
      addressRegion: 'Vorarlberg',
      addressCountry: 'AT',
    },
  };
}

// `image` and `description` are passed in because the two callers derive them
// differently (prerender needs an absolute URL).
export function buildEventJsonLd(event, { image, description } = {}) {
  const startDate = toIsoDateTime(event.date, event.time);
  const endDay = DATE_RE.test(event.endDate || '') ? event.endDate : event.date;
  // An end time without an end date belongs to the start day.
  const endDate = event.endTime
    ? toIsoDateTime(endDay, event.endTime)
    : DATE_RE.test(event.endDate || '') && event.endDate !== event.date
      ? event.endDate
      : undefined;
  const offers = buildOffers(event);
  const organizerName = event.organizer?.name?.trim();
  const slug = event.slug || event.id;

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate,
    ...(endDate && { endDate }),
    eventStatus: isEventCancelled(event)
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: event.isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location: buildLocation(event),
    description: description ?? stripHtmlToText(event.description),
    ...(image && { image }),
    ...(slug && { url: `${SITE_URL}/event/${slug}` }),
    ...(organizerName && { organizer: { '@type': 'Organization', name: organizerName } }),
    ...(offers && { offers }),
    inLanguage: 'de-AT',
  };
}
