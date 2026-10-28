import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { refreshRegions } from './useRegions';

/**
 * Super-Admin only: which districts still have events (they cannot be moved)
 * and saving a new Landkreis -> region assignment, via the callables in
 * functions/src/adminRegionMapping.ts. The server checks the role, the moves
 * and the locks again. After a save the shared `useRegions` cache is reloaded.
 */
export function useRegionMapping(enabled) {
  const [locks, setLocks] = useState({});
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await httpsCallable(functions, 'adminGetRegionMappingLocks')();
      setLocks(result.data?.locks ?? {});
    } catch (err) {
      console.error('Loading region mapping locks failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const save = useCallback(
    async (moves) => {
      const result = await httpsCallable(functions, 'adminSaveRegionMapping')({ moves });
      await Promise.all([refreshRegions(), load()]);
      return result.data;
    },
    [load]
  );

  // Display name only (the slug and the wording tables stay). The region doc may not
  // exist yet (it is created on the first mapping save), so merge instead of update.
  const rename = useCallback(async (regionId, name) => {
    await setDoc(
      doc(db, 'regions', regionId),
      { name: name.trim(), slug: regionId, updatedAt: serverTimestamp() },
      { merge: true }
    );
    await refreshRegions();
  }, []);

  // Creates a new, empty and inactive region (callable adminCreateRegion; the server derives the
  // address from the name). Resolves with { regionId, name } once the shared regions are reloaded.
  const create = useCallback(async ({ name, country, inPhrase }) => {
    const result = await httpsCallable(functions, 'adminCreateRegion')({ name, country, inPhrase });
    await refreshRegions();
    return result.data;
  }, []);

  return { locks, loading, error, reload: load, save, rename, create };
}

/** Plain German text for a failed adminCreateRegion call. */
export function createRegionErrorMessage(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const reason = err?.details?.reason;
  if (code === 'already-exists' || reason === 'name-taken') {
    return 'Eine Region mit diesem Namen gibt es schon.';
  }
  if (reason === 'slug-reserved') {
    return 'Dieser Name ist schon für etwas anderes vergeben (z. B. eine Seite oder ein Profil). Bitte wähle einen anderen Namen.';
  }
  if (reason === 'invalid-name' || code === 'invalid-argument') {
    return 'Bitte gib einen Namen mit 2 bis 60 Zeichen ein (Buchstaben oder Zahlen).';
  }
  if (code === 'permission-denied') return 'Nur Super-Admins können Regionen anlegen.';
  if (code === 'unauthenticated')
    return 'Du bist nicht mehr angemeldet. Bitte melde dich erneut an.';
  return 'Das Anlegen hat leider nicht geklappt. Bitte versuche es erneut.';
}

/** Plain German text for a failed adminSaveRegionMapping / adminGetRegionMappingLocks call. */
export function regionMappingErrorMessage(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const details = err?.details;
  switch (code) {
    case 'failed-precondition':
      if (details?.reason === 'events-in-district') {
        const names = (details.blocked ?? []).map((b) => b.district).join(', ');
        return `Diese Landkreise haben schon Events und lassen sich noch nicht verschieben: ${names}.`;
      }
      return 'Diese Zuordnung ist nicht möglich. Bitte prüfe die Auswahl.';
    case 'permission-denied':
      return 'Nur Super-Admins können die Zuordnung ändern.';
    case 'unauthenticated':
      return 'Du bist nicht mehr angemeldet. Bitte melde dich erneut an.';
    case 'invalid-argument':
      return 'Die Auswahl ist ungültig. Bitte lade die Seite neu.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'internal':
      return 'Der Server ist gerade nicht erreichbar. Bitte versuche es in einem Moment erneut.';
    default:
      return 'Das hat leider nicht geklappt. Bitte versuche es erneut.';
  }
}
