/**
 * Pure rules for when a Firestore write needs a new Hosting build (prerender).
 * No Firebase imports, so tests/lib/buildTriggerRules.spec.ts runs without an emulator.
 * Wired up in triggerBuild.ts.
 */

type Doc = Record<string, unknown> | null | undefined;

/**
 * Whether a write to `regions/{id}` changed whether the region is active (created or
 * deleted as active counts too). The prerendered `/` says in a meta tag whether two or
 * more regions are active; without a rebuild that tag stays stale after a region is
 * switched on or off, and a first-time visitor sees the Vorarlberg calendar flash before
 * "Wo suchst du?" (Trello eFPKzCr7).
 */
export function regionActiveChanged(before: Doc, after: Doc): boolean {
  return (before?.active === true) !== (after?.active === true);
}
