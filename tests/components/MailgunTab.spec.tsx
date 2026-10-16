import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MailgunTab from '../../src/components/MailgunTab';

const state = vi.hoisted(() => ({
  report: null as Record<string, unknown> | null,
  loading: false,
  error: null as { message: string } | null,
  reload: vi.fn(),
  days: [] as number[],
}));

vi.mock('../../src/hooks/useAdminMailgunUsage', () => ({
  useAdminMailgunUsage: (days: number) => {
    state.days.push(days);
    return {
      report: state.report,
      loading: state.loading,
      error: state.error,
      reload: state.reload,
    };
  },
}));

const report = (month: Record<string, unknown>) => ({
  rangeDays: 7,
  generatedAt: '2026-10-16T10:00:00.000Z',
  totals: { sent: 1234, delivered: 1200, failed: 3 },
  daily: [
    { date: '2026-10-15', sent: 10 },
    { date: '2026-10-16', sent: 20 },
  ],
  month,
});

describe('MailgunTab', () => {
  beforeEach(() => {
    state.report = null;
    state.loading = false;
    state.error = null;
    state.reload = vi.fn();
    state.days = [];
  });

  it('shows the quota with percentage and bar when a limit is known', () => {
    state.report = report({ sent: 420, limit: 1000, limitSource: 'config' });
    render(<MailgunTab />);
    expect(screen.getByTestId('mailgun-quota')).toHaveTextContent('420 von 1.000 E-Mails (42 %)');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('caps the bar at 100 % when the limit is exceeded', () => {
    state.report = report({ sent: 1500, limit: 1000, limitSource: 'mailgun' });
    render(<MailgunTab />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('shows only the count when no limit is known', () => {
    state.report = report({ sent: 420, limit: null, limitSource: null });
    render(<MailgunTab />);
    expect(screen.getByTestId('mailgun-quota')).toHaveTextContent('420 E-Mails seit Monatsbeginn');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows the totals', () => {
    state.report = report({ sent: 1, limit: null, limitSource: null });
    render(<MailgunTab />);
    const kpis = screen.getAllByTestId('mailgun-kpi').map((k) => k.textContent);
    expect(kpis).toEqual(['1.234Verschickt', '1.200Zugestellt', '3Fehlgeschlagen']);
  });

  it('switches the range and reloads on demand', () => {
    render(<MailgunTab />);
    fireEvent.click(screen.getByTestId('mailgun-range-30'));
    expect(state.days.at(-1)).toBe(30);
    fireEvent.click(screen.getByTestId('mailgun-reload'));
    expect(state.reload).toHaveBeenCalledTimes(1);
  });

  it('shows the error without the Firebase error prefix', () => {
    state.error = {
      message: 'functions/internal: Die E-Mail-Statistik konnte nicht geladen werden.',
    };
    render(<MailgunTab />);
    expect(screen.getByTestId('mailgun-error')).toHaveTextContent(
      'Die E-Mail-Statistik konnte nicht geladen werden.'
    );
  });
});
