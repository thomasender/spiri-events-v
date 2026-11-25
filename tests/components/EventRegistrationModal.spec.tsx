import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventRegistrationModal from '../../src/components/EventRegistrationModal';
import EventRegistrationButton from '../../src/components/EventRegistrationButton';
import { readPendingRegistration } from '../../src/lib/eventRegistration';

const mocks = vi.hoisted(() => ({ call: vi.fn(), enabled: true }));

vi.mock('../../src/hooks/useEventRegistrationSettings', () => ({
  useEventRegistrationEnabled: () => mocks.enabled,
}));

vi.mock('../../src/lib/firebase', () => ({
  callable: (name: string) => (data: unknown) => mocks.call(name, data),
}));

const event = {
  id: 'evt1',
  title: 'Klangreise',
  status: 'approved',
  date: '2999-01-10',
  recurrence: 'none',
};

function renderModal(props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <EventRegistrationModal open onClose={() => {}} event={event} user={null} {...props} />
    </MemoryRouter>
  );
}

const nameInput = () => screen.getByTestId('event-registration-name') as HTMLInputElement;
const contactInput = () => screen.getByTestId('event-registration-contact') as HTMLInputElement;

beforeEach(() => {
  mocks.call.mockReset();
  mocks.enabled = true;
  sessionStorage.clear();
});

