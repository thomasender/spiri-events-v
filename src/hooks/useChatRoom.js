import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegion } from './useRegion';
import { loadGeoShapes } from '../lib/placeData';
import { regionForPosition } from '../utils/geoRegion';
import { resolveChatRoom } from '../utils/chat';

/**
 * The person's own region for the Lagerfeuer (Trello 6aef2dad): the region of the place in the
 * header ("Wo bist du?"), else the region of the Feuerplatz in the profile (only by the
 * Bundesland / Kanton / Liechtenstein outlines, loaded on demand; a Feuerplatz in Germany gives
 * none). null outside region mode or when neither is known.
 */
export function useOwnChatRegionId(profile) {
  const { placeSelection, regions, allRegions, loading } = useRegion();
  const regionMode = !loading && regions.length >= 2;
  const placeRegionId = placeSelection?.regionId ?? null;
  const lat = profile?.fireplace?.lat;
  const lon = profile?.fireplace?.lon;
  const needsFireplace =
    regionMode && !placeRegionId && Number.isFinite(lat) && Number.isFinite(lon);
  const [fireplaceRegionId, setFireplaceRegionId] = useState(null);

  useEffect(() => {
    if (!needsFireplace) {
      setFireplaceRegionId(null);
      return undefined;
    }
    let cancelled = false;
    loadGeoShapes()
      .then(({ admin }) => {
        if (cancelled) return;
        setFireplaceRegionId(regionForPosition(lat, lon, allRegions, admin)?.region.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setFireplaceRegionId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsFireplace, lat, lon, allRegions]);

  if (!regionMode) return null;
  return placeRegionId ?? fireplaceRegionId;
}

/**
 * Which Lagerfeuer is shown (`resolveChatRoom`): `?raum=` of the address on /chat, else the
 * own one. With fewer than two active regions always `lagerfeuer`, as before.
 */
export function useChatRoom(profile) {
  const { regions, loading } = useRegion();
  const { pathname, search } = useLocation();
  const regionMode = !loading && regions.length >= 2;
  const ownRegionId = useOwnChatRegionId(profile);
  const requested = pathname.startsWith('/chat') ? new URLSearchParams(search).get('raum') : null;
  const activeKey = regions.map((r) => `${r.id}:${r.name ?? ''}`).join('|');
  return useMemo(
    () => resolveChatRoom({ regionMode, activeRegions: regions, ownRegionId, requested }),
    // `regions` is read through activeKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regionMode, activeKey, ownRegionId, requested]
  );
}
