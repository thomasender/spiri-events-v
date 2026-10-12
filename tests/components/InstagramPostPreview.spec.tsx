import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InstagramPostPreview, { formatPreviewDate } from '../../src/components/InstagramPostPreview';

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
