import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DonationBlock from '../../src/components/DonationBlock';

const startDonation = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/mollieClient', () => ({
  DONATION_AMOUNTS: [1.9, 6.9, 12.9],
  startDonation: startDonation,
}));

describe('DonationBlock', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    startDonation.mockReset();
    // happy-dom does not implement navigation; replace assign with a spy.
    delete window.location;
    window.location = { ...originalLocation, assign: vi.fn() };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  function renderBlock() {
    return render(
      <MemoryRouter>
        <DonationBlock />
      </MemoryRouter>
    );
  }

  it('renders the three allowed donation amounts in EUR', () => {
    renderBlock();

    expect(screen.getByRole('button', { name: '1,90 € / Monat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6,90 € / Monat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '12,90 € / Monat' })).toBeInTheDocument();
  });

  it('renders the optional name input', () => {
    renderBlock();

    const input = screen.getByPlaceholderText(/anna musterfrau/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
  });

  it('calls startDonation with the amount (no name when empty) and redirects to checkout', async () => {
    startDonation.mockResolvedValue({
      checkoutUrl: 'https://www.mollie.com/checkout/test',
      customerId: 'cst_test',
      subscriptionId: 'sub_test',
    });

    renderBlock();

    fireEvent.click(screen.getByRole('button', { name: '6,90 € / Monat' }));

    await waitFor(() => {
      expect(startDonation).toHaveBeenCalledWith(6.9, null);
    });
    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith('https://www.mollie.com/checkout/test');
    });
  });

  it('passes the typed name to startDonation', async () => {
    startDonation.mockResolvedValue({
      checkoutUrl: 'https://www.mollie.com/checkout/test',
      customerId: 'cst_test',
      subscriptionId: 'sub_test',
    });

    renderBlock();

    fireEvent.change(screen.getByPlaceholderText(/anna musterfrau/i), {
      target: { value: '  Peter Mathis  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '1,90 € / Monat' }));

    await waitFor(() => {
      expect(startDonation).toHaveBeenCalledWith(1.9, 'Peter Mathis');
    });
  });

  it('shows an error and re-enables the buttons when startDonation throws', async () => {
    startDonation.mockRejectedValue(new Error('Mollie down'));

    renderBlock();

    fireEvent.click(screen.getByRole('button', { name: '12,90 € / Monat' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Mollie down');
    });

    expect(screen.getByRole('button', { name: '12,90 € / Monat' })).not.toBeDisabled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('disables all buttons while a checkout is in flight', async () => {
    let resolveCheckout;
    startDonation.mockReturnValue(
      new Promise((resolve) => {
        resolveCheckout = resolve;
      })
    );

    renderBlock();

    fireEvent.click(screen.getByRole('button', { name: '1,90 € / Monat' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weiterleitung/i })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: '6,90 € / Monat' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '12,90 € / Monat' })).toBeDisabled();

    resolveCheckout({ checkoutUrl: 'https://example.com/checkout' });
  });
});
