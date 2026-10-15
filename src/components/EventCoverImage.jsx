import { useState } from 'react';
import { coverImageStyle, normalizeFocalPoint } from '../lib/eventImage';

// Lazy by default: calendar lists render every event's cover at once and most
// sit below the fold. All wrappers have fixed dimensions, so there is no layout
// shift. Callers showing a hero image pass loading="eager" (rest overrides).
// Tiles pass `thumbnail` to load the small WebP (imageThumbUrl) first; the
// chain is thumbnail -> full image -> fallbackSrc, so events without a
// thumbnail (older uploads) behave exactly as before.
export default function EventCoverImage({
  event,
  fallbackSrc,
  className = '',
  alt,
  draggable = false,
  thumbnail = false,
  ...rest
}) {
  const focal = normalizeFocalPoint(event?.imageFocalPoint);
  const style = coverImageStyle(focal, event?.imageZoom);
  const resolvedAlt = alt ?? event?.title ?? '';
  const sources = [thumbnail && event?.imageThumbUrl, event?.imageUrl].filter(Boolean);
  const [failedCount, setFailedCount] = useState(0);
  const src = sources[failedCount] ?? fallbackSrc;
  if (!src) return null;
  return (
    <img
      src={src}
      alt={resolvedAlt}
      className={className}
      style={style}
      draggable={draggable}
      loading="lazy"
      decoding="async"
      onError={() => {
        setFailedCount((n) => n + 1);
        rest.onError?.();
      }}
      {...rest}
    />
  );
}
