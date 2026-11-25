import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  respond: (() => Promise.resolve({ data: null })) as (
    data: Record<string, unknown>
  ) => Promise<unknown>,
}));

vi.mock('../../src/lib/firebase', () => ({
  callable: (name: string) => (data: Record<string, unknown>) => {
    mocks.calls.push({ name, ...data });
    return mocks.respond(data);
  },
}));

import FunFactsTab from '../../src/components/FunFactsTab';
import { formatSpan, formatShare, peakIndex } from '../../src/utils/funFacts';

const HOUR = 60 * 60 * 1000;

const facts = {
  since: '2026-08-26T07:12:00.000Z',
  clarificationsSince: null,
  computedAt: '2026-11-16T13:05:00.000Z',
  totalEntries: 1270,
  backfillEntries: 1003,
  events: {
    total: 600,
    submitted: 512,
    directPublished: 40,
    published: 480,
    approvedRightAway: 300,
    neededReview: 140,
    neededMoreThanOneReview: 25,
    rejected: 12,
    cancelled: 7,
    unpublished: 9,
  },
  approvalTime: {
    count: 400,
    medianMs: 5 * HOUR,
    averageMs: 26 * HOUR,
    fastest: { eventId: 'a', title: 'Blitz-Yoga', ms: 3 * 60 * 1000 },
    slowest: { eventId: 'b', title: 'Geduldsprobe', ms: 9 * 24 * HOUR },
  },
  champions: [{ name: 'Peter', approvals: 210 }],
  organizers: { distinct: 88, top: [{ name: null, events: 31 }] },
  weekdays: [1, 2, 3, 4, 5, 9, 2],
  months: [0, 0, 0, 0, 0, 0, 0, 0, 4, 8, 12, 3],
  users: 1500,
  favorites: 2345,
};

describe('FunFactsTab', () => {
  beforeEach(() => {
    mocks.calls = [];
    mocks.respond = () => Promise.resolve({ data: facts });
  });

  it('shows the numbers as tiles', async () => {
    render(<FunFactsTab />);
    expect(await screen.findByTestId('funfacts-submitted')).toHaveTextContent('512');
    expect(screen.getByTestId('funfacts-direct')).toHaveTextContent('40');
    expect(screen.getByTestId('funfacts-published')).toHaveTextContent('480');
    expect(screen.getByTestId('funfacts-right-away')).toHaveTextContent('300');
    expect(screen.getByTestId('funfacts-right-away')).toHaveTextContent('68 %');
    expect(screen.getByTestId('funfacts-review-more')).toHaveTextContent('25');
    expect(screen.getByTestId('funfacts-median')).toHaveTextContent('5 Std.');
    expect(screen.getByTestId('funfacts-slowest')).toHaveTextContent('9 Tage');
    expect(screen.getByTestId('funfacts-slowest')).toHaveTextContent('Geduldsprobe');
    expect(screen.getByTestId('funfacts-champions')).toHaveTextContent('Peter');
    expect(screen.getByTestId('funfacts-organizers')).toHaveTextContent('Anonym');
    expect(screen.getByTestId('funfacts-users')).toHaveTextContent('1.500');
    expect(screen.getByText('Beliebtester Tag: Samstag')).toBeInTheDocument();
    expect(screen.getByText('Stärkster Monat: November')).toBeInTheDocument();
    expect(mocks.calls).toEqual([{ name: 'adminFunFacts' }]);
  });

  it('says honestly since when it counts and how much was reconstructed', async () => {
    render(<FunFactsTab />);
    const since = await screen.findByTestId('funfacts-since');
    expect(since).toHaveTextContent('Gezählt seit 26.08.2026');
    expect(since).toHaveTextContent('1.003 von 1.270 Einträgen (79 %)');
    expect(screen.getByTestId('funfacts-review-hint')).toHaveTextContent(
      'Rückfragen werden erst ab jetzt mitgezählt'
    );
    expect(screen.getByTestId('funfacts-computed-at')).toHaveTextContent('16.11.2026, 14:05');
  });

  it('"Aktualisieren" asks the function to recompute', async () => {
    render(<FunFactsTab />);
    await screen.findByTestId('funfacts-submitted');
    fireEvent.click(screen.getByTestId('funfacts-refresh'));
    await waitFor(() => expect(mocks.calls).toHaveLength(2));
    expect(mocks.calls[1]).toEqual({ name: 'adminFunFacts', force: true });
  });

  it('shows an error instead of numbers when the call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.respond = () => Promise.reject({ code: 'functions/internal', message: 'boom' });
    render(<FunFactsTab />);
    expect(await screen.findByTestId('funfacts-error')).toHaveTextContent(
      'Die Fun Facts konnten nicht geladen werden'
    );
    expect(screen.queryByTestId('funfacts-submitted')).not.toBeInTheDocument();
  });
});

describe('fun facts formatting', () => {
  it('formatSpan names the two largest units', () => {
    expect(formatSpan(30 * 1000)).toBe('unter 1 Min.');
    expect(formatSpan(5 * 60 * 1000)).toBe('5 Min.');
    expect(formatSpan(3 * HOUR + 20 * 60 * 1000)).toBe('3 Std. 20 Min.');
    expect(formatSpan(24 * HOUR)).toBe('1 Tag');
    expect(formatSpan(52 * HOUR)).toBe('2 Tage 4 Std.');
    expect(formatSpan(null as unknown as number)).toBe('–');
  });

  it('formatShare and peakIndex', () => {
    expect(formatShare(1, 3)).toBe('33 %');
    expect(formatShare(1, 0)).toBe('');
    expect(peakIndex([0, 2, 2, 1])).toBe(1);
    expect(peakIndex([0, 0])).toBe(-1);
  });
});
