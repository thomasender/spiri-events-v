import { useEffect, useMemo, useState } from 'react';
import { REGION_MAP } from '../data/regionMap';
import {
  countryLabels,
  germanDistrictHolders,
  groupDistrictShapes,
  LANDKREIS_TO_DACH_TRANSFORM,
} from '../utils/landkreisMap';
import './RegionMap.css';

/**
 * One silent map of Germany, Austria, Switzerland (and Liechtenstein, which has no region):
 * only the regions are drawn, no cities; a region's name shows on hover only. The country
 * names are a soft, unobtrusive lettering over each country for orientation. A pointer
 * shortcut only: the region list next to it is the accessible equivalent, so the map is
 * hidden from screen readers and the keyboard. `activeSlugs`: regions that are open; the
 * others lead to their coming-soon page and are drawn quieter.
 */
export default function RegionMap({ regions, activeSlugs, onChoose }) {
  const [hovered, setHovered] = useState(null);
  const [landkreisMap, setLandkreisMap] = useState(null);
  const byId = new Map(regions.map((r) => [r.slug, r]));
  const shown = hovered ? byId.get(hovered) : null;
  // Germany is drawn from the same Landkreis data as Verwaltung -> Zuordnung as soon as a
  // Kulturregion has districts: every Landkreis lands in the region that lists it NOW
  // (current names and assignment of the merged register), so a moved Landkreis shows in
  // its new region. Until then (and while the data loads) Germany is the quiet Bundesland
  // map, next to Austria and Switzerland on the same map.
  const hasCulture = regions.some((r) => r.country === 'DE' && r.home === false);
  const groups = useMemo(() => {
    if (!landkreisMap) return [];
    const holders = germanDistrictHolders(regions);
    return groupDistrictShapes(landkreisMap.districts, (key) => holders.get(key));
  }, [landkreisMap, regions]);
  const labels = useMemo(() => countryLabels(REGION_MAP.regions, regions), [regions]);

  useEffect(() => {
    if (!hasCulture || landkreisMap) return undefined;
    let cancelled = false;
    import('../data/landkreisMap.json').then((m) => {
      if (!cancelled) setLandkreisMap(m.default);
    });
    return () => {
      cancelled = true;
    };
  }, [hasCulture, landkreisMap]);

  const shapeProps = (slug) => ({
    'data-region': slug,
    className: `region-map-shape${activeSlugs.has(slug) ? ' region-map-shape--active' : ''}${
      hovered === slug ? ' region-map-shape--hover' : ''
    }`,
    onClick: () => onChoose(slug),
    onMouseEnter: () => setHovered(slug),
    onMouseLeave: () => setHovered((h) => (h === slug ? null : h)),
  });
  const landkreisDrawn = hasCulture && landkreisMap;

  return (
    <figure className="region-map" data-testid="region-map">
      <svg
        viewBox={REGION_MAP.viewBox}
        className="region-map-svg"
        aria-hidden="true"
        focusable="false"
      >
        {REGION_MAP.regions.map((shape) => {
          const region = byId.get(shape.id);
          if (!region) return null;
          // Germany: the Kulturregionen replace the Bundesländer (drawn below as Landkreise);
          // until they are loaded the area stays as a quiet shape.
          if (hasCulture && region.country === 'DE') {
            if (landkreisDrawn) return null;
            return (
              <path
                key={shape.id}
                d={shape.d}
                className="region-map-shape region-map-shape--quiet"
              />
            );
          }
          return <path key={shape.id} d={shape.d} {...shapeProps(shape.id)} />;
        })}
        {landkreisDrawn && (
          <g transform={LANDKREIS_TO_DACH_TRANSFORM} data-testid="region-map-de">
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
          </g>
        )}
        {labels.map((l) => (
          <text
            key={l.country}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            className="region-map-country"
            data-country={l.country}
          >
            {l.name}
          </text>
        ))}
      </svg>
      <figcaption className="region-map-caption" data-testid="region-map-caption">
        {shown
          ? `${shown.name}${activeSlugs.has(shown.slug) ? '' : ' (bald)'}`
          : 'Tippe auf deine Region'}
      </figcaption>
    </figure>
  );
}
