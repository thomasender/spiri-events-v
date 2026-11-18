// Duplicate detection for new events (Trello 6afdc0ce). Pure functions, no React
// and no Firebase, so an import job can reuse them later.
//
// A hit is an approved event on the same day that
//   - has a similar title (and a place that does not clearly differ), or
//   - is at the same place at (almost) the same time.
// Both need the times not to be clearly apart. The thresholds are on purpose
// cautious: a false alarm annoys organisers, a missed duplicate is caught by the
// admin review anyway.

export const TITLE_SIMILARITY_THRESHOLD = 0.6;
export const TIME_TOLERANCE_MINUTES = 60;
export const MAX_DUPLICATE_CANDIDATES = 3;

const STOP_WORDS = new Set([
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einen',
  'und',
  'mit',
  'in',
  'im',
  'am',
  'an',
  'auf',
  'bei',
  'fuer',
  'von',
  'vom',
  'zu',
  'zum',
  'zur',
  'ab',
  'um',
  'the',
  'and',
  'with',
  'of',
  'event',
  'veranstaltung',
  'workshop',
  'abend',
]);

function foldText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Words of a title: lower case, umlauts and special characters folded, filler words dropped.
// Falls back to all words when nothing but filler is left ("Der Abend").
export function normalizeTitle(title) {
  const words = foldText(title).split(' ').filter(Boolean);
  const meaningful = words.filter((word) => !STOP_WORDS.has(word));
  return meaningful.length > 0 ? meaningful : words;
}

function wordsMatch(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // "Kakaozeremonie" / "Kakaozeremonien": same stem.
  return short.length >= 5 && long.startsWith(short);
}

// 0..1, Dice coefficient over the words of both titles.
export function titleSimilarity(a, b) {
  const wordsA = normalizeTitle(a);
  const wordsB = normalizeTitle(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const remaining = [...wordsB];
  let shared = 0;
  for (const word of wordsA) {
    const index = remaining.findIndex((other) => wordsMatch(word, other));
    if (index !== -1) {
      shared += 1;
      remaining.splice(index, 1);
    }
  }
  return (2 * shared) / (wordsA.length + wordsB.length);
}

function toMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// 'close' within the tolerance, 'apart' when both are known and further away, 'unknown' otherwise.
function compareTimes(a, b) {
  const minutesA = toMinutes(a);
  const minutesB = toMinutes(b);
  if (minutesA === null || minutesB === null) return 'unknown';
  return Math.abs(minutesA - minutesB) <= TIME_TOLERANCE_MINUTES ? 'close' : 'apart';
}

// 'same' | 'sameCity' | 'online' | 'different'
function compareVenues(a, b) {
  const onlineA = Boolean(a.isOnline);
  const onlineB = Boolean(b.isOnline);
  if (onlineA && onlineB) return 'online';
  if (onlineA || onlineB) return 'different';
  const cityA = foldText(a.city);
  const cityB = foldText(b.city);
  if (cityA && cityB && cityA !== cityB) return 'different';
  const placeA = foldText(a.place);
  const placeB = foldText(b.place);
  if (placeA && placeB) {
    const similarity = titleSimilarityWords(placeA, placeB);
    if (similarity >= 0.5) return 'same';
    if (cityA && cityA === cityB && similarity === 0) return 'different';
    return 'sameCity';
  }
  if (cityA && cityA === cityB) return placeA || placeB ? 'sameCity' : 'same';
  return 'sameCity';
}

// Same word overlap for place texts (street + number), without dropping filler words.
function titleSimilarityWords(a, b) {
  const wordsA = a.split(' ').filter(Boolean);
  const wordsB = b.split(' ').filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const shared = wordsA.filter((word) => wordsB.some((other) => wordsMatch(word, other))).length;
  return (2 * shared) / (wordsA.length + wordsB.length);
}

// Start day plus, for a custom series, every single date.
function eventDays(event) {
  const days = new Set();
  if (event?.date) days.add(event.date);
  if (event?.recurrence === 'custom' && Array.isArray(event.customDates)) {
    event.customDates.forEach((day) => day && days.add(day));
  }
  return days;
}

function timeOnDay(event, day) {
  const own = event.customTimes?.[day];
  return own?.time || event.time || '';
}

// Candidates for a new event, best first, at most `limit`.
// `draft` and the entries of `approvedEvents` use the event fields (title, date, time, city,
// place, isOnline, recurrence, customDates, customTimes); `draft.id` is left out of the result.
export function findDuplicateCandidates(
  draft,
  approvedEvents,
  { limit = MAX_DUPLICATE_CANDIDATES } = {}
) {
  if (!draft || !Array.isArray(approvedEvents)) return [];
  const draftDays = eventDays(draft);
  if (draftDays.size === 0) return [];

  const hits = [];
  for (const event of approvedEvents) {
    if (!event || (draft.id && event.id === draft.id)) continue;
    if (event.status && event.status !== 'approved') continue;

    const commonDays = [...eventDays(event)].filter((day) => draftDays.has(day)).sort();
    if (commonDays.length === 0) continue;

    const similarity = titleSimilarity(draft.title, event.title);
    const venue = compareVenues(draft, event);

    let best = null;
    for (const day of commonDays) {
      const timing = compareTimes(timeOnDay(draft, day), timeOnDay(event, day));
      if (timing === 'apart') continue;
      const sameTitle = similarity >= TITLE_SIMILARITY_THRESHOLD && venue !== 'different';
      const sameVenueAndTime = venue === 'same' && timing === 'close';
      if (!sameTitle && !sameVenueAndTime) continue;
      const score = similarity + (venue === 'same' ? 0.5 : 0) + (timing === 'close' ? 0.25 : 0);
      if (!best || score > best.score) best = { score, day };
    }
    if (best) hits.push({ event, score: best.score, day: best.day });
  }

  return hits
    .sort((a, b) => b.score - a.score || String(a.event.id).localeCompare(String(b.event.id)))
    .slice(0, limit);
}
