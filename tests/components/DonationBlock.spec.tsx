import { EVENTS } from '../../src/lib/analytics';
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

  it('renders the frequency tabs with the monthly tab active by default (5dlVbOmf)', () => {
    renderBlock();

    const oneTimeTab = screen.getByRole('tab', { name: /einmalig/i });
    const monthlyTab = screen.getByRole('tab', { name: /monatlich/i });

    expect(monthlyTab).toHaveAttribute('aria-selected', 'true');
    expect(oneTimeTab).toHaveAttribute('aria-selected', 'false');
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

    selectOneTime();
    fillAmount(15);
    fireEvent.change(screen.getByPlaceholderText(/anna musterfrau/i), {
      target: { value: '  Anna  ' },
    });
    submit();

    await waitFor(() => {
      expect(startOneTimeDonation).toHaveBeenCalledWith(15, {
        name: 'Anna',
        displayOnConsent: false,
        comment: null,
        regionId: 'vorarlberg',
      });
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
      expect(startMonthlyDonation).toHaveBeenCalledWith(5, {
        name: null,
        displayOnConsent: false,
        comment: null,
        regionId: 'vorarlberg',
      });
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

    selectOneTime();
    fillAmount('12,50');
    submit();

    await waitFor(() => {
      expect(startOneTimeDonation).toHaveBeenCalledWith(12.5, {
        name: null,
        displayOnConsent: false,
        comment: null,
        regionId: 'vorarlberg',
      });
    });
  });

  it('shows an inline error and re-enables the form when the donation call throws', async () => {
    startOneTimeDonation.mockRejectedValue(
      new Error('Mollie /customers/cst_x/subscriptions failed with 422')
    );

    renderBlock();

    selectOneTime();
    fireEvent.click(screen.getByRole('button', { name: '20 €' }));
    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/konnte gerade nicht gestartet werden/);
      expect(screen.getByRole('alert')).not.toHaveTextContent(/Mollie|422/);
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

    selectOneTime();
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

  it('renders the spendenliste consent checkbox unchecked by default', () => {
    renderBlock();

    const checkbox = screen.getByTestId('donation-consent-checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('submits with displayOnConsent=false when the consent checkbox is left unchecked', async () => {
    startOneTimeDonation.mockResolvedValue({
      checkoutUrl: 'https://www.mollie.com/checkout/one-time',
      paymentId: 'tr_test',
    });

    renderBlock();

    selectOneTime();
    fireEvent.click(screen.getByRole('button', { name: '20 €' }));
    submit();

    await waitFor(() => {
      expect(startOneTimeDonation).toHaveBeenCalledWith(20, {
        name: null,
        displayOnConsent: false,
        comment: null,
        regionId: 'vorarlberg',
      });
    });
  });

  it('submits with displayOnConsent=true and the typed name when the checkbox is ticked', async () => {
    startMonthlyDonation.mockResolvedValue({
      checkoutUrl: 'https://www.mollie.com/checkout/monthly',
      customerId: 'cst_test',
      subscriptionId: 'sub_test',
    });

    renderBlock();

    selectMonthly();
    fireEvent.change(screen.getByPlaceholderText(/anna musterfrau/i), {
      target: { value: 'Anna Musterfrau' },
    });
    fireEvent.click(screen.getByTestId('donation-consent-checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '10 €' }));
    submit();

    await waitFor(() => {
      expect(startMonthlyDonation).toHaveBeenCalledWith(10, {
        name: 'Anna Musterfrau',
        displayOnConsent: true,
        comment: null,
        regionId: 'vorarlberg',
      });
    });
  });

  it('allows the donor list consent with a comment but no name (shown as Anonym)', async () => {
    renderBlock();

    selectOneTime();
    fireEvent.click(screen.getByTestId('donation-consent-checkbox'));
    fireEvent.change(screen.getByTestId('donation-comment'), { target: { value: 'Danke' } });
    fireEvent.click(screen.getByRole('button', { name: '20 €' }));
    submit();

    await waitFor(() => {
      expect(startOneTimeDonation).toHaveBeenCalledWith(
        20,
        expect.objectContaining({ name: null, displayOnConsent: true, comment: 'Danke' })
      );
    });
  });

  it('shows the public comment and its removal hint only with the donor list consent and caps it at 140 characters', () => {
    renderBlock();

    expect(screen.queryByTestId('donation-comment')).not.toBeInTheDocument();
    expect(screen.queryByText(/formlos per E-Mail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kommentar \(öffentlich/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('donation-consent-checkbox'));
    const comment = screen.getByTestId('donation-comment');
    expect(comment).not.toBeDisabled();
    expect(comment).toHaveAttribute('maxlength', '140');
    expect(screen.getByText(/formlos per E-Mail/)).toBeInTheDocument();

    fireEvent.change(comment, { target: { value: 'x'.repeat(200) } });
    expect(comment).toHaveValue('x'.repeat(140));
  });

  it.each([
    ['one-time', selectOneTime, startOneTimeDonation],
    ['monthly', selectMonthly, startMonthlyDonation],
  ])('sends the trimmed comment with a %s donation', async (_label, select, start) => {
    start.mockResolvedValue({ checkoutUrl: 'https://www.mollie.com/checkout/x' });

    renderBlock();

    select();
    fireEvent.change(screen.getByPlaceholderText(/anna musterfrau/i), {
      target: { value: 'Anna' },
    });
    fireEvent.click(screen.getByTestId('donation-consent-checkbox'));
    fireEvent.change(screen.getByTestId('donation-comment'), {
      target: { value: '  Danke für alles!  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '10 €' }));
    submit();

    await waitFor(() => {
      expect(start).toHaveBeenCalledWith(10, {
        name: 'Anna',
        displayOnConsent: true,
        comment: 'Danke für alles!',
        regionId: 'vorarlberg',
      });
    });
  });

  it('sends the region of the page with the donation', async () => {
    startMonthlyDonation.mockResolvedValue({ checkoutUrl: 'https://www.mollie.com/checkout/x' });
    render(
      <MemoryRouter>
        <DonationBlock regionId="tirol" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: '10 €' }));
    submit();
    await waitFor(() => {
      expect(startMonthlyDonation).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ regionId: 'tirol' })
      );
    });
  });

  it('drops a typed comment when the consent is withdrawn before submitting', async () => {
    startOneTimeDonation.mockResolvedValue({ checkoutUrl: 'https://www.mollie.com/checkout/x' });

    renderBlock();

    selectOneTime();
    const consent = screen.getByTestId('donation-consent-checkbox');
    fireEvent.click(consent);
    fireEvent.change(screen.getByTestId('donation-comment'), { target: { value: 'Hallo' } });
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole('button', { name: '10 €' }));
    submit();

    await waitFor(() => {
      expect(startOneTimeDonation).toHaveBeenCalledWith(10, {
        name: null,
        displayOnConsent: false,
        comment: null,
        regionId: 'vorarlberg',
      });
    });
  });
});

const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/analytics')>()),
  trackEvent: track,
}));

