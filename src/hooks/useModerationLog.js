import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MODERATION_LOG_PAGE_SIZE, querySpecKey } from '../utils/moderationLog';

function toQuery(spec, cursor) {
  const constraints = spec.where.map(([field, op, value]) =>
    where(field, op, value instanceof Date ? Timestamp.fromDate(value) : value)
  );
  constraints.push(orderBy(...spec.orderBy));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(MODERATION_LOG_PAGE_SIZE));
  return query(collection(db, 'moderation_log'), ...constraints);
}

/**
 * Super-Admin moderation log, page by page (newest first). `spec` comes from
 * buildLogQuerySpec (memoised by the caller); a new spec or a new
 * `refreshKey` starts again at page one. One-shot reads, no live listener.
 */
export function useModerationLog(spec, { enabled = true, refreshKey = 0 } = {}) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef(null);
  const runRef = useRef(0);
  const key = querySpecKey(spec);
  // The spec of the current first page, for "load more" (set in the effect).
  const specRef = useRef(spec);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setLoading(false);
      return undefined;
    }
    const run = ++runRef.current;
    specRef.current = spec;
    setLoading(true);
    setError(null);
    cursorRef.current = null;
    getDocs(toQuery(spec, null))
      .then((snap) => {
        if (run !== runRef.current) return;
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        cursorRef.current = snap.docs[snap.docs.length - 1] ?? null;
        setHasMore(snap.docs.length === MODERATION_LOG_PAGE_SIZE);
        setLoading(false);
      })
      .catch((err) => {
        if (run !== runRef.current) return;
        console.warn('Moderation log failed:', err?.code || err, err?.message);
        setError(err);
        setEntries([]);
        setHasMore(false);
        setLoading(false);
      });
    return () => {
      runRef.current += 1;
    };
    // `key` stands for `spec` (a new object with the same content must not reload).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, refreshKey]);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current) return;
    const run = runRef.current;
    setLoadingMore(true);
    try {
      const snap = await getDocs(toQuery(specRef.current, cursorRef.current));
      if (run !== runRef.current) return;
      setEntries((prev) => [...prev, ...snap.docs.map((d) => ({ id: d.id, ...d.data() }))]);
      cursorRef.current = snap.docs[snap.docs.length - 1] ?? cursorRef.current;
      setHasMore(snap.docs.length === MODERATION_LOG_PAGE_SIZE);
    } catch (err) {
      console.warn('Moderation log (more) failed:', err?.code || err, err?.message);
      setError(err);
    } finally {
      if (run === runRef.current) setLoadingMore(false);
    }
  }, []);

  return { entries, loading, loadingMore, error, hasMore, loadMore };
}
