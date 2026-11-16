import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PioniereWizard from '../../src/components/PioniereWizard';
import PioniereOnboardingPage from '../../src/pages/PioniereOnboardingPage';
import PioniereMembershipCard from '../../src/components/PioniereMembershipCard';
import { PioniereAddMemberForm } from '../../src/components/PioniereAdminSection';
import { MEMBERSHIP_BENEFITS, membershipErrorMessage } from '../../src/utils/clubMembership';

const state = vi.hoisted(() => ({
  user: null as null | { uid: string; email: string; displayName?: string },
  role: null as null | string,
  settings: { mode: 'all', statutesUrl: 'https://x.at/statuten.pdf', statutesVersion: '' },
  membership: null as null | Record<string, unknown>,
  calls: [] as unknown[],
}));

vi.mock('../../src/lib/firebase', () => ({
  callable: (name: string) => async (data: unknown) => {
    state.calls.push({ name, data });
    if (name === 'adminCreateClubMember') {
      return { data: { uid: 'x', createdAccount: false, alreadyMember: false, emailSent: true } };
    }
    if (name === 'cancelMembership') {
      return { data: { status: 'cancelled', paidUntil: '2026-12-16', alreadyCancelled: false } };
    }
    return { data: { checkoutUrl: 'https://mollie.test/c' } };
  },
}));
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, role: state.role, loading: false }),
}));
vi.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { displayName: 'Anna aus dem Profil' }, loading: false }),
}));
vi.mock('../../src/hooks/useMembership', () => ({
  useMembershipAccess: () => ({
    ...state.settings,
    loading: false,
    isAdmin: state.role === 'Admin',
    visible:
      state.settings.mode === 'all' || (state.settings.mode === 'admins' && state.role === 'Admin'),
  }),
  useOwnMembership: () => ({ membership: state.membership, loading: false }),
}));
vi.mock('../../src/components/SeoMeta', () => ({ default: () => null }));
vi.mock('../../src/pages/ErrorPage', () => ({
  default: () => <p data-testid="not-found">Nicht gefunden</p>,
}));

beforeEach(() => {
  state.user = null;
  state.role = null;
  state.settings = { mode: 'all', statutesUrl: 'https://x.at/statuten.pdf', statutesVersion: '' };
  state.membership = null;
  state.calls = [];
});

const next = () => fireEvent.click(screen.getByRole('button', { name: /Los geht's|Weiter/ }));
const submitButton = () => screen.getByRole('button', { name: /Mitglied werden und bezahlen/ });

function renderWizard(props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn(async () => {});
  render(
    <MemoryRouter>
      <PioniereWizard
        initialName="Anna Pionierin"
        email="anna@x.at"
        statutesUrl="https://x.at/statuten.pdf"
        onSubmit={onSubmit}
        errorMessage={membershipErrorMessage}
        {...props}
      />
    </MemoryRouter>
  );
  return { onSubmit };
}

describe('PioniereWizard', () => {
  it('names the benefits before anything else', () => {
    renderWizard();
    expect(screen.getByTestId('pioniere-step-vorteile')).toBeInTheDocument();
    for (const b of MEMBERSHIP_BENEFITS) expect(screen.getByText(b)).toBeInTheDocument();
  });

  it('takes name and e-mail from the account, the e-mail is not editable', () => {
    renderWizard();
    next();
    expect(screen.getByTestId('pioniere-name')).toHaveValue('Anna Pionierin');
    expect(screen.getByTestId('pioniere-email')).toHaveValue('anna@x.at');
    expect(screen.getByTestId('pioniere-email')).toHaveAttribute('readonly');
  });

  it('offers 3,90 / 12,90 / 17,90 € and a free amount from 3 €', () => {
    renderWizard();
    next();
    for (const label of ['3,90 €', '12,90 €', '17,90 €', 'Eigener Betrag']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByLabelText('Eigener Betrag'));
    const custom = screen.getByTestId('pioniere-custom-amount');
    fireEvent.change(custom, { target: { value: '2,50' } });
    expect(screen.getByRole('button', { name: /Weiter/ })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('ab 3,00 €');
    fireEvent.change(custom, { target: { value: '3' } });
    expect(screen.getByRole('button', { name: /Weiter/ })).toBeEnabled();
  });

  it('needs a name', () => {
    renderWizard();
    next();
    fireEvent.change(screen.getByTestId('pioniere-name'), { target: { value: ' ' } });
    expect(screen.getByRole('button', { name: /Weiter/ })).toBeDisabled();
  });

  it('pays only with both ticks, then sends amount, name and ticks', async () => {
    const { onSubmit } = renderWizard();
    next();
    fireEvent.click(screen.getByLabelText('17,90 €'));
    next();
    expect(screen.getByTestId('pioniere-summary')).toHaveTextContent('17,90 €');
    expect(screen.getByRole('link', { name: 'Statuten' })).toHaveAttribute(
      'href',
      'https://x.at/statuten.pdf'
    );
    expect(
      screen.getByRole('link', { name: 'Datenschutzinformation für Vereinsmitglieder' })
    ).toHaveAttribute('href', '/datenschutz#vereinsmitglieder');

    expect(submitButton()).toBeDisabled();
    fireEvent.click(screen.getByTestId('pioniere-consent-statuten'));
    expect(submitButton()).toBeDisabled();
    fireEvent.click(screen.getByTestId('pioniere-consent-datenschutz'));
    expect(submitButton()).toBeEnabled();
    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        amount: 17.9,
        name: 'Anna Pionierin',
        consents: ['statuten', 'datenschutz'],
      })
    );
  });

  it('without a Statuten link: placeholder, and only admins can pay', () => {
    renderWizard({ statutesUrl: '' });
    next();
    next();
    expect(screen.getByTestId('pioniere-no-statutes')).toHaveTextContent('Platzhalter');
    fireEvent.click(screen.getByTestId('pioniere-consent-statuten'));
    fireEvent.click(screen.getByTestId('pioniere-consent-datenschutz'));
    expect(submitButton()).toBeDisabled();
  });

  it('lets a Super-Admin test without a Statuten link', () => {
    renderWizard({ statutesUrl: '', isAdmin: true });
    next();
    next();
    fireEvent.click(screen.getByTestId('pioniere-consent-statuten'));
    fireEvent.click(screen.getByTestId('pioniere-consent-datenschutz'));
    expect(submitButton()).toBeEnabled();
  });

  it('shows a readable error when the start fails', async () => {
    const onSubmit = vi.fn(async () => {
      throw { code: 'functions/already-exists' };
    });
    renderWizard({ onSubmit });
    next();
    next();
    fireEvent.click(screen.getByTestId('pioniere-consent-statuten'));
    fireEvent.click(screen.getByTestId('pioniere-consent-datenschutz'));
    fireEvent.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('bereits Pionier:in');
  });
});

describe('PioniereOnboardingPage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/pioniere']}>
        <PioniereOnboardingPage />
      </MemoryRouter>
    );

  it('sends guests to log in or register first', () => {
    renderPage();
    expect(screen.getByTestId('pioniere-login')).toHaveAttribute('href', '/login');
    expect(screen.getByTestId('pioniere-register')).toBeInTheDocument();
    expect(screen.queryByTestId('pioniere-wizard')).not.toBeInTheDocument();
  });

  it('is not there while the flag is off, and only for admins in test mode', () => {
    state.settings = { ...state.settings, mode: 'off' };
    const { unmount } = renderPage();
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
    unmount();
    state.settings = { ...state.settings, mode: 'admins' };
    state.user = { uid: 'u1', email: 'a@x.at' };
    renderPage();
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
  });

  it('fills the name from the profile for a signed-in person', () => {
    state.user = { uid: 'u1', email: 'a@x.at' };
    renderPage();
    next();
    expect(screen.getByTestId('pioniere-name')).toHaveValue('Anna aus dem Profil');
    expect(screen.getByTestId('pioniere-email')).toHaveValue('a@x.at');
  });

  it('tells members that they already are one', () => {
    state.user = { uid: 'u1', email: 'a@x.at' };
    state.membership = { status: 'active' };
    renderPage();
    expect(screen.getByTestId('pioniere-already-member')).toBeInTheDocument();
  });
});

