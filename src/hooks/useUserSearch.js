import { useEffect, useRef, useState, useCallback } from 'react';
import { searchUsersByUsernamePrefix } from '../lib/userSearch';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

// Debounced typeahead over the public user directory. Calls
// `searchUsersByUsernamePrefix` (collectionGroup on publicProfile) when the
// query is at least `MIN_QUERY_LENGTH` chars. Returns:
//   { query, setQuery, results, loading, error }
//
// `query` is the raw typed string so the input stays controlled. `results` is
// only ever populated AFTER the debounce settles, so typing fast does not
// cause flicker.
export function useUserSearch({ limit = 8 } = {}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    let cancelled = false;
    searchUsersByUsernamePrefix(trimmed, { limit })
      .then((items) => {
        if (cancelled || seq !== seqRef.current) return;
        setResults(items);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled || seq !== seqRef.current) return;
        console.warn('useUserSearch error:', err);
        setError(err);
        setResults([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, limit]);

  const reset = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
  }, []);

  return { query, setQuery, results, loading, error, reset };
}
