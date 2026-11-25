import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/lib/christmasPage';

const state = vi.hoisted(() => ({
  isSuperAdmin: false,
  page: { loading: false, published: false, denied: false, exists: true, content: null as unknown },
}));
const submit = vi.hoisted(() => vi.fn());

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../../src/hooks/useStaffRole', () => ({
  useStaffRole: () => ({ isSuperAdmin: state.isSuperAdmin, loading: false }),
}));
vi.mock('../../src/hooks/useChristmasPage', () => ({
  useChristmasPage: () => state.page,
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
    expect(submit).toHaveBeenCalledWith({
      name: 'Anna',
      contact: 'anna@example.com',
      persons: 2,
      bring: ['Hummus', 'Linsensuppe'],
      note: '',
    });
  });
});
