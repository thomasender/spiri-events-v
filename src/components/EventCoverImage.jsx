import { useState } from 'react';
import { coverImageStyle, normalizeFocalPoint } from '../lib/eventImage';

// Lazy by default: calendar lists render every event's cover at once and most
// sit below the fold. All wrappers have fixed dimensions, so there is no layout
// shift. Callers showing a hero image pass loading="eager" (rest overrides).
export default function EventCoverImage({
  event,
  fallbackSrc,
  className = '',
  alt,
  draggable = false,
  ...rest
}) {
  const focal = normalizeFocalPoint(event?.imageFocalPoint);
  const style = coverImageStyle(focal, event?.imageZoom);
  const resolvedAlt = alt ?? event?.title ?? '';
  const primarySrc = event?.imageUrl;
  const [errored, setErrored] = useState(false);
  const showFallback = !primarySrc || errored;
  const src = showFallback ? fallbackSrc : primarySrc;
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
        setErrored(true);
        rest.onError?.();
      }}
      {...rest}
    />
  );
}
