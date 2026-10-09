import { applyDateFilter, DATE_FILTER_OPTIONS } from './dateQuickFilters';

// Facet counts for the calendar filter chips: how many events a chip would
// show if the user switched it on, given every *other* active filter. A
// filter's own selection is ignored for its own counts — otherwise every
// chip the user has not picked would read 0.
//
// `occurrences` are the flattened event occurrences (see getEventOccurrences),
// `monthKey` is the visible month as "YYYY-MM". Category and Ort counts are
// for that month, matching the list the user sees. Date chips are counted
// over all upcoming occurrences because activating one jumps the calendar to
// the month it targets.
function matchesCategory(occurrence, selected) {
  return selected.length === 0 || (!!occurrence.category && selected.includes(occurrence.category));
}

function matchesOrt(occurrence, selected, onlineLocation) {
  if (selected.length === 0) return true;
  return selected.includes(occurrence.isOnline ? onlineLocation : occurrence.bezirk);
}

export function computeFacetCounts({
  occurrences,
  monthKey,
  selectedCategories,
  selectedOrte,
  dateFilter,
  onlineLocation,
  reference = new Date(),
}) {
  const inMonth = occurrences.filter((o) => o.date.startsWith(monthKey));

  const category = {};
  const ort = {};
  for (const o of inMonth) {
    const dateOk = !dateFilter || applyDateFilter([o], dateFilter, reference).length > 0;
    if (!dateOk) continue;
    if (matchesOrt(o, selectedOrte, onlineLocation) && o.category) {
      category[o.category] = (category[o.category] || 0) + 1;
    }
    if (matchesCategory(o, selectedCategories)) {
      const key = o.isOnline ? onlineLocation : o.bezirk;
      if (key) ort[key] = (ort[key] || 0) + 1;
    }
  }

  const base = occurrences.filter(
    (o) => matchesCategory(o, selectedCategories) && matchesOrt(o, selectedOrte, onlineLocation)
  );
  const date = {};
  for (const { id } of DATE_FILTER_OPTIONS) {
    date[id] = applyDateFilter(base, id, reference).length;
  }

  return { category, ort, date };
}