describe('PioniereMembershipCard (profile)', () => {
  const renderCard = () =>
    render(
      <MemoryRouter>
        <PioniereMembershipCard uid="u1" />
      </MemoryRouter>
    );

  it('shows members a clearly visible way to cancel, with a confirmation', async () => {
    state.settings = { ...state.settings, mode: 'off' };
    state.membership = { status: 'active', source: 'web', amount: 12.9, paidUntil: '2026-12-16' };
    renderCard();
    expect(screen.getByTestId('pioniere-status')).toHaveTextContent('12,90 €');
    fireEvent.click(screen.getByTestId('pioniere-cancel'));
    expect(screen.getByText(/bis zum Ende des bezahlten Monats/)).toBeInTheDocument();
    expect(state.calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ja, kündigen' }));
    expect(await screen.findByRole('status')).toHaveTextContent('16. Dezember 2026');
    expect(state.calls).toEqual([{ name: 'cancelMembership', data: {} }]);
  });

  it('shows a gekündigt membership with its end date and no cancel button', () => {
    state.membership = { status: 'cancelled', source: 'web', paidUntil: '2099-01-01' };
    renderCard();
    expect(screen.getByTestId('pioniere-status')).toHaveTextContent('Gekündigt');
    expect(screen.queryByTestId('pioniere-cancel')).not.toBeInTheDocument();
  });

  it('invites non-members while the sign-up is open, and is hidden while it is off', () => {
    const { unmount } = renderCard();
    expect(screen.getByTestId('pioniere-join')).toHaveAttribute('href', '/pioniere');
    unmount();
    state.settings = { ...state.settings, mode: 'off' };
    renderCard();
    expect(screen.queryByTestId('profile-pioniere')).not.toBeInTheDocument();
  });
});

describe('PioniereAddMemberForm (Verwaltung -> Mitglieder)', () => {
  it('creates a member from a paper form and says that an existing account was linked', async () => {
    const onCreated = vi.fn();
    render(<PioniereAddMemberForm onCreated={onCreated} />);
    expect(screen.queryByTestId('pioniere-admin-add')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pioniere-admin-add-toggle'));
    const submit = screen.getByRole('button', { name: 'Als Vereinsmitglied anlegen' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('pioniere-admin-add-name'), {
      target: { value: 'Berta Beispiel' },
    });
    fireEvent.change(screen.getByTestId('pioniere-admin-add-email'), {
      target: { value: 'berta@example.org' },
    });
    fireEvent.change(screen.getByTestId('pioniere-admin-add-amount'), { target: { value: '2' } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('pioniere-admin-add-amount'), {
      target: { value: '5,50' },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await screen.findByTestId('pioniere-admin-add-result')).toHaveTextContent(
      'Bestehendes Konto verknüpft'
    );
    expect(state.calls).toEqual([
      {
        name: 'adminCreateClubMember',
        data: { name: 'Berta Beispiel', email: 'berta@example.org', amount: 5.5, sendEmail: true },
      },
    ]);
    expect(onCreated).toHaveBeenCalled();
  });
});
