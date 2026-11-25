import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/lib/christmasPage';

const state = vi.hoisted(() => ({
  isSuperAdmin: false,
  page: { loading: false, published: false, denied: false, exists: true, content: null as unknown },
}));
const submit = vi.hoisted(() => vi.fn());
const seats = vi.hoisted(() => ({
  persons: 0,
  attendees: [] as Array<{ name: string; photoURL: string | null }>,
}));
const covered = vi.hoisted(() => ({ items: [] as Array<{ label: string; count: number }> }));

const auth = vi.hoisted(() => ({
  user: null as null | { uid: string; displayName?: string; email?: string },
}));
const mine = vi.hoisted(() => ({ registration: null as null | Record<string, unknown> }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../../src/hooks/useStaffRole', () => ({
  useStaffRole: () => ({ isSuperAdmin: state.isSuperAdmin, loading: false }),
}));
vi.mock('../../src/hooks/useChristmasPage', () => ({
  useChristmasPage: () => state.page,
  useChristmasBringSummary: () => ({
    items: covered.items,
    persons: seats.persons,
    registrations: seats.attendees.length,
    attendees: seats.attendees,
  }),
  setMyChristmasShowPublic: vi.fn(),
  useMyChristmasRegistration: () => ({ loading: false, registration: mine.registration }),
  withdrawChristmasRegistration: vi.fn(),
  saveChristmasContent: vi.fn(),
  submitChristmasRegistration: submit,
}));
vi.mock('../../src/lib/imageUpload', () => ({ uploadPageImage: vi.fn() }));

import ChristmasPage from '../../src/pages/ChristmasPage';

const renderPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <ChristmasPage />
      </MemoryRouter>
    </HelmetProvider>
  );

beforeEach(() => {
  state.isSuperAdmin = false;
  state.page = {
    loading: false,
    published: false,
    denied: false,
    exists: true,
    content: DEFAULT_CONTENT,
  };
  submit.mockReset();
  covered.items = [];
  seats.persons = 0;
  seats.attendees = [];
  auth.user = null;
  mine.registration = null;
});

