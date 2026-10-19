import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import AnalyticsTab, { formatDuration, formatPercent } from '../../src/components/AnalyticsTab';

const state = vi.hoisted(() => ({
  report: null as Record<string, unknown> | null,
  loading: false,
  error: null as { message: string } | null,
  reload: vi.fn(),
  days: [] as number[],
}));

vi.mock('../../src/hooks/useAdminAnalytics', () => ({
  useAdminAnalytics: (days: number) => {
    state.days.push(days);
    return {
      report: state.report,
      loading: state.loading,
      error: state.error,
      reload: state.reload,
    };
  },
}));

const report = {
  rangeDays: 7,
  generatedAt: '2026-10-12T10:00:00.000Z',
  totals: { users: 1234, newUsers: 300, sessions: 2000, pageViews: 5678 },
  daily: [
    { date: '2026-10-11', users: 5, pageViews: 10 },
    { date: '2026-10-12', users: 7, pageViews: 20 },
  ],
  pages: [{ title: 'Morgen Yoga', views: 12 }],
  channels: [
    { name: 'Organic Social', sessions: 6 },
    { name: 'Weird New Channel', sessions: 1 },
  ],
  devices: [{ name: 'mobile', users: 4 }],
  actions: [
    { event: 'favorite_add', count: 3 },
    { event: 'share', count: 0 },
  ],
  topEvents: {
    rangeDays: 14,
    generatedAt: '2026-10-19T10:00:00.000Z',
    actionsSince: '2026-10-19',
    events: [
      {
        slug: 'yoga-im-park',
        title: 'Yoga im Park',
        views: 40,
        users: 25,
        avgEngagementSec: 75,
        organizerClicks: 10,
        favorites: 3,
        shares: 2,
        calendarAdds: 1,
        newUsers: 20,
        returningUsers: 5,
        sources: [{ label: 'Instagram', count: 30 }],
        referrers: [{ label: 'Verzeichnis', count: 12 }],
        cities: [{ label: 'Dornbirn', count: 9 }],
        devices: [{ label: 'mobile', count: 20 }],
      },
      {
        slug: 'kakao',
        title: 'Kakaozeremonie',
        views: 8,
        users: 6,
        avgEngagementSec: 30,
        organizerClicks: 0,
        favorites: 0,
        shares: 0,
        calendarAdds: 0,
        newUsers: 6,
        returningUsers: 0,
        sources: [],
        referrers: [],
        cities: [],
        devices: [],
      },
    ],
  },
};

