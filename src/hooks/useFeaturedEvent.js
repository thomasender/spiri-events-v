import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * One approved event by slug (null while loading, when not found or when it
 * cannot be read). Public data, same lookup as the event page for visitors.
 * Pass a falsy slug to skip the read.
 */
export function useFeaturedEvent(slug) {
  const [state, setState] = useState({ slug: null, event: null });

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    getDocs(
      query(
        collection(db, 'events'),
        where('slug', '==', slug),
        where('status', '==', 'approved'),
        limit(1)
      )
    )
      .then((snap) => {
        if (cancelled) return;
        const doc = snap.docs[0];
        setState({ slug, event: doc ? { id: doc.id, ...doc.data() } : null });
      })
      .catch(() => {
        if (!cancelled) setState({ slug, event: null });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state.slug === slug ? state.event : null;
}
