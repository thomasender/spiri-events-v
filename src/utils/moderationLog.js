// Super-Admin tab "Protokoll": pure helpers for the moderation log
// (`moderation_log/{id}`, written by functions/src/eventRevisionTrigger.ts,
// entry shape in functions/src/moderationLog.ts). Kept free of Firebase
// imports, tested in tests/components/moderationLog.spec.ts.

export const MODERATION_LOG_PAGE_SIZE = 50;

// Action -> label and tone (colour of the chip). Order = order in the filter.
export const ACTION_META = {
  approved: { label: 'Genehmigt', tone: 'success' },
  rejected: { label: 'Abgelehnt', tone: 'error' },
  returned: { label: 'Zur Überarbeitung', tone: 'warning' },
  unpublished: { label: 'Offline genommen', tone: 'warning' },
  trashed: { label: 'In den Papierkorb', tone: 'error' },
  restored: { label: 'Wiederhergestellt', tone: 'info' },
  deleted: { label: 'Endgültig gelöscht', tone: 'error' },
  edited: { label: 'Bearbeitet', tone: 'info' },
  cancelled: { label: 'Abgesagt', tone: 'warning' },
  submitted: { label: 'Eingereicht', tone: 'neutral' },
  status: { label: 'Status geändert', tone: 'neutral' },
};

export const ACTION_OPTIONS = Object.entries(ACTION_META).map(([id, meta]) => ({
  id,
  label: meta.label,
}));

export function actionLabel(action) {
  return ACTION_META[action]?.label || action || '–';
}

export function actionTone(action) {
  return ACTION_META[action]?.tone || 'neutral';
}

const ROLE_LABELS = {
  Admin: 'Super-Admin',
  RegionModerator: 'Moderator:in',
  User: 'Veranstalter:in',
  System: 'System',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Unbekannt';
}

/** Name of the person, or what she is when no name is known. */
export function actorDisplayName(entry, namesByUid = {}) {
  if (entry?.actorRole === 'System') return 'System (automatisch)';
  return entry?.actorName || namesByUid[entry?.actorUid] || 'Unbekannt';
}

// Who: the team only (default) or everyone incl. organizers and system jobs.
export const WHO_TEAM = 'team';
export const WHO_ALL = 'all';

export const PERIOD_OPTIONS = [
  { id: '1d', label: 'Letzte 24 Stunden', days: 1 },
  { id: '7d', label: 'Letzte 7 Tage', days: 7 },
  { id: '30d', label: 'Letzte 30 Tage', days: 30 },
  { id: '90d', label: 'Letzte 90 Tage', days: 90 },
  { id: '365d', label: 'Letzte 12 Monate', days: 365 },
  { id: 'all', label: 'Gesamter Zeitraum', days: null },
  { id: 'custom', label: 'Eigener Zeitraum …', days: null },
];

export const DEFAULT_FILTERS = {
  regionId: '',
  actorUid: '',
  action: '',
  who: WHO_TEAM,
  period: '30d',
  from: '',
  to: '',
};

/** 'YYYY-MM-DD' -> local midnight, or null. */
function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Time window of the filters: { start, end } as Date or null (open). A custom
 * "bis" includes the whole day.
 */
export function periodRange(filters, now = new Date()) {
  const period = PERIOD_OPTIONS.find((p) => p.id === filters?.period);
  if (period?.days) {
    return { start: new Date(now.getTime() - period.days * 24 * 60 * 60 * 1000), end: null };
  }
  if (filters?.period === 'custom') {
    const start = parseDay(filters.from);
    const toDay = parseDay(filters.to);
    const end = toDay ? new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1) : null;
    return { start, end };
  }
  return { start: null, end: null };
}

/**
 * The server-side part of the filters as a plain description, turned into a
 * Firestore query by useModerationLog: equality filters (region, person,
 * action, team) plus the time window, always newest first. Every equality
 * field has its own (field, at desc) index in firestore.indexes.json;
 * Firestore merges them for combinations.
 */