describe('DonationBlock analytics', () => {
  it('reports donate_click with placement and frequency on a valid submit', async () => {
    track.mockClear();
    startMonthlyDonation.mockResolvedValue({ checkoutUrl: 'https://mollie.test/checkout' });
    render(
      <MemoryRouter>
        <DonationBlock placement="about_page" />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/betrag in euro/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /monatlich spenden$/ }));
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith(EVENTS.DONATE_CLICK, {
        placement: 'about_page',
        frequency: 'monthly',
      })
    );
  });

  it('does not report when the amount is invalid', () => {
    track.mockClear();
    render(
      <MemoryRouter>
        <DonationBlock placement="about_page" />
      </MemoryRouter>
    );
    fireEvent.submit(screen.getByLabelText(/betrag in euro/i).closest('form')!);
    expect(track).not.toHaveBeenCalled();
  });
});

describe('DonationBlock in Swiss francs', () => {
  it('shows CHF everywhere and no SEPA direct debit for a Swiss region', () => {
    render(
      <MemoryRouter>
        <DonationBlock placement="about_page" regionId="zuerich" currency="CHF" />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/betrag in schweizer franken/i), {
      target: { value: '10' },
    });
    expect(screen.getByText('Mindestens 5,00 CHF.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20 CHF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10,00 CHF monatlich spenden' })).toBeInTheDocument();
    expect(screen.queryByText(/€/)).toBeNull();
    expect(screen.queryByText(/SEPA/)).toBeNull();
  });

  it('keeps euros by default', () => {
    render(
      <MemoryRouter>
        <DonationBlock />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/betrag in euro/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20 €' })).toBeInTheDocument();
    expect(screen.queryByText(/CHF/)).toBeNull();
  });
});
