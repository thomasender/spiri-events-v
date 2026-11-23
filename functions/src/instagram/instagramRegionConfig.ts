/**
 * Which regions get the weekly carousel and the daily stories, and how their
 * Bezirke are written. Pure logic (tests/lib/instagramCarousel.spec.ts and
 * instagramStory.spec.ts). Every region uses the same layouts; only the Bezirk
 * wording, the hashtag and the shown site domain differ.
 *
 * Vorarlberg keeps its historic list (incl. the legacy pseudo-Bezirk
 * "Grenznahe") and wording, byte for byte. Other regions take their Bezirke
 * from the region register (regionData.ts). Which account posts is decided by
 * the wrappers (resolveCredentialsForRegion); a region without a usable
 * account is skipped there.
 */

import { DEFAULT_REGION_ID } from '../regions';
import { REGION_DATA } from '../regionData';
import { siteDomainForRegion, toHashtag } from './instagramContent';
import { sanitizeError } from './instagramPublish';

/** Vorarlberg's carousel/story Bezirke. Online events are excluded. */
export const CAROUSEL_BEZIRKE = [
  'Dornbirn',
  'Feldkirch',
  'Bregenz',
  'Bludenz',
  'Grenznahe',
] as const;
export type CarouselBezirk = (typeof CAROUSEL_BEZIRKE)[number];

/**
 * Regions whose weekly carousel and daily stories are switched on, in run
 * order. Another region is added here (after checking its wording below); it
 * still posts only once instagram_private/region_{id} holds a usable account.
 */
export const INSTAGRAM_SCHEDULED_REGION_IDS: readonly string[] = [DEFAULT_REGION_ID, 'bodensee'];

export function isScheduledInstagramRegion(regionId: unknown): regionId is string {
  return typeof regionId === 'string' && INSTAGRAM_SCHEDULED_REGION_IDS.includes(regionId);
}

/** Region id of a group/record; missing means Vorarlberg (historic records have none). */
export function regionOrDefault(regionId: unknown): string {
  return typeof regionId === 'string' && regionId ? regionId : DEFAULT_REGION_ID;
}

/** Bezirke that get a carousel / story in this region; empty for unknown regions. */
export function carouselBezirkeFor(regionId: string = DEFAULT_REGION_ID): readonly string[] {
  if (regionId === DEFAULT_REGION_ID) return CAROUSEL_BEZIRKE;
  return REGION_DATA.find((r) => r.slug === regionId)?.bezirke ?? [];
}

function subdivisionLabelOf(regionId: string): string {
  return REGION_DATA.find((r) => r.slug === regionId)?.subdivisionLabel ?? 'Bezirk';
}

/** "Landkreis Lindau (Bodensee)" -> "Landkreis Lindau": the bracket only disambiguates. */
function withoutBracket(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** The name carries its own kind word ("Landkreis Konstanz", "Bodenseekreis"). */
function hasKindWord(name: string): boolean {
  return /^(Landkreis|Region|Städteregion|Regionalverband) /.test(name) || /kreis$/i.test(name);
}

/** Human-readable name: "Umgebung", "Dornbirn", "Landkreis Lindau", "Bodenseekreis". */
export function bezirkLabel(bezirk: string, regionId: string = DEFAULT_REGION_ID): string {
  if (regionId === DEFAULT_REGION_ID) return bezirk === 'Grenznahe' ? 'Umgebung' : bezirk;
  return withoutBracket(bezirk);
}

/**
 * Caption wording: "in Dornbirn", "in der Umgebung" (Vorarlberg, unchanged);
 * "im Landkreis Konstanz", "im Bodenseekreis", "im Landkreis Lindau".
 */
export function bezirkInPhrase(bezirk: string, regionId: string = DEFAULT_REGION_ID): string {
  if (regionId === DEFAULT_REGION_ID) {
    return bezirk === 'Grenznahe' ? 'in der Umgebung' : `in ${bezirk}`;
  }
  const label = bezirkLabel(bezirk, regionId);
  return hasKindWord(label) ? `im ${label}` : `in ${label}`;
}

/**
 * Cover wording: "im Bezirk Dornbirn" (the kind word before the name), "in der
 * Umgebung"; names that carry their kind ("Landkreis Konstanz") keep it.
 */
export function bezirkCoverPhrase(bezirk: string, regionId: string = DEFAULT_REGION_ID): string {
  if (regionId === DEFAULT_REGION_ID) {
    return bezirk === 'Grenznahe' ? bezirkInPhrase(bezirk) : `im Bezirk ${bezirk}`;
  }
  const label = bezirkLabel(bezirk, regionId);
  if (hasKindWord(label)) return `im ${label}`;
  return `im ${subdivisionLabelOf(regionId)} ${label}`;
}

/**
 * Place hashtag of a carousel: "#dornbirn", "#grenznahe" (Vorarlberg, unchanged);
 * otherwise the name without its kind word: "#konstanz", "#bodenseekreis", "#lindau".
 */
export function bezirkHashtag(bezirk: string, regionId: string = DEFAULT_REGION_ID): string | null {
  if (regionId === DEFAULT_REGION_ID) return toHashtag(bezirk);
  return toHashtag(bezirkLabel(bezirk, regionId).replace(/^Landkreis /, ''));
}

/**
 * Domain shown on carousel covers, stories and in captions. Undefined for
 * Vorarlberg so its models stay exactly as before (renderer default = .at).
 */
export function regionSiteDomain(regionId: string = DEFAULT_REGION_ID): string | undefined {
  return regionId === DEFAULT_REGION_ID ? undefined : siteDomainForRegion(regionId);
}

/** " (Region bodensee)" for admin mails of other regions; '' for Vorarlberg (unchanged). */
export function regionMailSuffix(regionId: string = DEFAULT_REGION_ID): string {
  return regionId === DEFAULT_REGION_ID ? '' : ` (Region ${regionId})`;
}

export type RegionRunResult<T> =
  | { regionId: string; status: 'ran'; outcome: T }
  | { regionId: string; status: 'no-account' }
  | { regionId: string; status: 'error'; error: string };

/**
 * Runs `run` for each region in order. `prepare` returns null when the region
 * has no usable account (skipped quietly, nothing written). A region that
 * throws is logged and never stops the regions after it.
 */
export async function runForRegions<D, T>(
  regionIds: readonly string[],
  prepare: (regionId: string) => Promise<D | null>,
  run: (deps: D, regionId: string) => Promise<T>,
  log: (message: string, data?: Record<string, unknown>) => void = () => undefined
): Promise<RegionRunResult<T>[]> {
  const results: RegionRunResult<T>[] = [];
  for (const regionId of regionIds) {
    try {
      const deps = await prepare(regionId);
      if (!deps) {
        log('Instagram region has no usable account; skipping', { regionId });
        results.push({ regionId, status: 'no-account' });
        continue;
      }
      results.push({ regionId, status: 'ran', outcome: await run(deps, regionId) });
    } catch (err) {
      const error = sanitizeError(err);
      log('Instagram region run crashed; continuing with the next region', { regionId, error });
      results.push({ regionId, status: 'error', error });
    }
  }
  return results;
}
