import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DonorsList from '../../src/components/DonorsList';

type Donor = {
  id: string;
  name?: string | null;
  amount?: number | null;
  frequency?: 'one-time' | 'monthly' | null;
  comment?: string | null;
  order?: number;
  createdAt?: { seconds: number } | null;
};

const mockDonors = vi.hoisted(() => ({
  donors: [] as Donor[],
  loading: false,
  error: null as string | null,
}));

vi.mock('../../src/hooks/useDonors', () => ({
  useDonors: () => mockDonors,
}));

beforeEach(() => {
  mockDonors.donors = [];
  mockDonors.loading = false;
  mockDonors.error = null;
});

function donor(i: number, extra: Partial<Donor> = {}): Donor {
  return { id: `d${i}`, name: `Spender ${i}`, amount: 10, createdAt: { seconds: i }, ...extra };
}

function names() {
  return screen
    .getAllByTestId('donors-list-item')
    .map((item) => item.querySelector('.donors-list-name')?.textContent);
}

describe('DonorsList', () => {
  it('shows the newest donations first, ignoring the admin order; entries without date last', () => {
    mockDonors.donors = [
      donor(1, { order: 0 }),
      donor(3, { order: 100 }),
      { id: 'old', name: 'Ohne Datum', order: 50 },
      donor(2, { order: 200 }),
    ];
    render(<DonorsList />);
    expect(names()).toEqual(['Spender 3', 'Spender 2', 'Spender 1', 'Ohne Datum']);
  });

  it('shows 7 entries and loads 7 more per click', () => {
    mockDonors.donors = Array.from({ length: 16 }, (_, i) => donor(i + 1));
    render(<DonorsList />);
    expect(screen.getAllByTestId('donors-list-item')).toHaveLength(7);

    fireEvent.click(screen.getByRole('button', { name: 'Mehr laden' }));
    expect(screen.getAllByTestId('donors-list-item')).toHaveLength(14);

    fireEvent.click(screen.getByRole('button', { name: 'Mehr laden' }));
    expect(screen.getAllByTestId('donors-list-item')).toHaveLength(16);
    expect(screen.queryByRole('button', { name: 'Mehr laden' })).toBeNull();
  });

  it('shows the comment as plain text below a named and an anonymous donor', () => {
    mockDonors.donors = [
      donor(2, { comment: '<b>Danke</b> euch!' }),
      donor(1, { name: null, comment: 'Weiter so' }),
    ];
    render(<DonorsList />);
    const [named, anonymous] = screen.getAllByTestId('donors-list-item');

    expect(named).toHaveTextContent('Spender 2');
    expect(named.querySelector('[data-testid="donors-list-comment"]')).toHaveTextContent(
      '<b>Danke</b> euch!'
    );
    expect(named.querySelector('b')).toBeNull();

    expect(anonymous).toHaveAttribute('data-anonymous', 'true');
    expect(anonymous).toHaveTextContent('Anonyme:r Spender:in');
    expect(anonymous).not.toHaveTextContent('Spender 1');
    expect(anonymous.querySelector('[data-testid="donors-list-comment"]')).toHaveTextContent(
      'Weiter so'
    );
  });
});