describe('AnalyticsTab', () => {
  beforeEach(() => {
    state.report = report;
    state.loading = false;
    state.error = null;
    state.reload = vi.fn();
    state.days = [];
  });

  it('shows the totals with German number formatting', () => {
    render(<AnalyticsTab />);
    const kpis = screen.getAllByTestId('analytics-kpi').map((k) => k.textContent);
    expect(kpis[0]).toContain('1.234');
    expect(kpis[0]).toContain('Besucher:innen');
    expect(kpis[3]).toContain('5.678');
  });

  it('translates channels, devices and actions and keeps unknown channel names', () => {
    render(<AnalyticsTab />);
    expect(screen.getByText('Social Media (organisch)')).toBeInTheDocument();
    expect(screen.getByText('Weird New Channel')).toBeInTheDocument();
    const devicesCard = screen.getByRole('heading', { level: 2, name: 'Geräte' }).parentElement!;
    expect(within(devicesCard).getByText('Handy')).toBeInTheDocument();
    expect(screen.getByText('Favorit gesetzt')).toBeInTheDocument();
    expect(screen.getByText('Morgen Yoga')).toBeInTheDocument();
  });

  it('draws one bar per day of the report', () => {
    render(<AnalyticsTab />);
    const chart = screen.getByTestId('analytics-daily');
    expect(within(chart).getByText('11.10.')).toBeInTheDocument();
    expect(within(chart).getByText('12.10.')).toBeInTheDocument();
  });

  it('switches the range and asks the hook for 30 days', () => {
    render(<AnalyticsTab />);
    expect(screen.getByTestId('analytics-range-7')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('analytics-range-30'));
    expect(screen.getByTestId('analytics-range-30')).toHaveAttribute('aria-pressed', 'true');
    expect(state.days.at(-1)).toBe(30);
  });

  it('reloads on demand and disables the button while loading', () => {
    const { rerender } = render(<AnalyticsTab />);
    fireEvent.click(screen.getByTestId('analytics-reload'));
    expect(state.reload).toHaveBeenCalledTimes(1);
    state.loading = true;
    rerender(<AnalyticsTab />);
    expect(screen.getByTestId('analytics-reload')).toBeDisabled();
  });

  it('shows the server message without the error code prefix', () => {
    state.report = null;
    state.error = { message: 'functions/failed-precondition: Kein Zugriff auf Google Analytics.' };
    render(<AnalyticsTab />);
    expect(screen.getByTestId('analytics-error')).toHaveTextContent(
      'Kein Zugriff auf Google Analytics.'
    );
    expect(screen.getByTestId('analytics-error')).not.toHaveTextContent('functions/');
  });

  it('shows a loading hint before the first report and says the numbers are a lower bound', () => {
    state.report = null;
    state.loading = true;
    render(<AnalyticsTab />);
    expect(screen.getByText('Lade Statistik …')).toBeInTheDocument();
    expect(screen.getByText(/nur Besucher:innen gezählt/)).toBeInTheDocument();
  });

  it('lists the top events ranked, with details per event', () => {
    render(<AnalyticsTab />);
    const items = screen.getAllByTestId('analytics-top-event');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('1.');
    expect(items[0]).toHaveTextContent('Yoga im Park');
    expect(items[0]).toHaveTextContent('40 Aufrufe');
    const first = within(items[0]);
    expect(first.getByText('1:15 Min')).toBeInTheDocument();
    expect(first.getByText('25 % der Aufrufe · gezählt seit 19.10.2026')).toBeInTheDocument();
    expect(first.getByText('Instagram')).toBeInTheDocument();
    expect(first.getByText('Verzeichnis')).toBeInTheDocument();
    expect(first.getByText('Dornbirn')).toBeInTheDocument();
    expect(first.getByText('Handy')).toBeInTheDocument();
    expect(first.getByRole('link', { name: /Event-Seite öffnen/ })).toHaveAttribute(
      'href',
      '/event/yoga-im-park'
    );
    expect(within(items[1]).getAllByText('Noch keine Daten.')).toHaveLength(4);
  });

  it('says honestly when there is no event data or it could not be loaded', () => {
    state.report = { ...report, topEvents: { ...report.topEvents, events: [] } };
    const { rerender } = render(<AnalyticsTab />);
    expect(
      screen.getByText('Noch keine Daten zu Event-Seiten in den letzten 14 Tagen.')
    ).toBeInTheDocument();
    state.report = { ...report, topEvents: null };
    rerender(<AnalyticsTab />);
    expect(screen.getByTestId('analytics-top-events-error')).toBeInTheDocument();
  });

  it('formats durations and percentages', () => {
    expect(formatDuration(42)).toBe('42 Sek');
    expect(formatDuration(75)).toBe('1:15 Min');
    expect(formatDuration(undefined)).toBe('0 Sek');
    expect(formatPercent(1, 3)).toBe('33 %');
    expect(formatPercent(1, 0)).toBe('0 %');
  });

  it('renders empty lists without crashing', () => {
    state.report = {
      ...report,
      pages: [],
      channels: [],
      devices: [],
      actions: [],
      topEvents: { ...report.topEvents, events: [] },
    };
    render(<AnalyticsTab />);
    expect(screen.getAllByText('Noch keine Daten.')).toHaveLength(4);
  });
});
