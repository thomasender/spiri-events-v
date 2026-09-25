import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Info, RotateCcw } from 'lucide-react';
import {
  DEFAULT_FOCAL_POINT,
  clamp01,
  focalPointToPercentString,
  normalizeFocalPoint,
} from '../lib/eventImage';
import './FocalPointPicker.css';

const STEP = 0.01;
const STEP_LARGE = 0.1;
const CROP_ASPECT = 16 / 9;
const FALLBACK_ASPECT = 4 / 3;

function clampPoint(point) {
  return {
    x: clamp01(point?.x ?? DEFAULT_FOCAL_POINT.x),
    y: clamp01(point?.y ?? DEFAULT_FOCAL_POINT.y),
  };
}

function aspectRatioStyle(naturalWidth, naturalHeight) {
  if (naturalWidth > 0 && naturalHeight > 0) {
    return `${naturalWidth} / ${naturalHeight}`;
  }
  return FALLBACK_ASPECT;
}

export default function FocalPointPicker({
  imageUrl,
  value,
  onChange,
  ariaLabel = 'Fokuspunkt des Titelbilds festlegen',
  testId = 'focal-point-picker',
}) {
  const containerRef = useRef(null);
  const dragStateRef = useRef(null);
  const [point, setPoint] = useState(() =>
    clampPoint(normalizeFocalPoint(value) ?? DEFAULT_FOCAL_POINT)
  );
  const [imageSize, setImageSize] = useState(null);

  useEffect(() => {
    setPoint(clampPoint(normalizeFocalPoint(value) ?? DEFAULT_FOCAL_POINT));
  }, [value]);

  const handleImageLoad = useCallback((event) => {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  }, []);

  const cropInImage = useMemo(() => {
    if (!imageSize) return null;
    const { width: w, height: h } = imageSize;
    if (w <= 0 || h <= 0) return null;
    if (w / h > CROP_ASPECT) {
      return { width: h * CROP_ASPECT, height: h };
    }
    return { width: w, height: w / CROP_ASPECT };
  }, [imageSize]);

  const cropFrame = useMemo(() => {
    if (!cropInImage || !imageSize) return null;
    const widthPct = (cropInImage.width / imageSize.width) * 100;
    const heightPct = (cropInImage.height / imageSize.height) * 100;
    return {
      widthPct,
      heightPct,
      leftPct: (point.x - widthPct / 200) * 100,
      topPct: (point.y - heightPct / 200) * 100,
    };
  }, [cropInImage, imageSize, point.x, point.y]);

  const commit = useCallback(
    (next) => {
      const clamped = clampPoint(next);
      setPoint(clamped);
      onChange?.(clamped);
    },
    [onChange]
  );

  const pointFromClient = useCallback((clientX, clientY) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return clampPoint({ x, y });
  }, []);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const target = e.currentTarget;
      target.setPointerCapture?.(e.pointerId);
      dragStateRef.current = { pointerId: e.pointerId };
      const next = pointFromClient(e.clientX, e.clientY);
      if (next) commit(next);
      e.preventDefault();
    },
    [pointFromClient, commit]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!dragStateRef.current || dragStateRef.current.pointerId !== e.pointerId) return;
      const next = pointFromClient(e.clientX, e.clientY);
      if (next) commit(next);
    },
    [pointFromClient, commit]
  );

  const onPointerUp = useCallback((e) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== e.pointerId) return;
    const target = e.currentTarget;
    target.releasePointerCapture?.(e.pointerId);
    dragStateRef.current = null;
  }, []);

  const onKeyDown = useCallback(
    (axis, e) => {
      let next = point;
      const large = e.shiftKey;
      const step = large ? STEP_LARGE : STEP;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = { ...point, [axis]: clamp01(point[axis] - step) };
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          next = { ...point, [axis]: clamp01(point[axis] + step) };
          break;
        case 'Home':
          next = { ...point, [axis]: 0 };
          break;
        case 'End':
          next = { ...point, [axis]: 1 };
          break;
        default:
          return;
      }
      e.preventDefault();
      commit(next);
    },
    [point, commit]
  );

  const reset = useCallback(() => commit(DEFAULT_FOCAL_POINT), [commit]);

  if (!imageUrl) return null;

  const percentText = focalPointToPercentString(point);
  const canvasAspect = aspectRatioStyle(imageSize?.width, imageSize?.height);
  const previewStyle = { objectPosition: `${point.x * 100}% ${point.y * 100}%` };

  return (
    <div className="focal-point-picker" data-testid={testId}>
      <p className="focal-point-picker-info" data-testid={`${testId}-info`}>
        <Info size={14} aria-hidden="true" />
        <span>
          Lege mit dem Fokuspunkt fest, welcher Bildausschnitt sichtbar bleibt, wenn das Foto
          zugeschnitten wird (zum Beispiel in der Kalender-Kachel). Verschiebe das Fadenkreuz auf
          den Bereich, der wichtig ist – etwa ein Gesicht oder ein Logo. Das Vorschau-Bild rechts
          zeigt, wie das Foto später aussehen wird.
        </span>
      </p>

      <div className="focal-point-picker-body">
        <div
          ref={containerRef}
          className="focal-point-picker-canvas"
          style={{ aspectRatio: canvasAspect }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="group"
          aria-label={ariaLabel}
          data-testid={`${testId}-canvas`}
        >
          <img
            src={imageUrl}
            alt=""
            className="focal-point-picker-image"
            draggable={false}
            onLoad={handleImageLoad}
            data-testid={`${testId}-image`}
          />
          {cropFrame && (
            <div
              className="focal-point-picker-crop-frame"
              style={{
                width: `${cropFrame.widthPct}%`,
                height: `${cropFrame.heightPct}%`,
                left: `${cropFrame.leftPct}%`,
                top: `${cropFrame.topPct}%`,
              }}
              aria-hidden="true"
              data-testid={`${testId}-crop-frame`}
            />
          )}
          <button
            type="button"
            className="focal-point-picker-handle"
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            aria-label={`Fokuspunkt horizontal: ${Math.round(point.x * 100)} Prozent. Mit Pfeiltasten anpassen.`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(point.x * 100)}
            aria-valuetext={`${Math.round(point.x * 100)} %`}
            role="slider"
            data-testid={`${testId}-handle-x`}
            onKeyDown={(e) => onKeyDown('x', e)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Crosshair size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="focal-point-picker-preview-wrapper">
          <span className="focal-point-picker-preview-label">
            So sieht es nach dem Zuschneiden aus:
          </span>
          <div
            className="focal-point-picker-preview"
            aria-hidden="true"
            data-testid={`${testId}-preview`}
          >
            <img
              src={imageUrl}
              alt=""
              className="focal-point-picker-preview-image"
              style={previewStyle}
              draggable={false}
            />
          </div>
        </div>
      </div>

      <div
        className="focal-point-picker-readout"
        aria-live="polite"
        data-testid={`${testId}-readout`}
      >
        <span className="focal-point-picker-readout-label">Fokuspunkt:</span>
        <span className="focal-point-picker-readout-value">{percentText}</span>
        <button
          type="button"
          className="focal-point-picker-reset"
          onClick={reset}
          aria-label="Fokuspunkt auf Mitte zurücksetzen"
          data-testid={`${testId}-reset`}
        >
          <RotateCcw size={12} aria-hidden="true" />
          <span>Auf Mitte</span>
        </button>
      </div>
    </div>
  );
}
