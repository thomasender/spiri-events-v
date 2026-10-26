import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
});