export function buildLogQuerySpec(filters, now = new Date()) {
  const where = [];
  if (filters?.regionId) where.push(['regionId', '==', filters.regionId]);
  if (filters?.actorUid) where.push(['actorUid', '==', filters.actorUid]);
  else if (filters?.who !== WHO_ALL) where.push(['byStaff', '==', true]);
  if (filters?.action) where.push(['action', '==', filters.action]);
  const { start, end } = periodRange(filters, now);
  if (start) where.push(['at', '>=', start]);
  if (end) where.push(['at', '<', end]);
  return { where, orderBy: ['at', 'desc'] };
}

/** Stable key of a query spec (for effect dependencies). */
export function querySpecKey(spec) {
  return JSON.stringify(spec, (_k, v) => (v instanceof Date ? v.toISOString() : v));
}

export function entryAtMillis(entry) {
  const at = entry?.at;
  if (!at) return 0;
  if (typeof at.toMillis === 'function') return at.toMillis();
  if (typeof at.toDate === 'function') return at.toDate().getTime();
  if (typeof at.seconds === 'number') return at.seconds * 1000;
  const ms = new Date(at).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

const DATE_TIME = new Intl.DateTimeFormat('de-AT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Vienna',
});

/** "Mo., 10.11.2026, 14:05" (Vienna time). */
export function formatLogTime(ms) {
  if (!ms) return '–';
  return DATE_TIME.format(new Date(ms));
}

function normalize(text) {
  return String(text ?? '')
    .toLocaleLowerCase('de')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Text search over the loaded entries: event title, person, region name,
 * action, reason and changed fields. Every word must match somewhere.
 */
export function matchesLogSearch(entry, search, { regionName = (id) => id, namesByUid } = {}) {
  const words = normalize(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(
    [
      entry.eventTitle,
      actorDisplayName(entry, namesByUid),
      roleLabel(entry.actorRole),
      regionName(entry.regionId),
      actionLabel(entry.action),
      entry.reason,
      ...(entry.changedFields || []),
    ]
      .filter(Boolean)
      .join(' ')
  );
  return words.every((w) => haystack.includes(w));
}

export const SORT_KEYS = ['at', 'action', 'eventTitle', 'regionId', 'actor'];

/**
 * Sorts the loaded entries by a column; ties fall back to newest first so
 * the order is stable.
 */
export function sortLogEntries(entries, sort, { regionName = (id) => id, namesByUid } = {}) {
  const key = SORT_KEYS.includes(sort?.key) ? sort.key : 'at';
  const dir = sort?.direction === 'asc' ? 1 : -1;
  const valueOf = (e) => {
    switch (key) {
      case 'action':
        return actionLabel(e.action);
      case 'eventTitle':
        return e.eventTitle || '';
      case 'regionId':
        return regionName(e.regionId) || '';
      case 'actor':
        return actorDisplayName(e, namesByUid);
      default:
        return entryAtMillis(e);
    }
  };
  return [...entries].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'de-AT');
    if (cmp !== 0) return cmp * dir;
    return entryAtMillis(b) - entryAtMillis(a);
  });
}

/** Header click: same column flips the direction, a new one starts sensibly. */
export function nextSort(sort, key) {
  if (sort?.key === key) return { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: key === 'at' ? 'desc' : 'asc' };
}

/** Counts per action over the shown entries, for the summary line. */
export function countByAction(entries) {
  const counts = {};
  for (const e of entries) counts[e.action] = (counts[e.action] || 0) + 1;
  return Object.keys(ACTION_META)
    .filter((id) => counts[id])
    .map((id) => ({ id, label: actionLabel(id), count: counts[id] }));
}

/** Persons for the filter: moderators from the Moderation tab plus everyone seen in the log. */
export function personOptions(moderators = [], entries = []) {
  const byUid = new Map();
  for (const m of moderators) {
    if (m?.uid) byUid.set(m.uid, m.displayName || m.email || m.uid);
  }
  for (const e of entries) {
    if (e?.actorUid && e.byStaff && !byUid.has(e.actorUid)) {
      byUid.set(e.actorUid, e.actorName || e.actorUid);
    }
  }
  return [...byUid.entries()]
    .map(([uid, name]) => ({ uid, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de-AT'));
}