describe('ChristmasPage', () => {
  it('is a 404 for visitors while unpublished, and when the rules deny the read', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seite nicht gefunden');
    state.page = { ...state.page, published: true, denied: true };
    renderPage();
    expect(screen.queryByText(DEFAULT_CONTENT.title)).not.toBeInTheDocument();
  });

  it('shows a published page to visitors, without the admin tools and with a flyer placeholder', () => {
    state.page = { ...state.page, published: true };
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(DEFAULT_CONTENT.title);
    expect(screen.getByTestId('xmas-flyer-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('xmas-admin-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /seite bearbeiten/i })).not.toBeInTheDocument();
  });

  it('lets a Super-Admin open the unpublished page and switch to edit mode', () => {
    state.isSuperAdmin = true;
    auth.user = { uid: 'u1' };
    renderPage();
    expect(screen.getByTestId('xmas-admin-bar')).toHaveTextContent('nur für Admins');
    fireEvent.click(screen.getByRole('button', { name: /seite bearbeiten/i }));
    expect(screen.getByTestId('xmas-flyer-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(5);
  });

  it('validates the registration before anything is sent', () => {
    state.page = { ...state.page, published: true };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /verbindlich anmelden/i }));
    expect(screen.getByText('Bitte gib deinen Namen an.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('sends a valid registration with the chosen Mitbringliste and then shows the thank-you text', async () => {
    state.page = { ...state.page, published: true };
    submit.mockResolvedValue(undefined);
    renderPage();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Anna' } });
    fireEvent.change(screen.getByLabelText('E-Mail oder Telefonnummer'), {
      target: { value: 'anna@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Eine Person mehr' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hummus' }));
    fireEvent.change(screen.getByLabelText('Eigene Idee hinzufügen'), {
      target: { value: 'Linsensuppe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verbindlich anmelden/i }));
    expect(await screen.findByTestId('xmas-registration-done')).toHaveTextContent(
      DEFAULT_CONTENT.thanksTitle
    );
    expect(submit).toHaveBeenCalledWith(
      {
        name: 'Anna',
        contact: 'anna@example.com',
        persons: 2,
        bring: ['Hummus', 'Linsensuppe'],
        note: '',
        showPublic: false,
      },
      null
    );
  });

  it('shows what others already bring, anonymously, and marks it on the suggestion chips', () => {
    state.page = { ...state.page, published: true };
    covered.items = [{ label: 'Brot', count: 3 }];
    renderPage();
    expect(screen.getByTestId('xmas-covered')).toHaveTextContent('Brot');
    expect(screen.getByTestId('xmas-covered')).toHaveTextContent('× 3');
    expect(screen.getByRole('button', { name: /^Brot/ })).toHaveTextContent('schon 3×');
  });

  it('offers a drag & drop area for the flyer in edit mode only', () => {
    state.isSuperAdmin = true;
    renderPage();
    expect(screen.getByTestId('xmas-flyer-drop')).not.toHaveClass('xmas-flyer--drop');
    fireEvent.click(screen.getByRole('button', { name: /seite bearbeiten/i }));
    const zone = screen.getByTestId('xmas-flyer-drop');
    expect(zone).toHaveClass('xmas-flyer--drop');
    expect(zone).toHaveAttribute('role', 'button');
    expect(screen.queryByRole('button', { name: /^flyer hochladen$/i })).not.toBeInTheDocument();
    fireEvent.dragOver(zone);
    expect(zone).toHaveClass('xmas-flyer--over');
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveClass('xmas-flyer--over');
  });

  it('opens the flyer in a lightbox on click and closes it again', () => {
    state.page = {
      ...state.page,
      published: true,
      content: { ...DEFAULT_CONTENT, flyerUrl: 'https://example.com/flyer.jpg' },
    };
    renderPage();
    expect(screen.queryByTestId('xmas-lightbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Flyer vergrößern' }));
    expect(screen.getByTestId('xmas-lightbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByTestId('xmas-lightbox')).not.toBeInTheDocument();
  });

  it('never shows a number of places: nothing below 60 people, "few left" from 60', () => {
    state.page = { ...state.page, published: true };
    seats.persons = 59;
    renderPage();
    expect(screen.queryByTestId('xmas-seats-hint')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b80\b/);
    cleanup();
    seats.persons = 60;
    renderPage();
    expect(screen.getAllByTestId('xmas-seats-hint')[0]).toHaveTextContent(
      'Nur noch wenige Plätze frei'
    );
    expect(document.body.textContent).not.toMatch(/\b(60|80)\b/);
  });

  it('says so when all places are taken, but still lets people sign up', () => {
    state.page = { ...state.page, published: true };
    seats.persons = 80;
    renderPage();
    expect(screen.getAllByTestId('xmas-seats-hint')[0]).toHaveTextContent('ausgebucht');
    expect(screen.getByTestId('xmas-full-note')).toBeInTheDocument();
    expect(screen.getByTestId('xmas-registration-form')).toBeInTheDocument();
  });

  it('prefills the name and e-mail of a signed-in person (editable), without a one-click button', () => {
    state.page = { ...state.page, published: true };
    auth.user = { uid: 'u7', displayName: 'Anna', email: 'anna@example.com' };
    renderPage();
    expect(screen.getByLabelText('Name')).toHaveValue('Anna');
    expect(screen.getByLabelText('E-Mail oder Telefonnummer')).toHaveValue('anna@example.com');
    expect(screen.queryByRole('button', { name: /mit einem klick/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Anna Maria' } });
    expect(screen.getByLabelText('Name')).toHaveValue('Anna Maria');
  });

  it('hides the "others may see that I am coming" option from anonymous registrations', async () => {
    state.page = { ...state.page, published: true };
    submit.mockResolvedValue(undefined);
    renderPage();
    expect(
      screen.queryByRole('checkbox', { name: /andere dürfen sehen/i })
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Gast' } });
    fireEvent.change(screen.getByLabelText('E-Mail oder Telefonnummer'), {
      target: { value: 'gast@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verbindlich anmelden/i }));
    await screen.findByTestId('xmas-registration-done');
    expect(submit.mock.calls[0][0]).toMatchObject({ showPublic: false });
  });

  it('sends the opt-in "others may see that I am coming" only when ticked', async () => {
    state.page = { ...state.page, published: true };
    auth.user = { uid: 'u7', displayName: 'Anna', email: 'anna@example.com' };
    submit.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: /andere dürfen sehen/i }));
    fireEvent.click(screen.getByRole('button', { name: /verbindlich anmelden/i }));
    await screen.findByTestId('xmas-registration-done');
    expect(submit.mock.calls[0][0]).toMatchObject({ name: 'Anna', persons: 1, showPublic: true });
    expect(submit.mock.calls[0][1]).toBe('u7');
  });

  it('shows who is coming (opt-in only) with the name as hover text, and nothing if nobody opted in', () => {
    state.page = { ...state.page, published: true };
    renderPage();
    expect(screen.queryByTestId('xmas-attendees')).not.toBeInTheDocument();
    cleanup();
    seats.attendees = [
      { name: 'Anna', photoURL: null },
      { name: 'Ben', photoURL: 'https://example.com/b.jpg' },
    ];
    renderPage();
    expect(screen.getByTestId('xmas-attendees')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('data-name', 'Anna');
    expect(screen.getByRole('button', { name: 'Ben' })).toBeInTheDocument();
  });

  it('shows "Du bist angemeldet" to registered people', () => {
    state.page = { ...state.page, published: true };
    renderPage();
    cleanup();
    auth.user = { uid: 'u7', displayName: 'Anna', email: 'anna@example.com' };
    mine.registration = { persons: 2, bring: ['Brot'] };
    renderPage();
    expect(screen.getByTestId('xmas-registered')).toHaveTextContent('2 Personen');
    expect(screen.queryByTestId('xmas-registration-form')).not.toBeInTheDocument();
  });
});
