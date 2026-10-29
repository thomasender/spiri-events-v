const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthKeyToDate(key) {
  if (typeof key !== 'string' || !MONTH_KEY_RE.test(key)) return null;
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export function dateToMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Default ("rolling") calendar view: today .. today + ROLLING_DAYS instead of
// the calendar month, so the end of a month does not look empty. Returns ISO
// date strings (YYYY-MM-DD) in local time; both ends are inclusive.
export const ROLLING_DAYS = 30;

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export function getRollingRange(now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ROLLING_DAYS);
  return { from: toIsoDate(now), to: toIsoDate(end) };
}

// Number of filters the visitor has set, for the "(n Filter gesetzt)" hint next
// to the event count. Every single chosen value counts (2 categories + 1 Bezirk
// = 3), the date quick filter counts once, favourites only while the visitor is
// signed in. "Online" lives in selectedOrte and counts like a Bezirk. The month
// / rolling range (navigation) and place + radius are deliberately not counted.
// count > 0 exactly when CalendarPage's hasActiveFilter is true.
export function countActiveFilters({
  selectedCategories = [],
  selectedOrte = [],
  dateFilter = null,
  favoritesFilterActive = false,
} = {}) {
  return (
    selectedCategories.length +
    selectedOrte.length +
    (dateFilter ? 1 : 0) +
    (favoritesFilterActive ? 1 : 0)
  );
}
