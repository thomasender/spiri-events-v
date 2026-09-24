import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DonorsTab from '../../src/components/DonorsTab';

const mockDonors = vi.hoisted(() => ({
  donors: [],
  loading: false,
  error: null,
  isAdmin: true,
  addDonor: vi.fn(),
  updateDonor: vi.fn(),
  deleteDonor: vi.fn(),
  reorderDonors: vi.fn(async (orderedIds) => {
    const map = new Map(mockDonors.donors.map((d) => [d.id, d]));
    mockDonors.donors = orderedIds
      .map((id, index) => {
        const d = map.get(id);
        return d ? { ...d, order: index * 100 } : null;
      })
      .filter(Boolean);
  }),
}));

vi.mock('../../src/hooks/useDonors', () => ({
  useDonors: () => mockDonors,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockDonors.donors = [];
  mockDonors.loading = false;
  mockDonors.error = null;
  mockDonors.isAdmin = true;
});

const SEED = [
  { id: 'd1', name: 'Anna Müller', amount: 25, frequency: 'one-time', createdBy: 'admin' },
  { id: 'd2', name: null, amount: 10, frequency: 'monthly', createdBy: 'admin' },
];

describe('DonorsTab', () => {
  it('shows a loading spinner while the registry loads', () => {
    mockDonors.loading = true;
    render(<DonorsTab />);
    expect(screen.getByTestId('donors-tab-loading')).toBeInTheDocument();
  });

  it('shows an error message when the registry fails', () => {
    mockDonors.error = 'Netzwerk kaputt';
    render(<DonorsTab />);
    expect(screen.getByTestId('donors-tab-error')).toHaveTextContent('Netzwerk kaputt');
  });

  it('shows an empty state when there are no donors', () => {
    render(<DonorsTab />);
    expect(screen.getByTestId('donors-tab-empty')).toBeInTheDocument();
  });

  it('lists donors with their amount and frequency', () => {
    mockDonors.donors = SEED;
    render(<DonorsTab />);
    const rows = screen.getAllByTestId('donor-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Anna Müller');
    expect(rows[1]).toHaveTextContent('Anonym');
    expect(screen.getByTestId('donor-row-anonymous-tag')).toBeInTheDocument();
  });

  it('opens the edit dialog and defaults to anonymous for new entries', () => {
    render(<DonorsTab />);
    fireEvent.click(screen.getByTestId('donors-tab-add'));
    const dialog = screen.getByTestId('donor-edit-dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('donor-edit-anonymous')).toBeChecked();
    expect(screen.getByTestId('donor-edit-name')).toBeDisabled();
  });

  it('seeds the form when editing an existing donor', () => {
    mockDonors.donors = SEED;
    render(<DonorsTab />);
    fireEvent.click(screen.getAllByTestId('donor-row-edit')[0]);
    expect(screen.getByTestId('donor-edit-anonymous')).not.toBeChecked();
    expect(screen.getByTestId('donor-edit-name')).toHaveValue('Anna Müller');
    expect(screen.getByTestId('donor-edit-amount')).toHaveValue('25');
    expect(screen.getByTestId('donor-edit-frequency-one-time')).toBeChecked();
  });

  it('calls addDonor with parsed values for a new donor', async () => {
    render(<DonorsTab />);
    fireEvent.click(screen.getByTestId('donors-tab-add'));
    fireEvent.click(screen.getByTestId('donor-edit-anonymous')); // opt-in to name
    fireEvent.change(screen.getByTestId('donor-edit-name'), {
      target: { value: 'Carla' },
    });
    fireEvent.change(screen.getByTestId('donor-edit-amount'), {
      target: { value: '12,50' },
    });
    fireEvent.click(screen.getByTestId('donor-edit-frequency-monthly'));
    fireEvent.click(screen.getByTestId('donor-edit-save'));

    await waitFor(() => {
      expect(mockDonors.addDonor).toHaveBeenCalledWith({
        name: 'Carla',
        amount: '12,50',
        frequency: 'monthly',
        note: null,
      });
    });
  });

  it('calls deleteDonor after confirmation', async () => {
    mockDonors.donors = SEED;
    render(<DonorsTab />);
    fireEvent.click(screen.getAllByTestId('donor-row-delete')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => {
      expect(mockDonors.deleteDonor).toHaveBeenCalledWith('d1');
    });
  });

  it('propagates the save error back into the dialog', async () => {
    mockDonors.addDonor.mockRejectedValueOnce(new Error('Betrag ungültig.'));
    render(<DonorsTab />);
    fireEvent.click(screen.getByTestId('donors-tab-add'));
    fireEvent.click(screen.getByTestId('donor-edit-save'));
    await waitFor(() => {
      expect(screen.getByTestId('donor-edit-error')).toHaveTextContent('Betrag ungültig.');
    });
  });
});
