// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FocalPointPicker from '../../src/components/FocalPointPicker';

const IMAGE_URL = 'https://example.com/sample.jpg';

function stubCanvasRect(width = 300, height = 200) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    // Only override the picker canvas; other elements return zero-sized rects
    // so any accidental use is a no-op rather than a crash.
    if (this.getAttribute && this.getAttribute('data-testid') === 'focal-point-picker-canvas') {
      return {
        width,
        height,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON() {},
      };
    }
    return { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
  });
}

function renderWithImageLoaded(ui, naturalSize = { naturalWidth: 300, naturalHeight: 200 }) {
  const result = render(ui);
  const img = screen.getByTestId('focal-point-picker-image');
  Object.defineProperty(img, 'naturalWidth', {
    value: naturalSize.naturalWidth,
    configurable: true,
  });
  Object.defineProperty(img, 'naturalHeight', {
    value: naturalSize.naturalHeight,
    configurable: true,
  });
  fireEvent.load(img);
  return result;
}

function getCanvas() {
  return screen.getByTestId('focal-point-picker-canvas');
}

function getHandle() {
  return screen.getByTestId('focal-point-picker-handle-x');
}

function getReadout() {
  return screen.getByTestId('focal-point-picker-readout');
}

function getReset() {
  return screen.getByTestId('focal-point-picker-reset');
}

function getInfo() {
  return screen.getByTestId('focal-point-picker-info');
}

function getPreview() {
  return screen.getByTestId('focal-point-picker-preview');
}

function getCropFrame() {
  return screen.getByTestId('focal-point-picker-crop-frame');
}

