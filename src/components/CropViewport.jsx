import { useCallback, useEffect, useRef, useState } from 'react';
import { coverImageStyle } from '../lib/eventImage';
import { clampFocal, clampZoom, dragFocalPoint, pinchZoom, wheelZoom } from '../lib/cropGesture';
import './CropViewport.css';

const KEY_STEP = 0.02;
const KEY_STEP_LARGE = 0.1;

/**
 * The preview itself as the control: a frame in the exact aspect ratio of the
 * later display, in which the photo is dragged (mouse, one finger), pinched
 * (two fingers) and zoomed (mouse wheel). Arrow keys move it, the slider
 * zooms, so it works without a pointer too. `children` is drawn on top (the
 * Instagram text overlay) and does not catch gestures.
 */
export default function CropViewport({
  imageUrl,
  aspect,
  focalPoint,
  zoom,
  onFocalPointChange,
  onZoomChange,
  minZoom = 1,
  maxZoom = 3,
  zoomTestId,
  ariaLabel = 'Bildausschnitt verschieben',
  testId = 'crop-viewport',
  className = '',
  hint = 'Bild ziehen, zum Zoomen zwei Finger oder Mausrad.',
  children = null,
}) {
  const frameRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const sizeRef = useRef(null);
  const imageRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  // Latest values for the native wheel listener and the pointer handlers.
  const live = useRef({});
  useEffect(() => {
    live.current = { focalPoint, zoom, onFocalPointChange, onZoomChange, minZoom, maxZoom };
  });

  const geometry = useCallback(() => {
    const rect = frameRef.current?.getBoundingClientRect();
    const size = sizeRef.current;
    if (!rect || !size) return null;
    return {
      frameWidth: rect.width,
      frameHeight: rect.height,
      imageWidth: size.width,
      imageHeight: size.height,
      zoom: live.current.zoom,
    };
  }, []);

  const readImageSize = useCallback(() => {
    const img = imageRef.current;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      sizeRef.current = { width: img.naturalWidth, height: img.naturalHeight };
    }
  }, []);

  // A cached image can finish loading before React attached onLoad.
  useEffect(() => {
    sizeRef.current = null;
    readImageSize();
  }, [imageUrl, readImageSize]);

  // React registers wheel listeners as passive, so preventDefault (keeping
  // the page from scrolling while zooming) needs a native listener.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const { zoom: z, onZoomChange: change, minZoom: lo, maxZoom: hi } = live.current;
      if (!change) return;
      e.preventDefault();
      change(wheelZoom(z, e.deltaY, lo, hi));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pinchDistance = () => {
    const [a, b] = [...pointersRef.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    if (pointersRef.current.size === 2 && live.current.onZoomChange) {
      const distance = pinchDistance();
      pinchRef.current = distance > 0 ? { distance, zoom: live.current.zoom } : null;
    }
  };

  const onPointerMove = (e) => {
    const previous = pointersRef.current.get(e.pointerId);
    if (!previous) return;
    const current = { x: e.clientX, y: e.clientY };
    pointersRef.current.set(e.pointerId, current);
    const { minZoom: lo, maxZoom: hi } = live.current;

    if (pointersRef.current.size >= 2) {
      if (!pinchRef.current) return;
      const next = pinchZoom(
        pinchRef.current.zoom,
        pinchRef.current.distance,
        pinchDistance(),
        lo,
        hi
      );
      live.current.onZoomChange?.(next);
      return;
    }

    const geo = geometry();
    if (!geo) return;
    live.current.onFocalPointChange?.(
      dragFocalPoint(live.current.focalPoint, current.x - previous.x, current.y - previous.y, geo)
    );
  };

  const endPointer = (e) => {
    if (!pointersRef.current.delete(e.pointerId)) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    // Leaving a pinch: the remaining finger carries on as a plain drag from
    // where it is, without a jump.
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) setDragging(false);
  };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const point = clampFocal(focalPoint);
    const moves = {
      ArrowLeft: { x: point.x - step, y: point.y },
      ArrowRight: { x: point.x + step, y: point.y },
      ArrowUp: { x: point.x, y: point.y - step },
      ArrowDown: { x: point.x, y: point.y + step },
    };
    const next = moves[e.key];
    if (!next) return;
    e.preventDefault();
    onFocalPointChange?.(clampFocal(next));
  };

  if (!imageUrl) return null;
  const point = clampFocal(focalPoint);

  return (
    <div className={`crop-viewport ${className}`.trim()} data-testid={testId}>
      {onZoomChange && zoomTestId && (
        <div className="crop-viewport-zoom">
          <label htmlFor={zoomTestId}>Hineinzoomen</label>
          <input
            id={zoomTestId}
            type="range"
            min={minZoom}
            max={maxZoom}
            step="any"
            value={zoom}
            onChange={(e) => onZoomChange(clampZoom(e.target.value, minZoom, maxZoom))}
            data-testid={zoomTestId}
          />
          <output htmlFor={zoomTestId}>{Math.round(zoom * 100)} %</output>
        </div>
      )}
      <div
        ref={frameRef}
        className={`crop-viewport-frame${dragging ? ' is-dragging' : ''}`}
        style={{ aspectRatio: String(aspect) }}
        role="group"
        tabIndex={0}
        aria-label={`${ariaLabel}. Mit den Pfeiltasten verschieben.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onKeyDown={onKeyDown}
        data-testid={`${testId}-frame`}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt=""
          className="crop-viewport-image"
          style={coverImageStyle(point, zoom)}
          draggable={false}
          onLoad={readImageSize}
          data-testid={`${testId}-image`}
        />
        {children}
      </div>
      <p className="crop-viewport-hint">{hint}</p>
    </div>
  );
}
