// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
const updateDocMock = vi.fn();
const docMock = vi.fn((...args: unknown[]) => args);
vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));
vi.mock('../../src/lib/firebase', () => ({ db: {} }));

import InstagramPostPreview, {
  AdminInstagramPreview,
  formatPreviewDate,
  formatPreviewOrganizer,
} from '../../src/components/InstagramPostPreview';

const event = {
  title: 'Morgen-Yoga',
  category: 'Yoga',
  date: '2026-10-12',
  time: '09:00',
  place: 'Dornbirn',
  organizer: 'Anna Muster',
};

describe('InstagramPostPreview', () => {
  it('renders nothing without an image', () => {
    const { container } = render(<InstagramPostPreview imageUrl="" event={event} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the carousel text by default and switches to the plain post with the toggle', () => {
    render(
      <InstagramPostPreview
        imageUrl="blob:x"
        focalPoint={{ x: 0.2, y: 0.8 }}
        zoom={2}
        event={event}
      />
    );
    const overlay = screen.getByTestId('instagram-preview-overlay');
    expect(overlay).toHaveTextContent('Morgen-Yoga');
    expect(overlay).toHaveTextContent('12.10.2026');
    expect(overlay).toHaveTextContent('Dornbirn');
    expect(document.querySelector('img')).toHaveStyle({ objectPosition: '20% 80%' });
    fireEvent.click(screen.getByTestId('instagram-preview-mode-post'));
    expect(screen.queryByTestId('instagram-preview-overlay')).toBeNull();
    fireEvent.click(screen.getByTestId('instagram-preview-mode-carousel'));
    expect(screen.getByTestId('instagram-preview-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('instagram-preview-post-overlay')).toBeNull();
  });

  it('shows only title and organizer in the single-post preview', () => {
    render(<InstagramPostPreview imageUrl="blob:x" event={event} />);
    fireEvent.click(screen.getByTestId('instagram-preview-mode-post'));
    const overlay = screen.getByTestId('instagram-preview-post-overlay');
    expect(overlay).toHaveTextContent('Morgen-Yoga');
    expect(overlay).toHaveTextContent('Anna Muster');
    expect(overlay.querySelector('.instagram-post-preview-chip')).toBeNull();
    expect(overlay).not.toHaveTextContent('12.10.2026');
    expect(overlay).not.toHaveTextContent('09:00');
    expect(overlay).not.toHaveTextContent('Dornbirn');
  });

  it('formats the organizer name from name or first/last name', () => {
    expect(formatPreviewOrganizer({ name: ' Studio Om ' })).toBe('Studio Om');
    expect(formatPreviewOrganizer({ firstName: 'Anna', lastName: 'Muster' })).toBe('Anna Muster');
    expect(formatPreviewOrganizer(null)).toBe('');
  });

  it('shows the hint and the not-posted disclaimer', () => {
    render(<InstagramPostPreview imageUrl="blob:x" event={event} />);
    expect(screen.getByTestId('instagram-preview-notes')).toHaveTextContent('Ungefähre Vorschau');
    expect(screen.getByTestId('instagram-preview-disclaimer')).toHaveTextContent(
      'Wir behalten uns vor, den Beitrag nicht zu posten'
    );
  });

  it('formats ISO dates', () => {
    expect(formatPreviewDate('2026-10-12')).toBe('12.10.2026');
    expect(formatPreviewDate('')).toBe('');
  });
});

describe('AdminInstagramPreview', () => {
  const base = {
    ...event,
    status: 'pending',
    instagramConsent: true,
    imageUrl: 'https://x/cover.jpg',
    instagramImage: { url: 'https://x/ig.jpg', focalPoint: { x: 0.1, y: 0.9 }, zoom: 1 },
  };

  it('shows for admins on pending events with Instagram enabled, using the chosen image', () => {
    render(<AdminInstagramPreview event={base} isAdmin />);
    const imgs = document.querySelectorAll('img');
    expect(imgs[0]).toHaveAttribute('src', 'https://x/ig.jpg');
    expect(imgs[0]).toHaveStyle({ objectPosition: '10% 90%' });
  });

  it('shows the organizer name in the single-post preview', () => {
    render(
      <AdminInstagramPreview
        event={{ ...base, organizer: { firstName: 'Anna', lastName: 'Muster' } }}
        isAdmin
      />
    );
    fireEvent.click(screen.getByTestId('instagram-preview-mode-post'));
    expect(screen.getByTestId('instagram-preview-post-overlay')).toHaveTextContent('Anna Muster');
  });

  it('falls back to the cover photo when no Instagram image is stored', () => {
    render(<AdminInstagramPreview event={{ ...base, instagramImage: null }} isAdmin />);
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://x/cover.jpg');
  });

  it.each([
    ['not an admin', { isAdmin: false, event: base }],
    ['approved', { isAdmin: true, event: { ...base, status: 'approved' } }],
    ['Instagram disabled', { isAdmin: true, event: { ...base, instagramConsent: false } }],
  ])('renders nothing when %s', (_name, props) => {
    const { container } = render(<AdminInstagramPreview {...props} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AdminInstagramPreview crop editing', () => {
  const base = {
    ...event,
    id: 'ev1',
    status: 'pending',
    instagramConsent: true,
    imageUrl: 'https://x/cover.jpg',
    instagramImage: { url: 'https://x/ig.jpg', focalPoint: { x: 0.1, y: 0.9 }, zoom: 1 },
  };

  beforeEach(() => updateDocMock.mockReset());

  it('saves the adjusted zoom to the event and reports it', async () => {
    updateDocMock.mockResolvedValue(undefined);
    const onCropSaved = vi.fn();
    render(<AdminInstagramPreview event={base} isAdmin onCropSaved={onCropSaved} />);
    fireEvent.click(screen.getByTestId('admin-instagram-crop-edit'));
    fireEvent.change(screen.getByTestId('admin-instagram-zoom'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('admin-instagram-crop-save'));
    await vi.waitFor(() => expect(onCropSaved).toHaveBeenCalled());
    expect(updateDocMock.mock.calls[0][1]).toEqual({
      instagramImage: { url: 'https://x/ig.jpg', focalPoint: { x: 0.1, y: 0.9 }, zoom: 2 },
    });
    expect(screen.getByTestId('instagram-post-preview')).toBeInTheDocument();
  });

  it('shows an error and stays in the editor when saving fails', async () => {
    // A synchronous throw inside the save's try block; a rejected mock promise
    // would trip vitest's unhandled-rejection tracking even though it is caught.
    docMock.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    render(<AdminInstagramPreview event={base} isAdmin />);
    fireEvent.click(screen.getByTestId('admin-instagram-crop-edit'));
    fireEvent.click(screen.getByTestId('admin-instagram-crop-save'));
    expect(await screen.findByTestId('admin-instagram-crop-error')).toBeInTheDocument();
    expect(screen.getByTestId('instagram-crop-editor')).toBeInTheDocument();
  });

  it('cancel returns to the preview without saving', () => {
    render(<AdminInstagramPreview event={base} isAdmin />);
    fireEvent.click(screen.getByTestId('admin-instagram-crop-edit'));
    fireEvent.click(screen.getByTestId('admin-instagram-crop-cancel'));
    expect(screen.getByTestId('instagram-post-preview')).toBeInTheDocument();
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('drags the Instagram preview (portrait photo) and saves the new focal point', async () => {
    updateDocMock.mockResolvedValue(undefined);
    render(<AdminInstagramPreview event={base} isAdmin />);
    fireEvent.click(screen.getByTestId('admin-instagram-crop-edit'));
    // 160x200 (4:5) frame, 800x1600 portrait photo: covered 160x320 -> 120px vertical play.
    const frame = screen.getByTestId('admin-instagram-viewport-frame');
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      width: 160,
      height: 200,
      left: 0,
      top: 0,
      right: 160,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const img = screen.getByTestId('admin-instagram-viewport-image');
    Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 1600, configurable: true });
    fireEvent.load(img);
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 80, clientY: 100, button: 0 });
    // Dragging 60px down shows more of the top: y moves by -0.5, 0.9 -> 0.4.
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 80, clientY: 160 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    expect(screen.getByTestId('admin-instagram-crop-unsaved')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-instagram-crop-save'));
    await vi.waitFor(() => expect(updateDocMock).toHaveBeenCalled());
    const saved = updateDocMock.mock.calls[0][1].instagramImage;
    expect(saved.focalPoint.x).toBe(0.1);
    expect(saved.focalPoint.y).toBeCloseTo(0.4, 5);
    expect(saved.zoom).toBe(1);
  });

  it('keeps the text overlay inside the draggable preview', () => {
    render(<AdminInstagramPreview event={base} isAdmin />);
    fireEvent.click(screen.getByTestId('admin-instagram-crop-edit'));
    expect(
      screen
        .getByTestId('admin-instagram-viewport-frame')
        .querySelector('[data-testid="instagram-preview-overlay"]')
    ).not.toBeNull();
  });
});
