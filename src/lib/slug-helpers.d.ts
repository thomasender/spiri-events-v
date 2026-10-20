export function slugify(input: string | number | null | undefined): string;
export function generateEventSlug(
  title: string | null | undefined,
  category: string | null | undefined,
  place: string | null | undefined,
  date: string | null | undefined
): string;
export function slugifyName(name: string | null | undefined): string;
export function eventSlugPlace(
  event: { isOnline?: boolean; city?: string | null; bezirk?: string | null } | null | undefined
): string;
export function planMissingEventSlugs(
  events: { id: string; data: Record<string, unknown> }[]
): { id: string; slug: string }[];
