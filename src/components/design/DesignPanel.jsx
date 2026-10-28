import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Search, X } from 'lucide-react';
import {
  ADVANCED_GROUPS,
  LAYOUT_GROUPS,
  LAYOUT_TOKENS,
  describeValue,
} from '../../utils/layoutTokens';
import { getEffectiveValue, resetDraftValue, useLayoutState } from '../../lib/layoutStore';
import TokenControl from './TokenControl';

// Every layout token in one list — for changes you cannot reach by hovering
// (breakpoint-specific values, hidden states) and for the scales.
export default function DesignPanel({ onClose }) {
  const layout = useLayoutState();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(() => new Set(['Seite & Raster']));

  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      LAYOUT_GROUPS.map((group) => ({
        group,
        tokens: LAYOUT_TOKENS.filter(
          (t) =>
            t.group === group &&
            (!q || t.label.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
        ),
      })).filter((g) => g.tokens.length),
    [q]
  );

  const toggle = (group) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  return (
    <aside className="dm-panel" data-design-ui aria-label="Alle Regler">
      <header className="dm-panel-head">
        <h2>Alle Regler</h2>
        <button
          type="button"
          className="dm-icon-btn"
          onClick={onClose}
          aria-label="Panel schließen"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <label className="dm-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="Regler suchen …"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Regler suchen"
        />
      </label>

      <div className="dm-panel-body">
        {groups.map(({ group, tokens }) => {
          const expanded = q ? true : open.has(group);
          const advanced = ADVANCED_GROUPS.has(group);
          return (
            <section key={group} className="dm-group">
              <button
                type="button"
                className="dm-group-head"
                aria-expanded={expanded}
                onClick={() => toggle(group)}
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>{group}</span>
                <span className="dm-group-count">{tokens.length}</span>
              </button>
              {expanded && advanced && (
                <p className="dm-warning dm-warning--inline">
                  Fortgeschritten: Skalenwerte wirken überall, wo die Stufe genutzt wird.
                </p>
              )}
              {expanded &&
                tokens.map((token) => {
                  const value = getEffectiveValue(token.name);
                  const published = layout.published[token.name] ?? token.default;
                  const changed = layout.draft ? value !== published : false;
                  return (
                    <div key={token.name} className={`dm-row${changed ? ' is-changed' : ''}`}>
                      <div className="dm-row-head">
                        <span className="dm-row-label">
                          {changed && <span className="dm-dot" title="Geändert (Entwurf)" />}
                          {token.label}
                        </span>
                        <span className="dm-row-value">{describeValue(token, value)}</span>
                        <button
                          type="button"
                          className="dm-icon-btn"
                          disabled={value === token.default}
                          onClick={() => resetDraftValue(token.name)}
                          title={`Auf Standard (${describeValue(token, token.default)})`}
                          aria-label={`${token.label} auf Standard zurücksetzen`}
                        >
                          <RotateCcw size={13} aria-hidden="true" />
                        </button>
                      </div>
                      <code className="dm-code dm-code--small">{token.name}</code>
                      <TokenControl token={token} value={value} compact />
                    </div>
                  );
                })}
            </section>
          );
        })}
        {!groups.length && <p className="dm-hint">Kein Regler gefunden.</p>}
      </div>
    </aside>
  );
}
