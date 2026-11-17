// Colloquial German wording of an event date and time for the registration form and
// mails ("heute Dienstagabend um 19:30 Uhr"). Pure and timezone-safe: "today" is
// the day in Europe/Vienna, never UTC. Client twin: src/utils/occurrenceDescription.js
// (same logic, both covered by tests/components/occurrenceDescription.spec.ts).

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})/;

/** Part of the day of an hour: morgens 5-10, vormittags 10-12, mittags 12-14, nachmittags 14-18, abends 18-22, nachts 22-5. */
function dayPart(hour: number): { adverb: string; compound: string } {
  if (hour >= 5 && hour < 10) return { adverb: 'morgens', compound: 'morgen' };
  if (hour >= 10 && hour < 12) return { adverb: 'vormittags', compound: 'vormittag' };
  if (hour >= 12 && hour < 14) return { adverb: 'mittags', compound: 'mittag' };
  if (hour >= 14 && hour < 18) return { adverb: 'nachmittags', compound: 'nachmittag' };
  if (hour >= 18 && hour < 22) return { adverb: 'abends', compound: 'abend' };
  return { adverb: 'nachts', compound: 'nacht' };
}

/** Today's date (YYYY-MM-DD) in Vienna. */
function viennaToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function utcDay(iso: string): number {
  const m = ISO_DATE.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
}

/**
 * "heute Dienstagabend um 19:30 Uhr", "morgen Mittwochvormittag um 10:00 Uhr",
 * "diese Woche am Freitagmorgen um 8:00 Uhr", otherwise
 * "am Dienstag, 24. November, abends um 19:30 Uhr" (with the year when it is not the
 * current one). Without a usable time only the day is named. Empty for a bad date.
 */
export function describeOccurrence(
  date: string | null | undefined,
  time?: string | null,
  now: Date = new Date()
): string {
  const target = utcDay(date ?? '');
  if (Number.isNaN(target)) return '';
  const today = viennaToday(now);
  const diff = Math.round((target - utcDay(today)) / 86_400_000);
  const d = new Date(target);
  const weekday = WEEKDAYS[d.getUTCDay()];

  const t = TIME.exec((time ?? '').trim());
  const hour = t ? Number(t[1]) : NaN;
  const minute = t ? Number(t[2]) : NaN;
  const hasTime = t !== null && hour <= 23 && minute <= 59;
  const part = hasTime ? dayPart(hour) : null;
  const clock = hasTime ? ` um ${hour}:${t![2]} Uhr` : '';

  if (diff === 0 || diff === 1) {
    const lead = diff === 0 ? 'heute' : 'morgen';
    return part ? `${lead} ${weekday}${part.compound}${clock}` : lead;
  }

  // Same calendar week (Monday to Sunday) as today, later than tomorrow.
  const mondayOffset = (day: number) => (day + 6) % 7;
  const todayDow = new Date(utcDay(today)).getUTCDay();
  if (diff > 1 && diff <= 6 - mondayOffset(todayDow)) {
    return `diese Woche am ${weekday}${part ? part.compound : ''}${clock}`;
  }

  const year = Number(today.slice(0, 4));
  const yearLabel = d.getUTCFullYear() === year ? '' : ` ${d.getUTCFullYear()}`;
  const dayLabel = `am ${weekday}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}${yearLabel}`;
  return part ? `${dayLabel}, ${part.adverb}${clock}` : dayLabel;
}
