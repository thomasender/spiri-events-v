import { useId, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { buildRegionSearchIndex, searchRegions } from '../utils/regionSearch';
import './RegionSearch.css';

/**
 * Search as you type for the region chooser, the WAI-ARIA "combobox with list
 * autocomplete" pattern: focus stays in the input, ArrowUp/Down move through the
 * suggestions (aria-activedescendant), Enter picks the highlighted one (or the
 * first), Escape closes the list and a second Escape clears the field. A live
 * region tells screen readers how many suggestions there are.
 * `regions`: the full register; `activeSlugs`: regions that are open (the others
 * are marked "(bald)" and lead to their coming-soon page).
 */
export default function RegionSearch({ regions, activeSlugs, onChoose }) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);

  const index = useMemo(() => buildRegionSearchIndex(regions), [regions]);
  const results = useMemo(() => searchRegions(index, query), [index, query]);
  const trimmed = query.trim();
  const expanded = open && trimmed.length > 0;
  const optionId = (i) => `${id}-opt-${i}`;

  const pick = (entry) => {
    if (!entry) return;
    setQuery('');
    setActive(-1);
    onChoose(entry.slug);
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

  const status = !trimmed
    ? ''
    : results.length === 0
      ? 'Keine passende Region gefunden'
      : `${results.length} ${results.length === 1 ? 'Vorschlag' : 'Vorschläge'}`;

  return (
    <div className="region-search" data-testid="region-search">
      <label className="region-search-label" htmlFor={`${id}-input`}>
        Region oder Ort suchen
      </label>
      <div className="region-search-field">
        <Search size={18} className="region-search-icon" aria-hidden="true" />
        <input
          id={`${id}-input`}
          type="text"
          role="combobox"
          className="region-search-input"
          placeholder="z. B. Tirol, Franken, München"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          data-testid="region-search-input"
        />
        {query && (
          <button
            type="button"
            className="region-search-clear"
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
        aria-label="Passende Regionen"
        className="region-search-list"
        hidden={!expanded || results.length === 0}
      >
        {expanded &&
          results.map((entry, i) => (
            <li
              key={`${entry.kind}-${entry.slug}-${entry.label}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={`region-search-option${i === active ? ' region-search-option--active' : ''}`}
              // mousedown keeps the focus in the input until the choice is made.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(entry)}
              data-testid="region-search-option"
            >
              <span className="region-search-option-label">{entry.label}</span>
              <span className="region-search-option-detail">
                {entry.detail}
                {!activeSlugs.has(entry.slug) && ' · bald'}
              </span>
            </li>
          ))}
      </ul>
      {expanded && results.length === 0 && (
        <p className="region-search-empty" data-testid="region-search-empty">
          Keine passende Region gefunden. Wähle sie auf der Karte oder in der Liste.
        </p>
      )}
      <p className="region-search-status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
