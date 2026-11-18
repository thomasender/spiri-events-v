// Event import, claim: the callables (functions/src/eventImportClaim.ts).
// Component tests get an inert stand-in from tests/vitest.setup.ts; specs that
// care mock this module themselves.
import { callable } from './firebase';

/** `{ organizerId?, token? }` -> `{ status: 'claimed' | 'requested' | 'request-rejected', ... }` */
export async function claimCuratedEvents(data = {}) {
  return (await callable('claimCuratedEvents')(data)).data;
}

/** -> `{ events: [{ title, date }], total }` for the account's verified address. */
export async function listMyClaimableEvents() {
  return (await callable('listMyClaimableEvents')({})).data;
}

/** `{ title, date, regionId? }` -> `{ matches: [{ organizerId, title, date }] }` */
export async function findCuratedMatches(data) {
  return (await callable('findCuratedMatches')(data)).data;
}
