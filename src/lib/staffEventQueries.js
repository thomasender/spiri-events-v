import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { REGION_SLUGS } from '../utils/regions';

/**
 * The event queries behind the admin lists for one status, per role:
 *   Super-Admin   every event with that status (unchanged)
 *   Moderator:in  events of her regions (`regionId in [...]`, which the rules
 *                 require for her; draft is never moderated) plus, with
 *                 `includeOwn`, her own events
 *   everyone else her own events
 * Returns a list of { key, constraints } so callers (and tests) can see what
 * is asked without a Firestore instance.
 */
export function staffEventQuerySpecs({ access, uid, status, includeOwn = true }) {
  const byStatus = ['status', '==', status];
  if (access?.isSuperAdmin) return [{ key: 'all', constraints: [byStatus] }];
  const own = uid ? [{ key: 'own', constraints: [byStatus, ['createdBy', '==', uid]] }] : [];
  const regionIds = (access?.isRegionModerator ? access.moderatorRegionIds : []).filter((id) =>
    REGION_SLUGS.includes(id)
  );
  if (regionIds.length === 0 || status === 'draft') return own;
  const region = { key: 'region', constraints: [byStatus, ['regionId', 'in', regionIds]] };
  return includeOwn ? [region, ...own] : [region];
}

/**
 * Subscribes to several event queries and reports the merged documents
 * (deduplicated by id) once every query has answered. `onError` is called
 * with the first failing query's error.
 */
export function subscribeEventQueries(specs, onDocs, onError) {
  if (specs.length === 0) {
    onDocs([]);
    return () => {};
  }
  const results = new Map();
  const unsubs = specs.map((spec) =>
    onSnapshot(
      query(collection(db, 'events'), ...spec.constraints.map(([f, op, v]) => where(f, op, v))),
      (snapshot) => {
        results.set(
          spec.key,
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        );
        if (results.size < specs.length) return;
        const byId = new Map();
        specs.forEach((s) => (results.get(s.key) || []).forEach((d) => byId.set(d.id, d)));
        onDocs(Array.from(byId.values()));
      },
      (err) => onError?.(err)
    )
  );
  return () => unsubs.forEach((u) => u());
}
