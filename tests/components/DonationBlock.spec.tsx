import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DonationBlock from '../../src/components/DonationBlock';

const startOneTimeDonation = vi.hoisted(() => vi.fn());
const startMonthlyDonation = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/mollieClient', async () => {
  const validation = await import('../../src/lib/donationValidation');
  return {
    MIN_DONATION_AMOUNT: validation.MIN_DONATION_AMOUNT,
    DONATION_AMOUNT_PRESETS: validation.DONATION_AMOUNT_PRESETS,
    isValidDonationAmount: validation.isValidDonationAmount,
    parseDonationAmount: validation.parseDonationAmount,
    startOneTimeDonation: startOneTimeDonation,
    startMonthlyDonation: startMonthlyDonation,
  };
});

describe('DonationBlock', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    startOneTimeDonation.mockReset();
    startMonthlyDonation.mockReset();
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

  function fillAmount(value) {
    fireEvent.change(screen.getByLabelText(/betrag in euro/i), {
      target: { value: String(value) },
    });
  }

  function submit() {
    fireEvent.click(screen.getByRole('button', { name: /spenden$/ }));
  }

  function selectMonthly() {
    fireEvent.click(screen.getByRole('tab', { name: /monatlich/i }));
  }

  function selectOneTime() {
    fireEvent.click(screen.getByRole('tab', { name: /einmalig/i }));
  }

  it('renders the frequency tabs with the one-time tab active by default', () => {
    renderBlock();

    const oneTimeTab = screen.getByRole('tab', { name: /einmalig/i });
    const monthlyTab = screen.getByRole('tab', { name: /monatlich/i });

    expect(oneTimeTab).toHaveAttribute('aria-selected', 'true');
    expect(monthlyTab).toHaveAttribute('aria-selected', 'false');
  });

  it('renders the amount input and preset chips', () => {
    renderBlock();

    const input = screen.getByLabelText(/betrag in euro/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');

    expect(screen.getByRole('button', { name: '5 €' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10 €' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20 €' })).toBeInTheDocument();
  });

  it('renders the optional name input', () => {
    renderBlock();

    const input = screen.getByPlaceholderText(/anna musterfrau/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
  });

  it('clicking a preset chip fills the amount input', () => {
    renderBlock();

    fireEvent.click(screen.getByRole('button', { name: '10 €' }));

    const input = screen.getByLabelText(/betrag in euro/i);
    expect(input).toHaveValue('10');
  });

  it('disables the submit button until a valid amount is entered', () => {
    renderBlock();

    const submit = screen.getByRole('button', { name: /spenden$/ });
    expect(submit).toBeDisabled();

    fillAmount(4);
    expect(submit).toBeDisabled();

    fillAmount(5);
    expect(submit).not.toBeDisabled();
  });

  it('calls startOneTimeDonation with the typed amount and redirects to checkout', async () => {
    startOneTimeDonation.mockResolvedValue({
      checkoutUrl: 'https://www.mollie.com/checkout/one-time',
      paymentId: 'tr_test',
    });

    renderBlock();

    fillAmount(15);
    fireEvent.change(screen.getByPlaceholderText(/anna musterfrau/i), {
      target: { value: '  Anna  ' },
    });
    submit();

    await waitFor(() => {
      expect(startOneTimeDonation).toHaveBeenCalledWith(15, 'Anna');
    });
    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith(
        'https://www.mollie.com/checkout/one-time'
      );
    });
    expect(startMonthlyDonation).not.toHaveBeenCalled();
  });

  it('calls startMonthlyDonation when the monthly tab is selected', async () => {
    startMonthlyDonation.mockResolvedValue({
      checkoutUrl: 'https://www.mollie.com/checkout/monthly',
      customerId: 'cst_test',
      subscriptionId: 'sub_test',
    });

    renderBlock();

    selectMonthly();
    fireEvent.click(screen.getByRole('button', { name: '5 €' }));
    submit();

    await waitFor(() => {
      expect(startMonthlyDonation).toHaveBeenCalledWith(5, null);
    });
    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith(
        'https://www.mollie.com/checkout/monthly'
      );
    });
    expect(startOneTimeDonation).not.toHaveBeenCalled();
  });

  it('accepts comma as decimal separator in the input', async () => {
    startOneTimeDonation.mockResolvedValue({
      checkoutUrl: 'https://www.mollie.com/checkout/one-time',
      paymentId: 'tr_test',
    });

    renderBlock();

    fillAmount('12,50');
    submit();

    await waitFor(() => {
      expect(startOneTimeDonation).toHaveBeenCalledWith(12.5, null);
    });
  });

  it('shows an inline error and re-enables the form when the donation call throws', async () => {
    startOneTimeDonation.mockRejectedValue(new Error('Mollie down'));

    renderBlock();

    fireEvent.click(screen.getByRole('button', { name: '20 €' }));
    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Mollie down');
    });

    expect(screen.getByLabelText(/betrag in euro/i)).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '5 €' })).not.toBeDisabled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('disables the tabs and submit while a checkout is in flight', async () => {
    let resolveCheckout;
    startOneTimeDonation.mockReturnValue(
      new Promise((resolve) => {
        resolveCheckout = resolve;
      })
    );

    renderBlock();

    fireEvent.click(screen.getByRole('button', { name: '10 €' }));
    submit();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weiterleitung/i })).toBeDisabled();
    });
    expect(screen.getByRole('tab', { name: /monatlich/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: '5 €' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '20 €' })).toBeDisabled();

    resolveCheckout({ checkoutUrl: 'https://example.com/checkout' });
  });
});
