// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FocalPointPicker from '../../src/components/FocalPointPicker';
import { coverImageStyle, normalizeImageZoom } from '../../src/lib/eventImage';

describe('cover image zoom', () => {
  it('clamps zoom to 1..3 and falls back to 1 for junk', () => {
    expect(normalizeImageZoom(5)).toBe(3);
    expect(normalizeImageZoom(0.2)).toBe(1);
    expect(normalizeImageZoom('abc')).toBe(1);
    expect(normalizeImageZoom(undefined)).toBe(1);
  });

  it('scales about the focal point only when zoomed', () => {
    expect(coverImageStyle({ x: 0.25, y: 0.75 }, 1)).toEqual({ objectPosition: '25% 75%' });
    expect(coverImageStyle({ x: 0.25, y: 0.75 }, 2)).toEqual({
      objectPosition: '25% 75%',
      transform: 'scale(2)',
      transformOrigin: '25% 75%',
    });
  });

  it('shows a zoom slider that reports changes when enabled', () => {
    const onZoomChange = (z: number) => calls.push(z);
    const calls: number[] = [];
    render(
      <FocalPointPicker
        imageUrl="https://example.com/a.jpg"
        zoom={1}
        onZoomChange={onZoomChange}
        showZoomSlider
      />
    );
    fireEvent.change(screen.getByTestId('focal-point-picker-zoom'), { target: { value: '2' } });
    expect(calls).toEqual([2]);
  });
});
