import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPlaceIndex } from '../lib/placeData';

/**
 * The place list (about 390 kB gzipped) for a place search, loaded only when the person
 * actually uses the field: `request()` is called on focus / typing (or as a hint on hover /
 * touch), never when a dialog or page with the field opens. The search keeps what was typed
 * meanwhile and shows its results as soon as the list is there. `failed` is only set when
 * loading really failed; the next `request()` tries again.
 * @returns {{ index: object|null, failed: boolean, request: () => void }}
 */
export function usePlaceIndexOnDemand() {
  const [index, setIndex] = useState(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const loading = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const request = useCallback(() => {
    if (index || loading.current) return;
    loading.current = true;
    setFailed(false);
    loadPlaceIndex()
      .then((loaded) => {
        if (alive.current) setIndex(loaded);
      })
      .catch(() => {
        if (alive.current) setFailed(true);
      })
      .finally(() => {
        loading.current = false;
      });
  }, [index]);

  return { index, failed, request };
}
