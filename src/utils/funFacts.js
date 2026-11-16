// Super-Admin tab "Fun Facts": formatting helpers for the numbers of the
// callable adminFunFacts (functions/src/funFacts.ts). No Firebase imports,
// tested in tests/components/FunFactsTab.spec.tsx.

export const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTH_LABELS = [
  'Jän',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

const numberFormat = new Intl.NumberFormat('de-DE');

export function formatCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? numberFormat.format(value) : '–';
}

/** Share in whole percent ("42 %"), or '' without a base. */
export function formatShare(part, total) {
  if (!total || typeof part !== 'number') return '';
  return `${Math.round((part / total) * 100)} %`;
}

/** ISO -> "26.08.2026" (Vienna). */
export function formatDay(iso) {
  if (!iso) return '–';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleDateString('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** ISO -> "16.11.2026, 14:05" (Vienna). */
export function formatDateTime(iso) {
  if (!iso) return '–';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleString('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Duration in words, the two largest units: "2 Tage 4 Std.", "3 Std. 20 Min.", "5 Min.". */
export function formatSpan(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '–';
  if (ms < MINUTE) return 'unter 1 Min.';
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) {
    const d = `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
    return hours ? `${d} ${hours} Std.` : d;
  }
  if (hours > 0) return minutes ? `${hours} Std. ${minutes} Min.` : `${hours} Std.`;
  return `${minutes} Min.`;
}

/** Index of the largest value (first one on a tie), or -1 when all are 0. */
export function peakIndex(values) {
  let best = -1;
  (values ?? []).forEach((v, i) => {
    if (v > 0 && (best < 0 || v > values[best])) best = i;
  });
  return best;
}

export function funFactsErrorMessage(error) {
  const code = String(error?.code || '').replace(/^functions\//, '');
  if (code === 'permission-denied') return 'Die Fun Facts sind nur für Super-Admins sichtbar.';
  if (code === 'unauthenticated')
    return 'Du bist nicht mehr angemeldet. Bitte melde dich erneut an.';
  return 'Die Fun Facts konnten nicht geladen werden. Bitte versuche es später noch einmal.';
}
