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
