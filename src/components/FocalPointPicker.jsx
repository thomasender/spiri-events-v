import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, RotateCcw } from 'lucide-react';
import {
  DEFAULT_FOCAL_POINT,
  clamp01,
  focalPointToPercentString,
  normalizeFocalPoint,
} from '../lib/eventImage';
import './FocalPointPicker.css';

const STEP = 0.01;
const STEP_LARGE = 0.1;

function clampPoint(point) {
  return {
    x: clamp01(point?.x ?? DEFAULT_FOCAL_POINT.x),
    y: clamp01(point?.y ?? DEFAULT_FOCAL_POINT.y),
  };
}

export default function FocalPointPicker({
  imageUrl,
  alt = '',
  value,
  onChange,
  aspectRatio = '16 / 9',
  ariaLabel = 'Fokuspunkt des Titelbilds festlegen',
  testId = 'focal-point-picker',
}) {
  const containerRef = useRef(null);
  const dragStateRef = useRef(null);
  const [point, setPoint] = useState(() =>
    clampPoint(normalizeFocalPoint(value) ?? DEFAULT_FOCAL_POINT)
  );

  useEffect(() => {
    setPoint(clampPoint(normalizeFocalPoint(value) ?? DEFAULT_FOCAL_POINT));
  }, [value]);

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

  return (
    <div className="focal-point-picker" data-testid={testId}>
      <div
        ref={containerRef}
        className="focal-point-picker-canvas"
        style={{ aspectRatio }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="group"
        aria-label={ariaLabel}
        data-testid={`${testId}-canvas`}
      >
        <img src={imageUrl} alt="" className="focal-point-picker-image" draggable={false} />
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
