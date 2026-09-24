// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FocalPointPicker from '../../src/components/FocalPointPicker';

const IMAGE_URL = 'https://example.com/sample.jpg';

function stubCanvasRect(width = 200, height = 100) {
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

describe('FocalPointPicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the handle at the given focal point', () => {
    render(<FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.25, y: 0.75 }} />);
    const handle = getHandle();
    expect(handle.style.left).toBe('25%');
    expect(handle.style.top).toBe('75%');
    expect(handle.getAttribute('aria-valuenow')).toBe('25');
  });

  it('shows the percentage readout', () => {
    render(<FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.5, y: 0.2 }} />);
    expect(getReadout().textContent).toMatch(/50%/);
    expect(getReadout().textContent).toMatch(/20%/);
  });

  it('defaults to center when no value is provided', () => {
    render(<FocalPointPicker imageUrl={IMAGE_URL} />);
    const handle = getHandle();
    expect(handle.style.left).toBe('50%');
    expect(handle.style.top).toBe('50%');
  });

  it('returns null when no imageUrl is provided', () => {
    const { container } = render(<FocalPointPicker imageUrl="" />);
    expect(container.firstChild).toBeNull();
  });

  it('updates the focal point on canvas pointer down', () => {
    stubCanvasRect(200, 100);
    const onChange = vi.fn();
    render(<FocalPointPicker imageUrl={IMAGE_URL} onChange={onChange} />);
    fireEvent.pointerDown(getCanvas(), { clientX: 50, clientY: 25, pointerId: 1, button: 0 });
    expect(onChange).toHaveBeenCalledWith({ x: 0.25, y: 0.25 });
  });

  it('resets to center when the reset button is clicked', () => {
    const onChange = vi.fn();
    render(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.1, y: 0.9 }} onChange={onChange} />
    );
    fireEvent.click(getReset());
    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
  });

  it('nudges the x-axis with arrow keys by 1%', () => {
    const onChange = vi.fn();
    render(
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
    render(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.4, y: 0.5 }} onChange={onChange} />
    );
    fireEvent.keyDown(getHandle(), { key: 'ArrowRight', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ x: 0.5, y: 0.5 });
  });

  it('snaps to 0% / 100% on Home / End', () => {
    const onChange = vi.fn();
    render(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.4, y: 0.5 }} onChange={onChange} />
    );
    fireEvent.keyDown(getHandle(), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 0.5 });
    fireEvent.keyDown(getHandle(), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 0.5 });
  });

  it('clamps values outside [0, 1]', () => {
    const onChange = vi.fn();
    render(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.5, y: 0.5 }} onChange={onChange} />
    );
    fireEvent.keyDown(getHandle(), { key: 'Home' });
    fireEvent.keyDown(getHandle(), { key: 'Home' });
    fireEvent.keyDown(getHandle(), { key: 'End' });
    fireEvent.keyDown(getHandle(), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 0.5 });
  });

  it('updates when the value prop changes externally', () => {
    const { rerender } = render(
      <FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.1, y: 0.1 }} />
    );
    expect(getHandle().style.left).toBe('10%');
    rerender(<FocalPointPicker imageUrl={IMAGE_URL} value={{ x: 0.8, y: 0.3 }} />);
    expect(getHandle().style.left).toBe('80%');
    expect(getHandle().style.top).toBe('30%');
  });
});
