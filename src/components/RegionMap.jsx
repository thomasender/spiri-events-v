import { useState } from 'react';
import { REGION_MAP } from '../data/regionMap';
import './RegionMap.css';

// Region names on the map by size (SVG units): big regions always, medium ones
// on wide screens only (CSS), small ones never (they would overlap; their name
// shows in the caption on hover and in the list).
const BIG_REGION_AREA = 5000;
const MEDIUM_REGION_AREA = 3500;

/**
 * Silent map of Germany, Austria and Switzerland: only the regions are drawn
 * and named, no countries or cities. A pointer shortcut only: the region list
 * next to it is the accessible equivalent, so the map is hidden from screen
 * readers and the keyboard. `activeSlugs`: regions that are open; the others
 * lead to their coming-soon page and are drawn quieter.
 */
export default function RegionMap({ regions, activeSlugs, onChoose }) {
  const [hovered, setHovered] = useState(null);
  const byId = new Map(regions.map((r) => [r.slug, r]));
  const shown = hovered ? byId.get(hovered) : null;

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
          const active = activeSlugs.has(shape.id);
          return (
            <path
              key={shape.id}
              d={shape.d}
              data-region={shape.id}
              className={`region-map-shape${active ? ' region-map-shape--active' : ''}${
                hovered === shape.id ? ' region-map-shape--hover' : ''
              }`}
              onClick={() => onChoose(shape.id)}
              onMouseEnter={() => setHovered(shape.id)}
              onMouseLeave={() => setHovered((h) => (h === shape.id ? null : h))}
            />
          );
        })}
        {REGION_MAP.regions.map((shape) => {
          const region = byId.get(shape.id);
          if (!region) return null;
          const big = shape.area > BIG_REGION_AREA;
          if (!big && shape.area <= MEDIUM_REGION_AREA) return null;
          return (
            <text
              key={shape.id}
              x={shape.cx}
              y={shape.cy}
              textAnchor="middle"
              dominantBaseline="middle"
              className={`region-map-label${big ? ' region-map-label--big' : ''}`}
            >
              {region.name}
            </text>
          );
        })}
      </svg>
      <figcaption className="region-map-caption" data-testid="region-map-caption">
        {shown
          ? `${shown.name}${activeSlugs.has(shown.slug) ? '' : ' (bald)'}`
          : 'Tippe auf deine Region'}
      </figcaption>
    </figure>
  );
}
