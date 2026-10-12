import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InstagramPostPreview, {
  AdminInstagramPreview,
  formatPreviewDate,
} from '../../src/components/InstagramPostPreview';

const event = {
  title: 'Morgen-Yoga',
  category: 'Yoga',
  date: '2026-10-12',
  time: '09:00',
  place: 'Dornbirn',
};

describe('InstagramPostPreview', () => {
  it('renders nothing without an image', () => {
    const { container } = render(<InstagramPostPreview imageUrl="" event={event} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed until toggled, then shows feed and carousel tiles with the event text', () => {
    render(
      <InstagramPostPreview
        imageUrl="blob:x"
        focalPoint={{ x: 0.2, y: 0.8 }}
        zoom={2}
        event={event}
      />
    );
    expect(screen.queryByTestId('instagram-preview-overlay')).toBeNull();
    fireEvent.click(screen.getByTestId('instagram-post-preview-toggle'));
    const overlay = screen.getByTestId('instagram-preview-overlay');
    expect(overlay).toHaveTextContent('Morgen-Yoga');
    expect(overlay).toHaveTextContent('12.10.2026');
    expect(overlay).toHaveTextContent('Dornbirn');
    const imgs = document.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveStyle({ objectPosition: '20% 80%' });
    fireEvent.click(screen.getByTestId('instagram-post-preview-toggle'));
    expect(screen.queryByTestId('instagram-preview-overlay')).toBeNull();
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
    fireEvent.click(screen.getByTestId('instagram-post-preview-toggle'));
    const imgs = document.querySelectorAll('img');
    expect(imgs[0]).toHaveAttribute('src', 'https://x/ig.jpg');
    expect(imgs[0]).toHaveStyle({ objectPosition: '10% 90%' });
  });

  it('falls back to the cover photo when no Instagram image is stored', () => {
    render(<AdminInstagramPreview event={{ ...base, instagramImage: null }} isAdmin />);
    fireEvent.click(screen.getByTestId('instagram-post-preview-toggle'));
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
