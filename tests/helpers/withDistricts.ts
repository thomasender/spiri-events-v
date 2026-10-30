/**
 * Test fixture: gives regions other districts than the generated register has
 * (`{ regionId: [districts] }`). In the app the districts come only from the register
 * in code, so a spec that needs a cultural region with Landkreise builds it here.
 */
export function withDistricts<R extends { id: string; bezirke: string[] }>(
  regions: readonly R[],
  districts: Record<string, string[]>
): R[] {
  return regions.map((r) => (districts[r.id] ? { ...r, bezirke: districts[r.id] } : r));
}
