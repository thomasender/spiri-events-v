import { useState } from 'react';
import { focalPointToStyle, normalizeFocalPoint } from '../lib/eventImage';

export default function EventCoverImage({
  event,
  fallbackSrc,
  className = '',
  alt,
  draggable = false,
  ...rest
}) {
  const focal = normalizeFocalPoint(event?.imageFocalPoint);
  const style = focalPointToStyle(focal);
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
      onError={() => {
        setErrored(true);
        rest.onError?.();
      }}
      {...rest}
    />
  );
}
