import { useEffect, useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { searchCultureRegions } from '../utils/cultureRegionSearch';

// Map of the cultural regions of Germany plus a search with autocomplete. Both only pick
// a region (`onSelect(regionId)`); what is done with it lives in RegionMappingTab. The
// outlines (src/data/cultureRegionMap.json) are fixed; the three city states have no
// cultural region and are drawn quiet. Loaded on demand because the file is ~110 kB.
//
// The file only holds the outlines of the regions, not of the Landkreise. So the draft is
// shown on the region shapes: `changedIds` (regions with unsaved changes) get a marked
// outline, regions without any Landkreis are drawn faded.
export default function CultureRegionPicker({
  regions,
  districtsOf,
  selectedId,
  onSelect,
  changedIds,
}) {
  const [mapData, setMapData] = useState(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    let cancelled = false;
    import('../data/cultureRegionMap.json').then((m) => {
      if (!cancelled) setMapData(m.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hits = useMemo(
    () => searchCultureRegions(regions, districtsOf, query),
    [regions, districtsOf, query]
  );
  const byId = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  const choose = (hit) => {
    onSelect(hit.region.id);
    setQuery('');
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  const shapes = mapData
    ? Object.entries(mapData.regions)
        .filter(([id]) => byId.has(id))
        .sort(([a], [b]) => Number(a === selectedId) - Number(b === selectedId))
    : [];

  return (
    <div className="culture-picker" data-testid="culture-picker">
      <div className="culture-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Kulturregion oder Landkreis suchen"
          placeholder="Region oder Landkreis suchen …"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          data-testid="culture-search"
        />
        {hits.length > 0 && (
          <ul id={listId} role="listbox" className="culture-search-list">
            {hits.map((hit, i) => (
              <li
                key={hit.region.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'is-active' : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(hit);
                }}
              >
                <strong>{hit.region.name}</strong>
                {hit.via && <span> · {hit.via}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {mapData ? (
        <svg
          className="culture-map"
          viewBox={mapData.viewBox}
          role="group"
          aria-label="Karte der Kulturregionen"
        >
          {Object.values(mapData.cityStates).map((s) => (
            <path key={s.name} d={s.d} className="culture-shape culture-shape--quiet">
              <title>{s.name}</title>
            </path>
          ))}
          {shapes.map(([id, shape]) => (
            <path
              key={id}
              d={shape.d}
              className={`culture-shape culture-shade-${shape.shade}${
                id === selectedId ? ' is-selected' : ''
              }${changedIds?.has(id) ? ' is-changed' : ''}${
                districtsOf(id).length === 0 ? ' is-empty' : ''
              }`}
              style={{ '--h': shape.hue }}
              tabIndex={0}
              role="button"
              aria-label={`${byId.get(id).name}${changedIds?.has(id) ? ', geändert' : ''}`}
              aria-pressed={id === selectedId}
              data-region={id}
              onClick={() => onSelect(id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(id);
                }
              }}
            >
              <title>
                {byId.get(id).name}
                {changedIds?.has(id) ? ' (ungespeicherte Änderung)' : ''}
              </title>
            </path>
          ))}
          {mapData.states.map((d, i) => (
            <path key={`s${i}`} d={d} className="culture-line" />
          ))}
          {mapData.country.map((d, i) => (
            <path key={`c${i}`} d={d} className="culture-line culture-line--country" />
          ))}
        </svg>
      ) : (
        <p className="moderation-hint">Karte wird geladen …</p>
      )}
      <p className="moderation-hint" data-testid="culture-map-legend">
        Orange umrandet: Region mit ungespeicherter Änderung. Blass: Region ohne Landkreis. Die
        Karte zeigt die Regionen als Ganzes, einzelne Landkreise sind darin nicht eingezeichnet.
      </p>
    </div>
  );
}
