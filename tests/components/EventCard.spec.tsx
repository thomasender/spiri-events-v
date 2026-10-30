import { EVENTS } from '../../src/lib/analytics';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventCard from '../../src/components/EventCard';

const clubMembers = vi.hoisted(() => ({ uids: new Set<string>() }));
vi.mock('../../src/hooks/useClubMembers', () => ({
  useClubMembers: () => clubMembers.uids,
  useIsClubMember: (uid: string) => clubMembers.uids.has(uid),
}));

const renderCard = (event) =>
  render(
    <MemoryRouter>
      <EventCard event={event} categoryColor="#abc" onClick={() => {}} />
    </MemoryRouter>
  );

const baseEvent = {
  id: 'evt-1',
  slug: 'sample-event',
  title: 'Sample Event',
  date: '2026-09-15',
  time: '18:00',
  bezirk: 'Bregenz',
  category: 'Yoga',
  organizer: { name: 'Anna Schmidt' },
};

describe('EventCard', () => {
  it('shows the initial-letter avatar when organizer has no photoURL', () => {
    renderCard({ ...baseEvent, organizer: { name: 'Anna Schmidt' } });
    expect(screen.queryByTestId('event-tile-organizer-photo')).toBeNull();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Anna Schmidt')).toBeInTheDocument();
  });

  it('renders the organizer profile photo when organizer has photoURL', () => {
    renderCard({
      ...baseEvent,
      organizer: {
        name: 'Anna Schmidt',
        photoURL: 'https://example.com/anna.png',
      },
    });
    const photo = screen.getByTestId('event-tile-organizer-photo');
    expect(photo).toBeInTheDocument();
    expect(photo.tagName).toBe('IMG');
    expect(photo).toHaveAttribute('src', 'https://example.com/anna.png');
    expect(screen.queryByText('A')).toBeNull();
  });

  it('does not wrap the organizer photo in its own profile link', () => {
    renderCard({
      ...baseEvent,
      organizer: {
        name: 'Anna Schmidt',
        photoURL: 'https://example.com/anna.png',
      },
    });
    const photo = screen.getByTestId('event-tile-organizer-photo');
    expect(photo.parentElement?.tagName).not.toBe('A');
  });

  it('loads the cover image lazily', () => {
    const { container } = renderCard({ ...baseEvent, imageUrl: 'https://example.com/cover.jpg' });
    const cover = container.querySelector('img.event-tile-image');
    expect(cover).toHaveAttribute('loading', 'lazy');
    expect(cover).toHaveAttribute('decoding', 'async');
  });
});

describe('EventCard Vereinsmitglied badge', () => {
  it('marks the organiser by the live member list (createdBy), not by the event copy', () => {
    clubMembers.uids = new Set(['org-1']);
    const { unmount } = renderCard({
      ...baseEvent,
      createdBy: 'org-1',
      organizer: { name: 'Anna Schmidt', photoURL: 'https://x/a.jpg' },
    });
    expect(screen.getByTestId('member-badge')).toBeInTheDocument();
    unmount();
    renderCard({ ...baseEvent, createdBy: 'org-2', organizer: { name: 'Anna', clubMember: true } });
    expect(screen.queryByTestId('member-badge')).toBeNull();
    clubMembers.uids = new Set();
  });
});

describe('EventCard cover thumbnail', () => {
  const withThumb = {
    ...baseEvent,
    imageUrl: 'https://example.com/full.jpg',
    imageThumbUrl: 'https://example.com/thumb.webp',
  };

  it('loads the small thumbnail instead of the full image', () => {
    const { container } = renderCard(withThumb);
    expect(container.querySelector('img.event-tile-image')).toHaveAttribute(
      'src',
      'https://example.com/thumb.webp'
    );
  });

  it('uses the full image for events without a thumbnail (older uploads)', () => {
    const { container } = renderCard({ ...withThumb, imageThumbUrl: undefined });
    expect(container.querySelector('img.event-tile-image')).toHaveAttribute(
      'src',
      'https://example.com/full.jpg'
    );
  });

  it('falls back thumbnail -> full image -> generic fallback when loading fails', () => {
    const { container } = renderCard(withThumb);
    const img = () => container.querySelector('img.event-tile-image') as HTMLImageElement;
    fireEvent.error(img());
    expect(img()).toHaveAttribute('src', 'https://example.com/full.jpg');
    fireEvent.error(img());
    expect(img().getAttribute('src')).not.toMatch(/example\.com/);
  });
});

const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/analytics')>()),
  trackEvent: track,
}));

describe('EventCard analytics', () => {
  it('reports select_content with slug and category when opened', () => {
    track.mockClear();
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <EventCard event={baseEvent} categoryColor="#abc" onClick={onClick} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('link'));
    expect(track).toHaveBeenCalledWith(EVENTS.SELECT_CONTENT, {
      content_type: 'event',
      item_id: 'sample-event',
      category: 'Yoga',
    });
    expect(onClick).toHaveBeenCalled();
  });
});

describe('EventCard — cancelled ("Abgesagt")', () => {
  it('labels a cancelled date of a series', () => {
    renderCard({ ...baseEvent, cancelledDates: ['2026-09-15'] });
    expect(screen.getByTestId('cancelled-badge')).toHaveTextContent('Abgesagt');
  });

  it('does not label other dates of the same series', () => {
    renderCard({ ...baseEvent, cancelledDates: ['2026-09-22'] });
    expect(screen.queryByTestId('cancelled-badge')).toBeNull();
  });

  it('labels every entry of a whole cancelled event', () => {
    renderCard({ ...baseEvent, cancelled: true });
    expect(screen.getByTestId('cancelled-badge')).toBeInTheDocument();
  });
});

describe('EventCard location (kgYQqmUo)', () => {
  it('shows only the Ort, not the Bezirk', () => {
    renderCard({ ...baseEvent, city: 'Hard', bezirk: 'Bregenz' });
    expect(screen.getByText('Hard')).toBeInTheDocument();
    expect(screen.queryByText(/Bez\./)).toBeNull();
  });

  it('falls back to the Bezirk for older events without an Ort', () => {
    renderCard({ ...baseEvent, city: undefined, bezirk: 'Grenznahe' });
    expect(screen.getByText('Umgebung')).toBeInTheDocument();
  });

  it('shows the Kerzenraum candle with an explanation only when there is news', () => {
    const { unmount } = renderCard(baseEvent);
    expect(screen.queryByTestId('candle-badge')).toBeNull();
    unmount();
    render(
      <MemoryRouter>
        <EventCard event={baseEvent} categoryColor="#abc" candleNews />
      </MemoryRouter>
    );
    const badge = screen.getByTestId('candle-badge');
    expect(badge).toHaveAccessibleName('Neue Nachrichten im Event Chat');
    expect(badge.getAttribute('data-tooltip')).toMatch(/Mitfahrgelegenheiten/);
  });

  it('keeps the grey pin text and shows no district badge', () => {
    renderCard({ ...baseEvent, city: 'Lochau' });
    expect(screen.queryByTestId('district-badge')).toBeNull();
    expect(screen.getByText('Lochau')).toBeInTheDocument();
  });
});
