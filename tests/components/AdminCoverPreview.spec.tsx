// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const updateDocMock = vi.fn();
const docMock = vi.fn((...args: unknown[]) => args);
vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));
vi.mock('../../src/lib/firebase', () => ({ db: {} }));

import AdminCoverPreview from '../../src/components/AdminCoverPreview';

const base = {
  id: 'ev1',
  title: 'Morgen-Yoga',
  status: 'pending',
  imageUrl: 'https://x/cover.jpg',
  imageFocalPoint: { x: 0.1, y: 0.9 },
  imageZoom: 1.5,
};

// Gives the viewport a real size and the photo natural dimensions (jsdom has
// neither): a 320x180 frame showing a 2000x900 photo, 80px of horizontal play.
function sizeViewport(frameTestId: string, imageTestId: string) {
  const frame = screen.getByTestId(frameTestId);
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
    width: 320,
    height: 180,
    left: 0,
    top: 0,
    right: 320,
    bottom: 180,
    x: 0,
    y: 0,
    toJSON() {},
  });
  const img = screen.getByTestId(imageTestId);
  Object.defineProperty(img, 'naturalWidth', { value: 2000, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: 900, configurable: true });
  fireEvent.load(img);
  return frame;
}

beforeEach(() => {
  updateDocMock.mockReset();
  docMock.mockClear();
});