describe('FocalPointPicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the handle at the given focal point', () => {
    renderWithImageLoaded(<FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.25, y: 0.75 }} />);
    const handle = getHandle();
    expect(handle.style.left).toBe('25%');
    expect(handle.style.top).toBe('75%');
    expect(handle.getAttribute('aria-valuenow')).toBe('25');
  });

  it('shows the percentage readout', () => {
    renderWithImageLoaded(<FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.5, y: 0.2 }} />);
    expect(getReadout().textContent).toMatch(/50%/);
    expect(getReadout().textContent).toMatch(/20%/);
  });

  it('defaults to center when no value is provided', () => {
    renderWithImageLoaded(<FocalPointPicker imageUrl={IMAGE_URL} />);
    const handle = getHandle();
    expect(handle.style.left).toBe('50%');
    expect(handle.style.top).toBe('50%');
  });

  it('returns null when no imageUrl is provided', () => {
    const { container } = render(<FocalPointPicker imageUrl="" />);
    expect(container.firstChild).toBeNull();
  });

  it('updates the focal point on canvas pointer down', () => {
    stubCanvasRect(300, 200);
    const onChange = vi.fn();
    renderWithImageLoaded(<FocalPointPicker imageUrl={IMAGE_URL} onChange={onChange} />, {
      naturalWidth: 300,
      naturalHeight: 200,
    });
    fireEvent.pointerDown(getCanvas(), { clientX: 75, clientY: 50, pointerId: 1, button: 0 });
    expect(onChange).toHaveBeenCalledWith({ x: 0.25, y: 0.25 });
  });

  it('resets to center when the reset button is clicked', () => {
    const onChange = vi.fn();
    renderWithImageLoaded(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.1, y: 0.9 }} onChange={onChange} />
    );
    fireEvent.click(getReset());
    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
  });

  it('nudges the x-axis with arrow keys by 1%', () => {
    const onChange = vi.fn();
    renderWithImageLoaded(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.4, y: 0.5 }} onChange={onChange} />
    );
    fireEvent.keyDown(getHandle(), { key: 'ArrowRight' });
    // Floating point: 0.4 + 0.01 → 0.41000000000000003. Assert closeness.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: expect.closeTo(0.41), y: 0.5 })
    );
    fireEvent.keyDown(getHandle(), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ x: 0.4, y: 0.5 }));
  });

  it('nudges by 10% with Shift + arrow', () => {
    const onChange = vi.fn();
    renderWithImageLoaded(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.4, y: 0.5 }} onChange={onChange} />
    );
    fireEvent.keyDown(getHandle(), { key: 'ArrowRight', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ x: 0.5, y: 0.5 });
  });

  it('snaps to 0% / 100% on Home / End', () => {
    const onChange = vi.fn();
    renderWithImageLoaded(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.4, y: 0.5 }} onChange={onChange} />
    );
    fireEvent.keyDown(getHandle(), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 0.5 });
    fireEvent.keyDown(getHandle(), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 0.5 });
  });

  it('clamps values outside [0, 1]', () => {
    const onChange = vi.fn();
    renderWithImageLoaded(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.5, y: 0.5 }} onChange={onChange} />
    );
    fireEvent.keyDown(getHandle(), { key: 'Home' });
    fireEvent.keyDown(getHandle(), { key: 'Home' });
    fireEvent.keyDown(getHandle(), { key: 'End' });
    fireEvent.keyDown(getHandle(), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 0.5 });
  });

  it('updates when the value prop changes externally', () => {
    const { rerender } = renderWithImageLoaded(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.1, y: 0.1 }} />
    );
    expect(getHandle().style.left).toBe('10%');
    rerender(<FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.8, y: 0.3 }} />);
    expect(getHandle().style.left).toBe('80%');
    expect(getHandle().style.top).toBe('30%');
  });

  it('shows an explanatory info text', () => {
    renderWithImageLoaded(<FocalPointPicker imageUrl={IMAGE_URL} />);
    const info = getInfo();
    expect(info.textContent).toMatch(/Fokuspunkt/);
    expect(info.textContent).toMatch(/zugeschnitten/i);
    expect(info.textContent).toMatch(/Fadenkreuz/);
  });

  it('shows a 16:9 live preview of the cropped image', () => {
    renderWithImageLoaded(<FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.2, y: 0.7 }} />);
    const preview = getPreview();
    expect(preview).toBeInTheDocument();
    const previewImg = preview.querySelector('img');
    expect(previewImg).not.toBeNull();
    expect(previewImg.style.objectPosition).toBe('20% 70%');
  });

  it('updates the live preview when the focal point changes', () => {
    const onChange = vi.fn();
    renderWithImageLoaded(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.5, y: 0.5 }} onChange={onChange} />
    );
    fireEvent.keyDown(getHandle(), { key: 'ArrowLeft' });
    const previewImg = getPreview().querySelector('img');
    // 0.5 - 0.01 = 0.49 (with floating point). Use closeTo for robustness.
    expect(previewImg.style.objectPosition).toMatch(/4\d%/);
  });

  it('renders a 16:9 crop frame on a wide (landscape) image', () => {
    // 600×300 image: image aspect 2:1, wider than 16:9. Crop = full height, width = 300*16/9 ≈ 533.
    renderWithImageLoaded(<FocalPointPicker imageUrl={IMAGE_URL} />, {
      naturalWidth: 600,
      naturalHeight: 300,
    });
    const frame = getCropFrame();
    // width = (533/600) * 100 ≈ 88.89, height = 100% (full height)
    expect(parseFloat(frame.style.width)).toBeCloseTo(88.89, 1);
    expect(frame.style.height).toBe('100%');
  });

  it('renders a 16:9 crop frame on a tall (portrait) image', () => {
    // 300×600 image: image aspect 1:2, taller than 16:9. Crop = full width, height = 300/16*9 ≈ 168.75.
    renderWithImageLoaded(<FocalPointPicker imageUrl={IMAGE_URL} />, {
      naturalWidth: 300,
      naturalHeight: 600,
    });
    const frame = getCropFrame();
    // width = 100% (full width), height = (168.75/600) * 100 ≈ 28.13
    expect(frame.style.width).toBe('100%');
    expect(parseFloat(frame.style.height)).toBeCloseTo(28.13, 1);
  });

  it('positions the crop frame so that its center matches the focal point', () => {
    renderWithImageLoaded(<FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.2, y: 0.8 }} />, {
      naturalWidth: 600,
      naturalHeight: 300,
    });
    const frame = getCropFrame();
    // width = 88.89% (533/600), so left = (0.2 - 88.89/200) * 100 = (0.2 - 0.4444) * 100 = -24.44%
    expect(parseFloat(frame.style.left)).toBeCloseTo(-24.44, 1);
    // top = (0.8 - 100/200) * 100 = (0.8 - 0.5) * 100 = 30%
    expect(parseFloat(frame.style.top)).toBeCloseTo(30, 1);
  });

  it('does not render the crop frame before the image dimensions are known', () => {
    render(<FocalPointPicker imageUrl={IMAGE_URL} />);
    expect(screen.queryByTestId('focal-point-picker-crop-frame')).toBeNull();
  });
});
