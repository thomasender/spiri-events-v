// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import AvatarImage, { normalizePhotoZoom } from '../../src/components/AvatarImage';

describe('normalizePhotoZoom', () => {
  it('clamps to 1..3 and falls back to 1', () => {
    expect(normalizePhotoZoom(0.5)).toBe(1);
    expect(normalizePhotoZoom(5)).toBe(3);
    expect(normalizePhotoZoom('abc')).toBe(1);
    expect(normalizePhotoZoom(undefined)).toBe(1);
    expect(normalizePhotoZoom(1.5)).toBe(1.5);
  });
});

describe('AvatarImage', () => {
  it('renders a plain image when not zoomed', () => {
    const { container } = render(<AvatarImage src="a.jpg" className="x" zoom={1} />);
    expect(container.querySelector('span')).toBeNull();
    expect(container.querySelector('img.x')).not.toBeNull();
  });

  it('scales around the focal point when zoomed', () => {
    const { container } = render(
      <AvatarImage src="a.jpg" className="x" zoom={2} focalPoint={{ x: 0.25, y: 0.75 }} />
    );
    const img = container.querySelector('span.x.avatar-zoom img') as HTMLImageElement;
    expect(img.style.transform).toBe('scale(2)');
    expect(img.style.transformOrigin).toBe('25% 75%');
  });
});