describe('AdminCoverPreview', () => {
  it('shows the saved crop as the tile shows it', () => {
    render(<AdminCoverPreview event={base} isAdmin />);
    const img = screen.getByTestId('admin-cover-preview').querySelector('img');
    expect(img).toHaveAttribute('src', 'https://x/cover.jpg');
    expect(img).toHaveStyle({ objectPosition: '10% 90%' });
    expect(img).toHaveStyle({ transform: 'scale(1.5)' });
  });

  it.each([
    ['not an admin', { isAdmin: false, event: base }],
    ['approved', { isAdmin: true, event: { ...base, status: 'approved' } }],
    ['draft', { isAdmin: true, event: { ...base, status: 'draft' } }],
    ['there is no cover photo', { isAdmin: true, event: { ...base, imageUrl: '' } }],
  ])('renders nothing when %s', (_name, props) => {
    const { container } = render(<AdminCoverPreview {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('saves the adjusted zoom and focal point without touching the status, and reports it', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const onCropSaved = vi.fn();
    render(<AdminCoverPreview event={base} isAdmin onCropSaved={onCropSaved} />);
    fireEvent.click(screen.getByTestId('admin-cover-crop-edit'));
    fireEvent.change(screen.getByTestId('admin-cover-focal-picker-zoom'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByTestId('admin-cover-crop-save'));
    await vi.waitFor(() => expect(onCropSaved).toHaveBeenCalled());
    expect(docMock).toHaveBeenCalledWith({}, 'events', 'ev1');
    expect(updateDocMock.mock.calls[0][1]).toEqual({
      imageFocalPoint: { x: 0.1, y: 0.9 },
      imageZoom: 2,
    });
    expect(onCropSaved).toHaveBeenCalledWith({ imageFocalPoint: { x: 0.1, y: 0.9 }, imageZoom: 2 });
    expect(screen.getByTestId('admin-cover-preview')).toBeInTheDocument();
  });

  it('stores the default focal point and zoom 1 as null', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const event = { ...base, imageFocalPoint: { x: 0.5, y: 0.5 }, imageZoom: 1 };
    render(<AdminCoverPreview event={event} isAdmin />);
    fireEvent.click(screen.getByTestId('admin-cover-crop-edit'));
    fireEvent.click(screen.getByTestId('admin-cover-crop-save'));
    await vi.waitFor(() => expect(updateDocMock).toHaveBeenCalled());
    expect(updateDocMock.mock.calls[0][1]).toEqual({ imageFocalPoint: null, imageZoom: null });
  });

  it('shows an error and stays in the editor when saving fails', async () => {
    // A synchronous throw inside the save's try block; a rejected mock promise
    // would trip vitest's unhandled-rejection tracking even though it is caught.
    docMock.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    const onCropSaved = vi.fn();
    render(<AdminCoverPreview event={base} isAdmin onCropSaved={onCropSaved} />);
    fireEvent.click(screen.getByTestId('admin-cover-crop-edit'));
    fireEvent.click(screen.getByTestId('admin-cover-crop-save'));
    expect(await screen.findByTestId('admin-cover-crop-error')).toBeInTheDocument();
    expect(screen.getByTestId('admin-cover-crop-editor')).toBeInTheDocument();
    expect(onCropSaved).not.toHaveBeenCalled();
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('saves nothing when the admin cancels', () => {
    render(<AdminCoverPreview event={base} isAdmin />);
    fireEvent.click(screen.getByTestId('admin-cover-crop-edit'));
    fireEvent.change(screen.getByTestId('admin-cover-focal-picker-zoom'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByTestId('admin-cover-crop-cancel'));
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('admin-cover-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-cover-crop-editor')).toBeNull();
  });

  it('moves the crop by dragging the preview and saves the dragged position', async () => {
    updateDocMock.mockResolvedValue(undefined);
    render(<AdminCoverPreview event={{ ...base, imageZoom: 1 }} isAdmin />);
    fireEvent.click(screen.getByTestId('admin-cover-crop-edit'));
    expect(screen.queryByTestId('admin-cover-crop-unsaved')).toBeNull();
    const frame = sizeViewport('admin-cover-viewport-frame', 'admin-cover-viewport-image');
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 50, button: 0 });
    // 40px to the right: range is 80px, so x goes 0.1 -> 0.1 - 0.5 -> clamped to 0.
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 140, clientY: 50 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 140, clientY: 50 });
    expect(screen.getByTestId('admin-cover-viewport-image')).toHaveStyle({
      objectPosition: '0% 90%',
    });
    expect(screen.getByTestId('admin-cover-crop-unsaved')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-cover-crop-save'));
    await vi.waitFor(() => expect(updateDocMock).toHaveBeenCalled());
    expect(updateDocMock.mock.calls[0][1]).toEqual({
      imageFocalPoint: { x: 0, y: 0.9 },
      imageZoom: null,
    });
  });

  it('zooms with two fingers and with the mouse wheel', async () => {
    updateDocMock.mockResolvedValue(undefined);
    render(<AdminCoverPreview event={{ ...base, imageZoom: 1 }} isAdmin />);
    fireEvent.click(screen.getByTestId('admin-cover-crop-edit'));
    const frame = sizeViewport('admin-cover-viewport-frame', 'admin-cover-viewport-image');
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerDown(frame, { pointerId: 2, clientX: 150, clientY: 100, button: 0 });
    fireEvent.pointerMove(frame, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(frame, { pointerId: 2 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    // Distance 50 -> 100 doubles the zoom, position is not moved by the pinch.
    expect(screen.getByTestId('admin-cover-viewport-image')).toHaveStyle({
      transform: 'scale(2)',
      objectPosition: '10% 90%',
    });
    const wheel = new WheelEvent('wheel', { deltaY: -1000, cancelable: true, bubbles: true });
    act(() => {
      frame.dispatchEvent(wheel);
    });
    expect(wheel.defaultPrevented).toBe(true);
    expect(screen.getByTestId('admin-cover-focal-picker-zoom')).toHaveValue('3');
  });

  it('a cancelled gesture ends the drag', () => {
    render(<AdminCoverPreview event={{ ...base, imageZoom: 1 }} isAdmin />);
    fireEvent.click(screen.getByTestId('admin-cover-crop-edit'));
    const frame = sizeViewport('admin-cover-viewport-frame', 'admin-cover-viewport-image');
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 50, button: 0 });
    fireEvent.pointerCancel(frame, { pointerId: 1 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 140, clientY: 50 });
    expect(screen.getByTestId('admin-cover-viewport-image')).toHaveStyle({
      objectPosition: '10% 90%',
    });
  });
});
