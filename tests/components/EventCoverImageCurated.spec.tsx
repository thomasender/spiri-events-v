import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EventCoverImage from '../../src/components/EventCoverImage';

// Imported events without the organizer's consent show the picture on the organizer's own page to
// staff (a link, no referrer); once the organizer consented or a picture of ours exists it is not used.
const base = { title: 'Kirtan', curation: { sourceImageUrl: 'https://org.example/pic.jpg' } };

describe('EventCoverImage: source picture of an imported event', () => {
  it("uses the organizer's picture (no referrer) while no consent exists", () => {
    render(<EventCoverImage event={base} fallbackSrc="/fallback.jpg" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://org.example/pic.jpg');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('never after consent: then only our own picture or the category fallback', () => {
    const consented = { ...base, curation: { ...base.curation, consentAt: new Date() } };
    render(<EventCoverImage event={consented} fallbackSrc="/fallback.jpg" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/fallback.jpg');
  });

  it('our own picture wins, a normal event is untouched', () => {
    render(
      <EventCoverImage event={{ ...base, imageUrl: 'https://ours/x.jpg' }} fallbackSrc="/f.jpg" />
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://ours/x.jpg');
    expect(screen.getByRole('img')).not.toHaveAttribute('referrerpolicy');
  });

  it("falls back to the category picture when the organizer's picture does not load", () => {
    render(<EventCoverImage event={base} fallbackSrc="/fallback.jpg" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).toHaveAttribute('src', '/fallback.jpg');
  });
});
