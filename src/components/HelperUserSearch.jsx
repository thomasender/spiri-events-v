import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserSearch } from '../hooks/useUserSearch';
import { User } from 'lucide-react';

// Typeahead that lets an admin pick an existing user by Benutzername. When a
// match is chosen, it passes the publicProfile snapshot back via `onSelect`.
// The dialog uses the snapshot to prefill `name`, `profileSlug` and
// `photoURL` so the admin does not have to re-type them.
//
// Kept inline in this dialog so the search behaviour cannot drift away from
// the helper-specific draft layout.
export default function HelperUserSearch({ disabled, onSelect }) {
  const { query, setQuery, results, loading } = useUserSearch({ limit: 8 });
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef(null);

  const handleSelect = useCallback(
    (user) => {
      onSelect(user);
      setQuery('');
      setOpen(false);
      setHighlighted(-1);
    },
    [onSelect, setQuery]
  );

  useEffect(() => {
    function onDocClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const showResults = open && query.trim().length >= 2;
  const hasMatches = results.length > 0;

  const handleKeyDown = (e) => {
    if (!showResults || !hasMatches) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? results.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      if (highlighted >= 0 && highlighted < results.length) {
        e.preventDefault();
        handleSelect(results[highlighted]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="helper-user-search" ref={containerRef} data-testid="helper-user-search">
      <input
        type="text"
        value={query}
        placeholder="Benutzername suchen, z.B. @anna.schmidt"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        data-testid="helper-user-search-input"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
      />
      {showResults && (
        <ul
          className="helper-user-search-results"
          role="listbox"
          data-testid="helper-user-search-results"
        >
          {loading && !hasMatches && (
            <li className="helper-user-search-empty" data-testid="helper-user-search-loading">
              Suche läuft…
            </li>
          )}
          {!loading && !hasMatches && (
            <li className="helper-user-search-empty" data-testid="helper-user-search-empty">
              Kein Benutzer gefunden.
            </li>
          )}
          {hasMatches &&
            results.map((user, idx) => (
              <li
                key={user.uid || user.username}
                role="option"
                aria-selected={idx === highlighted}
                className={`helper-user-search-option${
                  idx === highlighted ? ' helper-user-search-option--active' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(user);
                }}
                onMouseEnter={() => setHighlighted(idx)}
                data-testid="helper-user-search-option"
                data-username={user.username}
              >
                <span className="helper-user-search-avatar" aria-hidden="true">
                  {user.photoURL ? <img src={user.photoURL} alt="" /> : <User size={18} />}
                </span>
                <span className="helper-user-search-meta">
                  <span className="helper-user-search-display-name">
                    {user.displayName || user.username}
                  </span>
                  <span className="helper-user-search-username">@{user.username}</span>
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
