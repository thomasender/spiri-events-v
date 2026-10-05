import { focalPointToStyle, normalizeFocalPoint } from '../lib/eventImage';
import './AvatarImage.css';

export const MIN_PHOTO_ZOOM = 1;
export const MAX_PHOTO_ZOOM = 3;

export function normalizePhotoZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MIN_PHOTO_ZOOM;
  return Math.min(MAX_PHOTO_ZOOM, Math.max(MIN_PHOTO_ZOOM, n));
}

// Zooms about the focal point, so the chosen spot (e.g. a face) stays put.
export function photoZoomStyle(focalPoint, zoom) {
  const z = normalizePhotoZoom(zoom);
  const focal = normalizeFocalPoint(focalPoint);
  if (z <= MIN_PHOTO_ZOOM) return focalPointToStyle(focal);
  const origin = `${(focal?.x ?? 0.5) * 100}% ${(focal?.y ?? 0.5) * 100}%`;
  return { ...focalPointToStyle(focal), transform: `scale(${z})`, transformOrigin: origin };
}

// Profile photo with optional focal point + zoom. When zoomed, the image is
// wrapped in a clipping span that carries the caller's className (size, round
// shape, border); unzoomed it renders a plain <img> exactly as before.
export default function AvatarImage({ src, alt = '', className, focalPoint, zoom, ...rest }) {
  if (normalizePhotoZoom(zoom) <= MIN_PHOTO_ZOOM) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={focalPointToStyle(focalPoint)}
        {...rest}
      />
    );
  }
  return (
    <span className={`${className || ''} avatar-zoom`}>
      <img src={src} alt={alt} style={photoZoomStyle(focalPoint, zoom)} {...rest} />
    </span>
  );
}
