import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ docs: [] as { id: string; data: () => object }[] }));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  where: () => ({}),
  limit: () => ({}),
  query: () => ({}),
  getDocs: () => Promise.resolve({ docs: mocks.docs }),
}));

import FeaturedEventTeaser from '../../src/components/FeaturedEventTeaser';
import {
  FEATURED_EVENT_TEASER,
  featuredEventTeaserFor,
} from '../../src/config/featuredEventTeaser';

const baseEvent = {
  title: 'Wild Spirit Dance',
  slug: FEATURED_EVENT_TEASER.slug,
  status: 'approved',
  date: '2026-11-27',
  city: 'Argenbühl',
  imageUrl: 'https://example.test/cover.jpg',
};

function setEvent(over: object | null) {
  mocks.docs = over ? [{ id: 'e1', data: () => ({ ...baseEvent, ...over }) }] : [];
}

function renderTeaser(regionId: string) {
  return render(
    <MemoryRouter>
      <FeaturedEventTeaser regionId={regionId} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 24, 12, 0) });
});
afterEach(() => vi.useRealTimers());

describe('FeaturedEventTeaser', () => {
  it('shows the teaser for Bodensee with an upcoming approved event', async () => {
    setEvent({});
    renderTeaser('bodensee');
    const link = await screen.findByTestId('featured-event-link');
    expect(link.getAttribute('href')).toBe(`/event/${FEATURED_EVENT_TEASER.slug}`);
    expect(screen.getByText('Eröffnungsfeier')).toBeTruthy();
    expect(screen.getByText('Wild Spirit Dance')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('alt')).toBe('Wild Spirit Dance');
  });

  it('still shows on the event day itself', async () => {
    vi.setSystemTime(new Date(2026, 10, 27, 23, 30));
    setEvent({});
    renderTeaser('bodensee');
    expect(await screen.findByTestId('featured-event-teaser')).toBeTruthy();
  });

  it('renders nothing for another region', async () => {
    setEvent({});
    renderTeaser('tirol');
    await Promise.resolve();
    expect(screen.queryByTestId('featured-event-teaser')).toBeNull();
  });

  it.each([
    ['a past event', { date: '2026-11-20' }],
    ['a not approved event', { status: 'pending' }],
    ['a missing event', null],
  ])('renders nothing for %s', async (_label, over) => {
    setEvent(over);
    renderTeaser('bodensee');
    await waitFor(() => expect(mocks.docs.length).toBe(over ? 1 : 0));
    await Promise.resolve();
    expect(screen.queryByTestId('featured-event-teaser')).toBeNull();
  });

  it('config hides itself after the end date', () => {
    expect(featuredEventTeaserFor('bodensee', new Date(2026, 10, 27, 23, 0))).not.toBeNull();
    expect(featuredEventTeaserFor('bodensee', new Date(2026, 10, 28, 0, 1))).toBeNull();
    expect(featuredEventTeaserFor('vorarlberg', new Date(2026, 10, 24))).toBeNull();
  });
});
