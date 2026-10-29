import {
  DEFAULT_SUBDIVISION_LABEL,
  getBezirke,
  getSubdivisionLabel,
  getSubdivisionLabelPlural,
  isRegionSlug,
  ONLINE_LOCATION,
  selectableBezirke,
} from './regions';

// Pure logic behind the "Region" field of the event and profile forms (no
// React, no Firebase, so it is unit-testable).

/**
 * `enabled` is true only with two or more active regions; with one the forms
 * show no region field and behave exactly as before. `options` are the regions
 * the person may pick, `defaultRegionId` the preselection (current region if
 * selectable, else the first option).
 */
export function buildRegionChoices({
  activeRegions = [],
  allRegions = [],
  access = null,
  currentRegionId = '',
  keepRegionId = '',
}) {
  const enabled = activeRegions.length >= 2;
  if (!enabled) {
    return { enabled, options: [], defaultRegionId: currentRegionId, allRegions };
  }
  const keep = [].concat(keepRegionId || []);
  const options = allRegions.filter(
    (r) => r.active || Boolean(access?.canModerateRegion?.(r.id)) || keep.includes(r.id)
  );
  const defaultRegionId = options.some((r) => r.id === currentRegionId)
    ? currentRegionId
    : (options[0]?.id ?? currentRegionId);
  return { enabled, options, defaultRegionId, allRegions };
}

/** The region a form currently stands on: its own choice if still offered, else the default. */
export function selectedRegionId(formRegionId, choices) {
  if (isRegionSlug(formRegionId) && choices.options.some((r) => r.id === formRegionId)) {
    return formRegionId;
  }
  return choices.defaultRegionId;
}

/**
 * Sub-area (Bezirk / Landkreis) label and options for a region. Legacy pseudo-Bezirke
 * ("Grenznahe") are never offered for an event.
 */
export function subdivisionFor(regionId, choices) {
  if (!choices.enabled) return { label: DEFAULT_SUBDIVISION_LABEL, options: null };
  return {
    label: getSubdivisionLabel(regionId, choices.allRegions),
    options: selectableBezirke(getBezirke(regionId, choices.allRegions)),
  };
}

/** Keeps `current` only if it is a sub-area of `regionId`; otherwise ''. */
export function keepIfInRegion(current, regionId, choices) {
  if (!current) return '';
  return getBezirke(regionId, choices.allRegions).includes(current) ? current : '';
}

/**
 * Districts a directory profile may name for the chosen regions (grouped, in
 * region order), plus whether "Online" is offered. `regionIds` empty -> no groups.
 */
export function directoryDistrictGroups(regionIds, choices) {
  return choices.allRegions
    .filter((r) => regionIds.includes(r.id) && (r.bezirke ?? []).length > 0)
    .map((r) => ({
      regionId: r.id,
      regionName: r.name,
      label: getSubdivisionLabelPlural(r.id, choices.allRegions),
      districts: r.bezirke,
    }));
}

/** Districts to keep after the chosen regions changed (others are dropped). */
export function districtsAfterRegionChange(districts, regionIds, choices) {
  const allowed = new Set(directoryDistrictGroups(regionIds, choices).flatMap((g) => g.districts));
  return districts.filter((d) => allowed.has(d) || d === ONLINE_LOCATION);
}
