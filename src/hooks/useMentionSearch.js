import { useEffect, useRef, useState } from 'react';
import { searchMentionableUsers } from '../lib/mentionSearch';

const DEBOUNCE_MS = 150;

// Debounced suggestions for the text after an "@". `query` null/empty or
// `enabled` false gives []. Stale answers (typed on meanwhile) are dropped.
export function useMentionSearch(query, { enabled = true, excludeUid } = {}) {
  const [results, setResults] = useState([]);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    if (!enabled || !query) {
      setResults([]);
      return undefined;
    }
    const handle = setTimeout(() => {
      searchMentionableUsers(query, { excludeUid })
        .then((items) => {
          if (id === seq.current) setResults(items);
        })
        .catch((err) => {
          console.warn('mention search failed:', err?.code || err);
          if (id === seq.current) setResults([]);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, enabled, excludeUid]);

  return results;
}
