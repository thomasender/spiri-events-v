import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ModeratorOnboardingWizard from '../../src/components/ModeratorOnboardingWizard';
import ModeratorOnboardingPage from '../../src/pages/ModeratorOnboardingPage';
import { DEFAULT_REGION_CONTEXT, RegionContext } from '../../src/hooks/useRegion';
import { STATIC_REGIONS } from '../../src/utils/regions';
import { inviteErrorMessage } from '../../src/utils/moderatorOnboardingText';

const state = vi.hoisted(() => ({
  user: null as null | { uid: string; email: string },
  invite: null as null | Record<string, unknown>,
  acceptCalls: [] as unknown[],
  acceptError: null as null | { code: string; message: string },
}));

vi.mock('../../src/lib/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) => async (data: unknown) => {
    if (name === 'getModeratorInvite') return { data: state.invite };
    if (name === 'acceptModeratorInvite') {
      if (state.acceptError) throw state.acceptError;
      state.acceptCalls.push(data);
      return { data: { regionIds: ['tirol'], alreadyAccepted: false } };
    }
    throw new Error(`unexpected callable ${name}`);
  },
}));
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, loading: false, logout: vi.fn() }),
}));
vi.mock('../../src/components/SeoMeta', () => ({ default: () => null }));
vi.mock('../../src/lib/placeData', () => ({
  loadPlaceIndex: async () => ({}),
  buildRegionEntries: (_index: unknown, regions: { id: string; name: string }[]) =>
    regions.map((r) => ({ kind: 'region', name: r.name, lat: 47.25, lon: 11.4, regionId: r.id })),
}));

const TOKEN = 'T'.repeat(43);

beforeEach(() => {
  state.user = null;
  state.invite = {
    state: 'pending',
    regionIds: ['tirol'],
    regionNames: ['Tirol'],
    email: 'neu@x.at',
  };
  state.acceptCalls = [];
  state.acceptError = null;
});

const next = () => fireEvent.click(screen.getByRole('button', { name: /Los geht's|Weiter/ }));

describe('ModeratorOnboardingWizard', () => {
  it('walks through six steps; ticked steps only go on once ticked', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ModeratorOnboardingWizard tribe="Tribe Tirol" onSubmit={onSubmit} errorMessage={() => ''} />
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Willkommen im Team vom Tribe Tirol'
    );
    expect(screen.getByText('Schritt 1 von 6')).toBeInTheDocument();
    next();

    for (const id of ['haltung', 'richtlinien', 'pruefung']) {
      expect(screen.getByTestId(`mod-onb-step-${id}`)).toBeInTheDocument();
      const weiter = screen.getByRole('button', { name: 'Weiter' });
      expect(weiter).toBeDisabled();
      fireEvent.click(screen.getByRole('checkbox'));
      expect(weiter).toBeEnabled();
      fireEvent.click(weiter);
    }

    expect(screen.getByTestId('mod-onb-step-erinnerung')).toHaveTextContent(
      'Von Herzen – dein Tribe Tirol Team'
    );
    next();

    const sign = screen.getByRole('button', { name: 'Unterschreiben und loslegen' });
    expect(sign).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /Unterschrift/ }), {
      target: { value: '  Anna Muster ' },
    });
    expect(sign).toBeEnabled();
    fireEvent.click(sign);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        consents: ['haltung', 'richtlinien', 'pruefung'],
        signatureName: 'Anna Muster',
      })
    );
  });

  it('keeps ticks when going back and shows the error of a failed submit', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('x'));
    render(
      <ModeratorOnboardingWizard
        tribe="Tribe Tirol"
        onSubmit={onSubmit}
        errorMessage={() => 'Hat nicht geklappt'}
      />
    );
    next();
    fireEvent.click(screen.getByRole('checkbox'));
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(screen.getByRole('checkbox')).toBeChecked();
    next();
    fireEvent.click(screen.getByRole('checkbox'));
    next();
    fireEvent.click(screen.getByRole('checkbox'));
    next();
    next();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unterschreiben und loslegen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hat nicht geklappt');
  });
});

function LoginProbe() {
  const location = useLocation();
  return <pre data-testid="login-state">{JSON.stringify(location.state)}</pre>;
}

function renderPage(search = `?t=${TOKEN}`, region: Record<string, unknown> | null = null) {
  const routes = (
    <MemoryRouter initialEntries={[`/einladung${search}`]}>
      <Routes>
        <Route path="/einladung" element={<ModeratorOnboardingPage />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );
  return render(
    region ? (
      <RegionContext.Provider value={{ ...DEFAULT_REGION_CONTEXT, ...region }}>
        {routes}
      </RegionContext.Provider>
    ) : (
      routes
    )
  );
}

function signWizard() {
  next();
  for (let i = 0; i < 3; i += 1) {
    fireEvent.click(screen.getByRole('checkbox'));
    next();
  }
  next();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Anna' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unterschreiben und loslegen' }));
}

const withActive = (ids: string[]) =>
  STATIC_REGIONS.map((r) => ({ ...r, active: ids.includes(r.id) }));

