import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DonorsTab from '../../src/components/DonorsTab';
import { STATIC_REGIONS } from '../../src/utils/regions';
import { getStaffAccess } from '../../src/utils/staffRoles';

const mockDonors = vi.hoisted(() => ({
  donors: [],
  loading: false,
  error: null,
  isAdmin: true,
  regionIdArg: null as string | null,
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
  useDonors: (regionId: string) => {
    mockDonors.regionIdArg = regionId;
    return mockDonors;
  },
}));

const mockStaff = vi.hoisted(() => ({ role: 'Admin', regionIds: [] as string[] }));

vi.mock('../../src/hooks/useStaffRole', () => ({
  useStaffRole: () => getStaffAccess(mockStaff.role, mockStaff.regionIds),
}));

vi.mock('../../src/hooks/useRegions', () => ({
  useRegions: () => ({ regions: STATIC_REGIONS, loading: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockDonors.donors = [];
  mockDonors.loading = false;
  mockDonors.error = null;
  mockDonors.isAdmin = true;
  mockDonors.regionIdArg = null;
  mockStaff.role = 'Admin';
  mockStaff.regionIds = [];
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
        regionId: 'vorarlberg',
        name: 'Carla',
        amount: '12,50',
        frequency: 'monthly',
        note: null,
        comment: null,
      });
    });
  });

  it('lets the admin clear the public comment of a donor', async () => {
    mockDonors.donors = [{ ...SEED[0], comment: 'Weiter so!' }];
    render(<DonorsTab />);
    fireEvent.click(screen.getAllByTestId('donor-row-edit')[0]);
    const comment = screen.getByTestId('donor-edit-comment');
    expect(comment).toHaveValue('Weiter so!');
    fireEvent.change(comment, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('donor-edit-save'));
    await waitFor(() => {
      expect(mockDonors.updateDonor).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ name: 'Anna Müller', comment: null })
      );
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

describe('DonorsTab regions', () => {
  it('a Super-Admin picks the region; the list and new donors follow it', async () => {
    render(<DonorsTab />);
    expect(mockDonors.regionIdArg).toBe('vorarlberg');
    const select = screen.getByTestId('donors-tab-region') as HTMLSelectElement;
    expect(select.options).toHaveLength(STATIC_REGIONS.length);
    fireEvent.change(select, { target: { value: 'tirol' } });
    expect(mockDonors.regionIdArg).toBe('tirol');

    fireEvent.click(screen.getByTestId('donors-tab-add'));
    expect(screen.getByTestId('donor-edit-region')).toHaveValue('tirol');
    fireEvent.click(screen.getByTestId('donor-edit-save'));
    await waitFor(() => {
      expect(mockDonors.addDonor).toHaveBeenCalledWith(
        expect.objectContaining({ regionId: 'tirol' })
      );
    });
  });

  it('moves a donor to another region from the dialog; old donors count as Vorarlberg', async () => {
    mockDonors.donors = SEED;
    render(<DonorsTab />);
    fireEvent.click(screen.getAllByTestId('donor-row-edit')[0]);
    const region = screen.getByTestId('donor-edit-region');
    expect(region).toHaveValue('vorarlberg');
    fireEvent.change(region, { target: { value: 'wien' } });
    fireEvent.click(screen.getByTestId('donor-edit-save'));
    await waitFor(() => {
      expect(mockDonors.updateDonor).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ regionId: 'wien', name: 'Anna Müller' })
      );
    });
  });
});
