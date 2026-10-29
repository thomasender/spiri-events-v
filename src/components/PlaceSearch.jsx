import { useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { placeDetail, searchPlaces } from '../utils/placeSearch';
import './PlaceSearch.css';

/**
 * Search as you type for "Wo bist du?", the WAI-ARIA "combobox with list autocomplete"
 * pattern: focus stays in the input, ArrowUp/Down move through the suggestions
 * (aria-activedescendant), Enter picks the highlighted one (or the first), Escape closes the
 * list and a second Escape clears the field. A live region tells screen readers how many
 * suggestions there are. Finds places (Orte / Gemeinden) and regions ("Allgäu").
 * `index`: the prepared place list (null while it loads), `regionEntries`: the regions.
 */
export default function PlaceSearch({
  index,
  regionEntries,
  onChoose,
  label = 'Ort oder Region',
  placeholder = 'z. B. Bregenz, Lindau, Allgäu',
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);

  const results = useMemo(
    () => searchPlaces(index, regionEntries, query),
    [index, regionEntries, query]
  );
  const trimmed = query.trim();
  const expanded = open && trimmed.length > 1;
  const optionId = (i) => `${id}-opt-${i}`;

  const pick = (entry) => {
    if (!entry) return;
    setQuery('');
    setActive(-1);
    onChoose(entry);
  };

  // Tapping a suggestion on a touch device closes the on-screen keyboard again. Enter and
  // desktop pointers keep the focus where it is.
  const pickByPointer = (entry) => {
    pick(entry);
    if (entry && window.matchMedia?.('(pointer: coarse)').matches) inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (!expanded || results.length === 0) return;
      e.preventDefault();
      pick(results[active >= 0 ? active : 0]);
    } else if (e.key === 'Escape') {
      if (expanded) {
        // Closing the suggestions must not also close the surrounding dialog.
        e.stopPropagation();
        setOpen(false);
      } else if (query) {
        e.stopPropagation();
        setQuery('');
      }
    }
  };

  const status = !expanded
    ? ''
    : !index
      ? 'Orte werden geladen …'
      : results.length === 0
        ? 'Kein passender Ort gefunden'
        : `${results.length} ${results.length === 1 ? 'Vorschlag' : 'Vorschläge'}`;

  return (
    <div className="place-search" data-testid="place-search">
      <label className="place-search-label" htmlFor={`${id}-input`}>
        {label}
      </label>
      <div className="place-search-field">
        <Search size={18} className="place-search-icon" aria-hidden="true" />
        <input
          id={`${id}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          className="place-search-input"
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-autocomplete="list"
          aria-expanded={expanded && results.length > 0}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          data-testid="place-search-input"
        />
        {query && (
          <button
            type="button"
            className="place-search-clear"
            aria-label="Suche leeren"
            onClick={() => {
              setQuery('');
              setActive(-1);
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Passende Orte und Regionen"
        className="place-search-list"
        hidden={!expanded || results.length === 0}
      >
        {expanded &&
          results.map((entry, i) => (
            <li
              key={`${entry.kind}-${entry.name}-${entry.lat}-${entry.lon}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={`place-search-option${i === active ? ' place-search-option--active' : ''}`}
              // mousedown keeps the focus in the input until the choice is made.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickByPointer(entry)}
              data-testid="place-search-option"
            >
              <span className="place-search-option-label">{entry.name}</span>
              <span className="place-search-option-detail">{placeDetail(entry)}</span>
            </li>
          ))}
      </ul>
      {expanded && index && results.length === 0 && (
        <p className="place-search-empty" data-testid="place-search-empty">
          Kein passender Ort gefunden. Versuche es mit dem Namen der nächsten größeren Stadt.
        </p>
      )}
      <p className="place-search-status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
