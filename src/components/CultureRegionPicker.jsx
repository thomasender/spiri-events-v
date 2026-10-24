import { useEffect, useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { searchCultureRegions } from '../utils/cultureRegionSearch';
import { CATALOG_BY_KEY } from '../utils/regionMapping';
import { groupDistrictShapes } from '../utils/landkreisMap';

// Map of all Landkreise and kreisfreie Städte of Germany plus a search with autocomplete.
// Every Landkreis is coloured by the cultural region it belongs to WITH the unsaved draft
// applied (`holderOf(key)`), so moving one recolours it at once. Landkreise with an unsaved
// change (`changedKeys`) are marked, the picked region is highlighted, Landkreise without
// a cultural region (Bundesland fallback) are drawn neutral. A click on a region in the
// search picks it (`onSelect`); a click on a Landkreis is handed to `onDistrictClick`.
// Shapes: Germany src/data/landkreisMap.json (scripts/build-landkreis-map.mjs); Austria and
// Switzerland (`country` AT / CH, ticket 599) src/data/bezirkMapAtCh.json
// (scripts/build-atch-bezirk-map.mjs): there the regions are the Bundesländer / Kantone and
// the shapes are Bezirke. Loaded on demand.
const WORDS = {
  DE: {
    region: 'Kulturregion',
    district: 'Landkreis',
    districts: 'Landkreise und Städte',
    none: 'noch ohne Kulturregion',
  },
  AT: { region: 'Bundesland', district: 'Bezirk', districts: 'Bezirke', none: 'ohne Region' },
  CH: { region: 'Kanton', district: 'Bezirk', districts: 'Bezirke', none: 'ohne Region' },
};

async function loadMap(country) {
  if (country === 'DE') {
    const m = await import('../data/landkreisMap.json');
    return { ...m.default, unmatched: [] };
  }
  const m = await import('../data/bezirkMapAtCh.json');
  return m.default[country];
}

export default function CultureRegionPicker({
  country = 'DE',
  regions,
  districtsOf,
  holderOf,
  selectedId,
  onSelect,
  changedKeys,
  onDistrictClick,
}) {
  const [mapData, setMapData] = useState(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    let cancelled = false;
    setMapData(null);
    loadMap(country).then((m) => {
      if (!cancelled) setMapData(m);
    });
    return () => {
      cancelled = true;
    };
  }, [country]);
  const words = WORDS[country] ?? WORDS.DE;

  const hits = useMemo(
    () => searchCultureRegions(regions, districtsOf, query),
    [regions, districtsOf, query]
  );
  const byId = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  // Only cultural regions colour a Landkreis; anything else is the Bundesland fallback.
  const groups = useMemo(
    () =>
      mapData
        ? groupDistrictShapes(mapData.districts, (key) => {
            const id = holderOf(key);
            return byId.has(id) ? id : null;
          })
        : [],
    [mapData, holderOf, byId]
  );

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

  const regionColour = (id) => {
    const c = mapData?.regions[id];
    return c ? { '--h': c.h } : { '--h': 0, '--s': '0%' };
  };
  const changed = groups.flatMap((g) => g.keys).filter((key) => changedKeys?.has(key));
  // The picked region is drawn last, so its (wider) border lies on top of its neighbours.
  const ordered = [...groups].sort(
    (a, b) =>
      Number(Boolean(a.id) && a.id === selectedId) - Number(Boolean(b.id) && b.id === selectedId)
  );

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
          aria-label={`${words.region} oder ${words.district} suchen`}
          placeholder={`${country === 'DE' ? 'Region' : words.region} oder ${words.district} suchen …`}
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
        // The panel next to the map (add / remove, search) is the keyboard equivalent, so
        // the 400 Landkreise are not tab stops.
        <svg
          className="culture-map"
          viewBox={mapData.viewBox}
          role="group"
          aria-label={`Karte der ${words.districts} nach ${words.region}`}
        >
          {ordered.map((g) => (
            <g
              key={g.id ?? `fallback-${g.keys[0]}`}
              className={`culture-group${g.id ? '' : ' culture-group--fallback'}${
                g.id && g.id === selectedId ? ' is-selected' : ''
              }`}
              data-region={g.id ?? undefined}
            >
              {/* Region border: a wide stroke under the fills, so only the outer edge of
                  the group stays visible (no region polygons needed). */}
              <path d={g.d} className="culture-border" />
              {g.keys.map((key) => {
                const district = CATALOG_BY_KEY.get(key);
                const region = g.id ? byId.get(g.id) : null;
                return (
                  <path
                    key={key}
                    d={mapData.districts[key].d}
                    className={`culture-shape culture-shade-${
                      mapData.regions[g.id]?.sh ?? 0
                    }${g.id ? '' : ' culture-shape--quiet'}`}
                    style={regionColour(g.id)}
                    data-district={key}
                    onClick={() => onDistrictClick(key)}
                  >
                    <title>
                      {district?.name ?? key} · {region ? region.name : words.none}
                      {changedKeys?.has(key) ? ' (ungespeicherte Änderung)' : ''}
                    </title>
                  </path>
                );
              })}
            </g>
          ))}
          {/* Shapes of the map that have no district in the register: shown, not clickable. */}
          {mapData.unmatched.map((u) => (
            <path
              key={u.key}
              d={u.d}
              className="culture-shape culture-shape--quiet"
              data-unmatched={u.name}
            >
              <title>{u.name} · nicht zuordenbar (kein Bezirk in der Struktur)</title>
            </path>
          ))}
          {changed.map((key) => (
            <path
              key={`changed-${key}`}
              d={mapData.districts[key].d}
              className="culture-changed"
              data-changed={key}
            />
          ))}
          {mapData.country.map((d, i) => (
            <path key={`c${i}`} d={d} className="culture-line culture-line--country" />
          ))}
        </svg>
      ) : (
        <p className="moderation-hint">Karte wird geladen …</p>
      )}
      <p className="moderation-hint" data-testid="culture-map-legend">
        {country === 'DE'
          ? 'Jeder Landkreis und jede Stadt ist in der Farbe der Kulturregion eingefärbt, zu der sie mit dem Entwurf gehören. Orange gestrichelt: ungespeicherte Änderung. Grau: noch ohne Kulturregion (gehört zum Bundesland). Klick auf einen Landkreis: zur gewählten Region hinzufügen.'
          : `Jeder Bezirk ist in der Farbe der Region eingefärbt, zu der er mit dem Entwurf gehört. Orange gestrichelt: ungespeicherte Änderung. Klick auf einen Bezirk: zur gewählten Region hinzufügen.${
              mapData?.unmatched.length
                ? ' Hellgrau: Gebiete der Karte, die es in unserer Bezirksliste nicht gibt.'
                : ''
            }`}
      </p>
    </div>
  );
}