describe('EventRegistrationModal', () => {
  it('prefills name and e-mail of a signed-in member and lets them change it', () => {
    renderModal({ user: { uid: 'u1', displayName: 'Anna', email: 'anna@example.com' } });
    expect(nameInput().value).toBe('Anna');
    expect(contactInput().value).toBe('anna@example.com');
    fireEvent.change(contactInput(), { target: { value: '+43 664 1234567' } });
    expect(contactInput().value).toBe('+43 664 1234567');
  });

  it('needs an e-mail address or a phone number', async () => {
    renderModal();
    fireEvent.change(nameInput(), { target: { value: 'Anna' } });
    fireEvent.change(contactInput(), { target: { value: 'keine kontaktangabe' } });
    fireEvent.click(screen.getByTestId('event-registration-submit'));
    expect(
      await screen.findByText('Bitte gib eine gültige E-Mail-Adresse oder Telefonnummer an.')
    ).toBeInTheDocument();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('sends the registration to the callable and confirms it to a member', async () => {
    mocks.call.mockResolvedValue({
      data: { ok: true, organizerNotified: true, confirmationSent: true, favorite: true },
    });
    renderModal({
      user: { uid: 'u1', displayName: 'Anna', email: 'anna@example.com' },
      occurrenceDate: '2999-01-17',
    });
    fireEvent.click(screen.getByTestId('event-registration-submit'));
    expect(await screen.findByTestId('event-registration-success')).toBeInTheDocument();
    expect(mocks.call).toHaveBeenCalledWith('submitEventRegistration', {
      eventId: 'evt1',
      name: 'Anna',
      contact: 'anna@example.com',
      occurrenceDate: '2999-01-17',
      website: '',
    });
    expect(screen.getByText(/in deinen Favoriten/)).toBeInTheDocument();
    expect(screen.queryByTestId('event-registration-guest-cta')).not.toBeInTheDocument();
    expect(readPendingRegistration()).toBeNull();
  });

  it('names the chosen date in the form and falls back to the next date of a series', async () => {
    mocks.call.mockResolvedValue({ data: { ok: true } });
    const series = {
      ...event,
      time: '19:30',
      recurrence: 'custom',
      date: '2999-01-10',
      customDates: ['2999-01-10', '2999-01-24'],
    };
    const { unmount } = renderModal({ event: series, occurrenceDate: '2999-01-24' });
    expect(screen.getByText(/Du meldest dich an für:/)).toHaveTextContent(
      'Du meldest dich an für: Klangreise, am Donnerstag, 24. Januar 2999, abends um 19:30 Uhr.'
    );
    unmount();
    // A list link carries no occurrenceDate: the next upcoming date is used and sent.
    renderModal({ event: series });
    expect(screen.getByText(/Du meldest dich an für:/)).toHaveTextContent(
      'am Donnerstag, 10. Januar 2999, abends um 19:30 Uhr'
    );
    fireEvent.change(nameInput(), { target: { value: 'Ben' } });
    fireEvent.change(contactInput(), { target: { value: 'ben@example.com' } });
    fireEvent.click(screen.getByTestId('event-registration-submit'));
    await screen.findByTestId('event-registration-success');
    expect(mocks.call).toHaveBeenCalledWith(
      'submitEventRegistration',
      expect.objectContaining({ occurrenceDate: '2999-01-10' })
    );
  });

  it('invites a guest to create an account and remembers the registration', async () => {
    mocks.call.mockResolvedValue({
      data: { ok: true, organizerNotified: true, confirmationSent: true, favorite: false },
    });
    renderModal();
    fireEvent.change(nameInput(), { target: { value: 'Ben' } });
    fireEvent.change(contactInput(), { target: { value: 'ben@example.com' } });
    fireEvent.click(screen.getByTestId('event-registration-submit'));
    expect(await screen.findByTestId('event-registration-guest-cta')).toBeInTheDocument();
    expect(screen.getByTestId('event-registration-create-account')).toHaveAttribute(
      'href',
      '/login'
    );
    expect(readPendingRegistration()).toEqual({
      eventId: 'evt1',
      eventTitle: 'Klangreise',
      name: 'Ben',
      email: 'ben@example.com',
    });
  });

  it('keeps no e-mail for a guest who gave a phone number', async () => {
    mocks.call.mockResolvedValue({
      data: { ok: true, organizerNotified: true, confirmationSent: false, favorite: false },
    });
    renderModal();
    fireEvent.change(nameInput(), { target: { value: 'Ben' } });
    fireEvent.change(contactInput(), { target: { value: '0664 1234567' } });
    fireEvent.click(screen.getByTestId('event-registration-submit'));
    await screen.findByTestId('event-registration-success');
    expect(screen.queryByText(/Bestätigung ist per E-Mail/)).not.toBeInTheDocument();
    expect(readPendingRegistration()?.email).toBe('');
  });

  it('tells the guest when the organizer could not be reached', async () => {
    mocks.call.mockResolvedValue({
      data: { ok: true, organizerNotified: false, confirmationSent: false, favorite: false },
    });
    renderModal({ user: { uid: 'u1', displayName: 'Anna', email: 'anna@example.com' } });
    fireEvent.click(screen.getByTestId('event-registration-submit'));
    expect(await screen.findByTestId('event-registration-no-mail')).toBeInTheDocument();
  });

  it('shows a readable error when the callable refuses', async () => {
    mocks.call.mockRejectedValue({ code: 'functions/resource-exhausted' });
    renderModal({ user: { uid: 'u1', displayName: 'Anna', email: 'anna@example.com' } });
    fireEvent.click(screen.getByTestId('event-registration-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('event-registration-error')).toHaveTextContent(
        /Zu viele Anmeldungen/
      )
    );
  });
});

describe('EventRegistrationButton', () => {
  it('reads "Zum Event anmelden" and opens the form', () => {
    render(
      <MemoryRouter>
        <EventRegistrationButton event={event} user={null} />
      </MemoryRouter>
    );
    const button = screen.getByTestId('event-registration-button');
    expect(button).toHaveTextContent('Zum Event anmelden');
    fireEvent.click(button);
    expect(screen.getByTestId('event-registration-modal')).toBeInTheDocument();
  });

  it('reads "Über Tribe anmelden" next to an external registration', () => {
    render(<EventRegistrationButton event={{ ...event, registration: 'www.x.at' }} user={null} />);
    expect(screen.getByTestId('event-registration-button')).toHaveTextContent(
      'Über Tribe anmelden'
    );
  });

  it('is hidden while an admin has the feature switched off', () => {
    mocks.enabled = false;
    render(<EventRegistrationButton event={event} user={null} />);
    expect(screen.queryByTestId('event-registration-button')).not.toBeInTheDocument();
  });

  it('is hidden for unpublished, cancelled and past events', () => {
    const { rerender } = render(
      <EventRegistrationButton event={{ ...event, status: 'pending' }} user={null} />
    );
    expect(screen.queryByTestId('event-registration-button')).not.toBeInTheDocument();
    rerender(<EventRegistrationButton event={{ ...event, cancelled: true }} user={null} />);
    expect(screen.queryByTestId('event-registration-button')).not.toBeInTheDocument();
    rerender(<EventRegistrationButton event={{ ...event, date: '2000-01-01' }} user={null} />);
    expect(screen.queryByTestId('event-registration-button')).not.toBeInTheDocument();
  });
});
