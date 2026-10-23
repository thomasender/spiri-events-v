import { useEffect, useMemo, useState } from 'react';
import { REGION_MAP } from '../data/regionMap';
import { germanDistrictHolders, groupDistrictShapes } from '../utils/landkreisMap';
import './RegionMap.css';

/**
 * Silent map of Germany, Austria and Switzerland: only the regions are drawn,
 * no countries, cities or permanent labels; a region's name shows on hover only. A pointer shortcut only: the region list
 * next to it is the accessible equivalent, so the map is hidden from screen
 * readers and the keyboard. `activeSlugs`: regions that are open; the others
 * lead to their coming-soon page and are drawn quieter.
 */
export default function RegionMap({ regions, activeSlugs, onChoose }) {
  const [hovered, setHovered] = useState(null);
  const [view, setView] = useState('dach');
  const [landkreisMap, setLandkreisMap] = useState(null);
  const byId = new Map(regions.map((r) => [r.slug, r]));
  const shown = hovered ? byId.get(hovered) : null;
  // Germany is drawn from the same Landkreis data as Verwaltung -> Zuordnung as soon as a
  // Kulturregion has districts: every Landkreis lands in the region that lists it NOW
  // (current names and assignment of the merged register), so a moved Landkreis shows in
  // its new region. Before that nothing changes: the Bundesland map of Germany, Austria
  // and Switzerland only.
  const hasCulture = regions.some((r) => r.country === 'DE' && r.home === false);
  const deView = hasCulture && view === 'de';
  const groups = useMemo(() => {
    if (!landkreisMap) return [];
    const holders = germanDistrictHolders(regions);
    return groupDistrictShapes(landkreisMap.districts, (key) => holders.get(key));
  }, [landkreisMap, regions]);

  useEffect(() => {
    if (!deView || landkreisMap) return undefined;
    let cancelled = false;
    import('../data/landkreisMap.json').then((m) => {
      if (!cancelled) setLandkreisMap(m.default);
    });
    return () => {
      cancelled = true;
    };
  }, [deView, landkreisMap]);

  const shapeProps = (slug) => ({
    'data-region': slug,
    className: `region-map-shape${activeSlugs.has(slug) ? ' region-map-shape--active' : ''}${
      hovered === slug ? ' region-map-shape--hover' : ''
    }`,
    onClick: () => onChoose(slug),
    onMouseEnter: () => setHovered(slug),
    onMouseLeave: () => setHovered((h) => (h === slug ? null : h)),
  });

  return (
    <figure className="region-map" data-testid="region-map">
      {hasCulture && (
        <div className="region-map-views" role="group" aria-label="Kartenausschnitt">
          <button
            type="button"
            className={view === 'dach' ? 'is-current' : undefined}
            aria-pressed={view === 'dach'}
            onClick={() => setView('dach')}
          >
            Österreich und Schweiz
          </button>
          <button
            type="button"
            className={view === 'de' ? 'is-current' : undefined}
            aria-pressed={view === 'de'}
            onClick={() => setView('de')}
            data-testid="region-map-view-de"
          >
            Deutschland
          </button>
        </div>
      )}
      {deView ? (
        <svg
          viewBox={landkreisMap?.viewBox ?? '0 0 539.7 720.8'}
          className="region-map-svg"
          aria-hidden="true"
          focusable="false"
          data-testid="region-map-de"
        >
          {groups.map((g) =>
            g.id === null ? (
              <path
                key="none"
                d={g.d}
                className="region-map-shape region-map-shape--quiet region-map-shape--fill"
              />
            ) : (
              // One shape per region (all its Landkreise), drawn over a wide border stroke
              // so only the region edges show, not the Landkreis edges inside.
              <g key={g.id}>
                <path d={g.d} className="region-map-border" />
                <path
                  d={g.d}
                  {...shapeProps(g.id)}
                  className={`${shapeProps(g.id).className} region-map-shape--fill`}
                />
              </g>
            )
          )}
          {landkreisMap?.country.map((d, i) => (
            <path key={`c${i}`} d={d} className="region-map-line" />
          ))}
        </svg>
      ) : (
        <svg
          viewBox={REGION_MAP.viewBox}
          className="region-map-svg"
          aria-hidden="true"
          focusable="false"
        >
          {REGION_MAP.regions.map((shape) => {
            const region = byId.get(shape.id);
            if (!region) return null;
            // Germany: the Kulturregionen replace the Bundesländer; the area stays on the
            // map as a quiet shape that opens the Germany view.
            if (hasCulture && region.country === 'DE') {
              return (
                <path
                  key={shape.id}
                  d={shape.d}
                  className="region-map-shape region-map-shape--quiet"
                  onClick={() => setView('de')}
                />
              );
            }
            return <path key={shape.id} d={shape.d} {...shapeProps(shape.id)} />;
          })}
        </svg>
      )}
      <figcaption className="region-map-caption" data-testid="region-map-caption">
        {shown
          ? `${shown.name}${activeSlugs.has(shown.slug) ? '' : ' (bald)'}`
          : 'Tippe auf deine Region'}
      </figcaption>
    </figure>
  );
}