describe('ModeratorOnboardingPage', () => {
  it('sends visitors to login or registration and back to the invitation', async () => {
    renderPage();
    expect(await screen.findByText(/Du bist eingeladen/)).toBeInTheDocument();
    expect(screen.getByText('neu@x.at')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mod-invite-register'));
    expect(JSON.parse(screen.getByTestId('login-state').textContent as string)).toEqual({
      from: `/einladung?t=${TOKEN}`,
      email: 'neu@x.at',
      authMode: 'register',
    });
  });

  it('explains which address to use when signed in with another account', async () => {
    state.user = { uid: 'u', email: 'anders@x.at' };
    renderPage();
    expect(await screen.findByTestId('mod-invite-wrong-account')).toHaveTextContent(
      'Bitte melde dich mit neu@x.at an.'
    );
    expect(screen.queryByTestId('moderator-onboarding-wizard')).not.toBeInTheDocument();
  });

  it('shows the wizard for the invited account (any letter case) and accepts', async () => {
    state.user = { uid: 'u', email: 'Neu@X.at' };
    renderPage();
    expect(await screen.findByTestId('moderator-onboarding-wizard')).toBeInTheDocument();
    next();
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole('checkbox'));
      next();
    }
    next();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unterschreiben und loslegen' }));
    expect(await screen.findByText('Willkommen im Team!')).toBeInTheDocument();
    expect(state.acceptCalls).toEqual([
      {
        token: TOKEN,
        consents: ['haltung', 'richtlinien', 'pruefung'],
        signatureName: 'Anna',
        textVersion: 1,
      },
    ]);
  });

  it('shows the invited region in the header, not the default or a stale one', async () => {
    const setEventRegion = vi.fn();
    renderPage(undefined, {
      allRegions: withActive(['vorarlberg', 'burgenland', 'tirol']),
      setEventRegion,
    });
    expect(await screen.findByText(/Du bist eingeladen/)).toBeInTheDocument();
    expect(setEventRegion).toHaveBeenLastCalledWith('tirol');
  });

  it('keeps the usual header for an invite to a region not open yet (dark launch)', async () => {
    const setEventRegion = vi.fn();
    renderPage(undefined, { allRegions: withActive(['vorarlberg']), setEventRegion });
    expect(await screen.findByText(/Du bist eingeladen/)).toBeInTheDocument();
    expect(setEventRegion).not.toHaveBeenCalled();
  });

  it('makes the invited region the own one when accepting, replacing a place elsewhere', async () => {
    state.user = { uid: 'u', email: 'neu@x.at' };
    localStorage.clear();
    const rememberRegion = vi.fn();
    const setPlaceSelection = vi.fn();
    renderPage(undefined, {
      allRegions: withActive(['vorarlberg', 'burgenland', 'tirol']),
      placeSelection: {
        label: 'Eisenstadt',
        lat: 47.85,
        lon: 16.52,
        radiusKm: 10,
        regionId: 'burgenland',
        source: 'search',
        updatedAt: 1,
      },
      rememberRegion,
      setPlaceSelection,
    });
    expect(await screen.findByTestId('moderator-onboarding-wizard')).toBeInTheDocument();
    signWizard();
    expect(await screen.findByText('Willkommen im Team!')).toBeInTheDocument();
    expect(rememberRegion).toHaveBeenCalledWith('tirol');
    expect(setPlaceSelection).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Tirol', regionId: 'tirol', radiusKm: 10 })
    );
  });

  it('keeps a place that already lies in the invited region', async () => {
    state.user = { uid: 'u', email: 'neu@x.at' };
    const setPlaceSelection = vi.fn();
    const rememberRegion = vi.fn();
    renderPage(undefined, {
      allRegions: withActive(['vorarlberg', 'tirol']),
      placeSelection: {
        label: 'Innsbruck',
        lat: 47.26,
        lon: 11.39,
        radiusKm: 25,
        regionId: 'tirol',
        source: 'search',
        updatedAt: 1,
      },
      rememberRegion,
      setPlaceSelection,
    });
    expect(await screen.findByTestId('moderator-onboarding-wizard')).toBeInTheDocument();
    signWizard();
    expect(await screen.findByText('Willkommen im Team!')).toBeInTheDocument();
    expect(rememberRegion).toHaveBeenCalledWith('tirol');
    expect(setPlaceSelection).not.toHaveBeenCalled();
  });

  it('shows used, revoked or expired invitations and broken links', async () => {
    state.invite = { state: 'expired', regionIds: ['tirol'], regionNames: ['Tirol'], email: null };
    renderPage();
    expect(await screen.findByTestId('mod-invite-state')).toHaveTextContent('abgelaufen');
  });

  it('rejects a link without a valid token without asking the server', () => {
    renderPage('?t=kaputt');
    expect(screen.getByText(/Einladungslink ist unvollständig/)).toBeInTheDocument();
  });

  it('maps server errors to plain German', () => {
    expect(
      inviteErrorMessage({ code: 'functions/not-found', message: 'Invitation not found.' })
    ).toMatch(/gibt es nicht/);
    expect(
      inviteErrorMessage({
        code: 'functions/failed-precondition',
        message: 'Invitation already used.',
      })
    ).toBe('Diese Einladung wurde schon angenommen.');
  });
});
