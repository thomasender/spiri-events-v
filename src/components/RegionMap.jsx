import { useState } from 'react';
import { REGION_MAP } from '../data/regionMap';
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
      </svg>
      <figcaption className="region-map-caption" data-testid="region-map-caption">
        {shown
          ? `${shown.name}${activeSlugs.has(shown.slug) ? '' : ' (bald)'}`
          : 'Tippe auf deine Region'}
      </figcaption>
    </figure>
  );
}
