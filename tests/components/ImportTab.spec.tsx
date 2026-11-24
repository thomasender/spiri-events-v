import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import ImportTab from '../../src/components/ImportTab';
import {
  blocklistIdAsync,
  blocklistKind,
  normalizeBlocklistValue,
} from '../../src/utils/eventImport';
import * as server from '../../functions/src/eventImport';

const state = vi.hoisted(() => ({
  role: 'Admin' as string | null,
  candidates: [] as Array<Record<string, unknown>>,
  organizers: [] as Array<Record<string, unknown>>,
  runs: [] as Array<Record<string, unknown>>,
  production: false,
  control: { productionEnabled: false, dailyLimit: 10, sentToday: 0, loading: false },
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' }, role: state.role, staffRegionIds: [] }),
}));
vi.mock('../../src/hooks/useImportData', () => ({
  useImportCandidates: () => ({ items: state.candidates, loading: false, error: null }),
  useRegionCandidates: () => ({ items: state.candidates, loading: false, error: null }),
  useImportOrganizers: () => ({ items: state.organizers, loading: false, error: null }),
  useImportRuns: () => ({ items: state.runs, loading: false, error: null }),
  useLastOutreach: () => null,
  useOutreachControl: () => state.control,
  useCandidateCounts: () => ({ found: 2, published: 1 }),
}));
const visibility = vi.hoisted(() => ({ value: false }));
vi.mock('../../src/hooks/useImportVisibility', () => ({
  useModeratorsSeeInReview: () => visibility.value,
}));
const api = vi.hoisted(() => ({
  setCandidateStatus: vi.fn(async (..._: unknown[]) => {}),
  setModeratorsSeeInReview: vi.fn(async (_: unknown) => {}),
  importAcceptCandidate: vi.fn(async (_: unknown) => ({ eventId: 'e1' })),
  importRejectCandidate: vi.fn(async (_: unknown) => ({ ok: true })),
  createPreviewLink: vi.fn(async (_: unknown) => ({
    url: 'https://x.test/p/abc',
    expiresAt: '2026-12-01',
  })),
  sendOutreachMail: vi.fn(async (_: unknown) => ({ status: 'sent' })),
  isProductionProject: () => state.production,
  saveOutreachSettings: vi.fn(async (_: unknown) => {}),
  isOnBlocklist: vi.fn(async (_: unknown) => false),
  addToBlocklist: vi.fn(async (..._: unknown[]) => 'hash'),
  removeFromBlocklist: vi.fn(async (_: unknown) => 'hash'),
  fetchImportProgress: vi.fn(async (_: unknown) => null),
}));
vi.mock('../../src/utils/importAdminApi', () => api);

const candidate = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  regionId: 'zuerich',
  organizerRef: 'o1',
  status: 'found',
  sourceUrl: 'https://yoga.test/events/1',
  imageUrl: 'https://yoga.test/img.jpg',
  dateQuote: 'Jeden Mittwoch, 18 Uhr',
  confidence: 0.82,
  rawExtract: {
    title: 'Yoga Abend',
    date: '2026-12-02',
    time: '18:00',
    place: 'Studio',
    city: 'Zürich',
    contribution: '20 CHF',
  },
  ...over,
});
const organizer = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  name: 'Yoga Haus',
  website: 'https://www.yoga.test/start',
  contactEmail: 'Info@Yoga.test',
  legalForm: 'verein',
  consent: 'none',
  regionId: 'zuerich',
  ...over,
});

const confirmButton = (name: string) => screen.getAllByRole('button', { name }).pop()!;

beforeEach(() => {
  vi.clearAllMocks();
  state.role = 'Admin';
  state.candidates = [candidate()];
  state.organizers = [organizer()];
  state.runs = [];
  state.production = false;
  state.control = { productionEnabled: false, dailyLimit: 10, sentToday: 0, loading: false };
});

describe('ImportTab access', () => {
  it.each(['RegionModerator', null])('renders nothing for role %s', (role) => {
    state.role = role;
    const { container } = render(<ImportTab />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Kandidaten', () => {
  it('shows the facts and links without loading an image', () => {
    const { container } = render(<ImportTab />);
    const card = screen.getByTestId('import-candidate-c1');
    expect(card).toHaveTextContent('Yoga Abend');
    expect(card).toHaveTextContent('2026-12-02 18:00');
    expect(card).toHaveTextContent('20 CHF');
    expect(card).toHaveTextContent('Yoga Haus');
    expect(screen.getByTestId('badge-legal-form')).toHaveTextContent('Verein');
    expect(screen.getByTestId('badge-confidence')).toHaveTextContent('82');
    expect(screen.getByTestId('import-date-quote')).toHaveTextContent('Jeden Mittwoch, 18 Uhr');
    expect(within(card).getByText('Quelle öffnen')).toHaveAttribute('target', '_blank');
    expect(within(card).getByText('Bild-Adresse')).toHaveAttribute(
      'href',
      'https://yoga.test/img.jpg'
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('import-count-found')).toHaveTextContent('2');
  });

  it('accepts after a confirm dialog, without force', async () => {
    render(<ImportTab />);
    fireEvent.click(screen.getByText('Annehmen'));
    expect(api.importAcceptCandidate).not.toHaveBeenCalled();
    fireEvent.click(confirmButton('Annehmen'));
    await waitFor(() =>
      expect(api.importAcceptCandidate).toHaveBeenCalledWith({ candidateId: 'c1', force: false })
    );
  });

  it('asks a second time and sends force for pilotExcluded candidates', async () => {
    state.candidates = [candidate({ pilotExcluded: true })];
    render(<ImportTab />);
    expect(screen.getByTestId('badge-pilot')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Annehmen'));
    fireEvent.click(confirmButton('Annehmen'));
    expect(api.importAcceptCandidate).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Trotzdem annehmen' }));
    await waitFor(() =>
      expect(api.importAcceptCandidate).toHaveBeenCalledWith({ candidateId: 'c1', force: true })
    );
  });

  it('explains the pilot badge in a tooltip and in the confirm dialog', () => {
    state.candidates = [candidate({ pilotExcluded: true })];
    render(<ImportTab />);
    expect(screen.getByTestId('badge-pilot')).toHaveAttribute(
      'title',
      expect.stringContaining('strengere Datenschutz- und Werberegeln')
    );
    fireEvent.click(screen.getByText('Annehmen'));
    fireEvent.click(confirmButton('Annehmen'));
    expect(screen.getByTestId('pilot-help')).toHaveTextContent(
      'Einzelperson oder Einzelunternehmen'
    );
  });

  it('defers a found candidate and reopens a deferred one', async () => {
    const { unmount } = render(<ImportTab />);
    fireEvent.click(screen.getByTestId('import-defer-c1'));
    await waitFor(() => expect(api.setCandidateStatus).toHaveBeenCalledWith('c1', 'reviewed'));
    unmount();

    state.candidates = [candidate({ status: 'reviewed' })];
    render(<ImportTab />);
    fireEvent.click(screen.getByTestId('import-status-reviewed'));
    expect(screen.getByTestId('import-status-reviewed')).toHaveTextContent('Zurückgestellt');
    expect(screen.queryByText('Annehmen')).toBeNull();
    fireEvent.click(screen.getByTestId('import-reopen-c1'));
    await waitFor(() => expect(api.setCandidateStatus).toHaveBeenCalledWith('c1', 'found'));
  });

  it('the visibility switch reflects and writes app_settings/importVisibility', async () => {
    visibility.value = true;
    render(<ImportTab />);
    const sw = screen.getByTestId('import-visibility-switch') as HTMLInputElement;
    expect(sw.checked).toBe(true);
    fireEvent.click(sw);
    await waitFor(() => expect(api.setModeratorsSeeInReview).toHaveBeenCalledWith(false));
    visibility.value = false;
  });

  it('rejects with the chosen reason', async () => {
    render(<ImportTab />);
    fireEvent.click(screen.getByText('Ablehnen'));
    fireEvent.change(screen.getByTestId('import-reject-reason'), { target: { value: 'Duplikat' } });
    fireEvent.click(confirmButton('Ablehnen'));
    await waitFor(() =>
      expect(api.importRejectCandidate).toHaveBeenCalledWith({
        candidateId: 'c1',
        reason: 'Duplikat',
      })
    );
  });

  it('shows an error when accepting fails', async () => {
    api.importAcceptCandidate.mockRejectedValueOnce(new Error('boom'));
    render(<ImportTab />);
    fireEvent.click(screen.getByText('Annehmen'));
    fireEvent.click(confirmButton('Annehmen'));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});

describe('Veranstalter', () => {
  const open = () => {
    render(<ImportTab />);
    fireEvent.click(screen.getByTestId('import-view-organizers'));
  };

  it('shows the staging banner, consent label and counts', () => {
    open();
    expect(screen.getByTestId('staging-banner')).toHaveTextContent(
      'echte Veranstalter-Adressen werden nie angeschrieben'
    );
    expect(screen.getByTestId('badge-consent')).toHaveTextContent('noch nicht angeschrieben');
    expect(screen.getByTestId('organizer-counts')).toHaveTextContent('1 / 0');
    expect(screen.queryByRole('button', { name: /^Senden$/ })).toBeNull();
  });

  it('needs a valid test recipient before a mail can go out', async () => {
    open();
    const send = screen.getByTestId('testmail-send');
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByTestId('testmail-input'), { target: { value: 'kaputt' } });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByTestId('testmail-input'), { target: { value: 'ich@test.at' } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() =>
      expect(api.sendOutreachMail).toHaveBeenCalledWith({
        organizerId: 'o1',
        testRecipient: 'ich@test.at',
      })
    );
  });

  describe('real outreach mail', () => {
    const openReady = (control: Partial<typeof state.control> = {}) => {
      state.production = true;
      state.control = { ...state.control, productionEnabled: true, ...control };
      state.candidates = [candidate({ eventId: 'e1' })];
      open();
    };

    it('has no send button on staging, even with the switch on', () => {
      state.control = { ...state.control, productionEnabled: true };
      state.candidates = [candidate({ eventId: 'e1' })];
      open();
      expect(screen.queryByTestId('real-send')).toBeNull();
      expect(screen.getByTestId('staging-banner')).toBeInTheDocument();
    });

    it('has no send button while the switch is off, the day is full or there is nothing to show', () => {
      state.production = true;
      state.candidates = [candidate({ eventId: 'e1' })];
      open();
      expect(screen.queryByTestId('real-send')).toBeNull();
      expect(screen.getByTestId('production-banner')).toBeInTheDocument();
    });

    it('hides the button at the daily limit and without events', () => {
      openReady({ sentToday: 10 });
      expect(screen.queryByTestId('real-send')).toBeNull();
    });

    it('asks for confirmation, then sends without a test recipient', async () => {
      openReady({ sentToday: 3, dailyLimit: 10 });
      fireEvent.click(screen.getByTestId('real-send'));
      expect(api.sendOutreachMail).not.toHaveBeenCalled();
      expect(screen.getByText(/Es gibt nur diese eine Mail/)).toHaveTextContent('7 von 10');
      fireEvent.click(confirmButton('Jetzt senden'));
      await waitFor(() => expect(api.sendOutreachMail).toHaveBeenCalledWith({ organizerId: 'o1' }));
    });

    it('shows a German sentence for a refusal, not the backend text', async () => {
      openReady();
      api.sendOutreachMail.mockRejectedValueOnce(
        Object.assign(new Error('Outreach refused: blocklisted. [400]'), {
          details: { reason: 'blocklisted' },
        })
      );
      fireEvent.click(screen.getByTestId('real-send'));
      fireEvent.click(confirmButton('Jetzt senden'));
      expect(await screen.findByRole('alert')).toHaveTextContent('steht auf der Sperrliste');
      expect(screen.queryByText(/Outreach refused/)).toBeNull();
    });

    it('switches the sending on and saves the limit', async () => {
      state.production = true;
      open();
      fireEvent.click(screen.getByTestId('outreach-switch'));
      await waitFor(() =>
        expect(api.saveOutreachSettings).toHaveBeenCalledWith({
          productionEnabled: true,
          dailyLimit: 10,
        })
      );
      fireEvent.change(screen.getByTestId('outreach-limit'), { target: { value: '25' } });
      fireEvent.click(screen.getByTestId('outreach-limit-save'));
      await waitFor(() =>
        expect(api.saveOutreachSettings).toHaveBeenLastCalledWith({
          productionEnabled: false,
          dailyLimit: 25,
        })
      );
      fireEvent.change(screen.getByTestId('outreach-limit'), { target: { value: '99' } });
      expect(screen.getByTestId('outreach-limit-save')).toBeDisabled();
    });
  });

  it('creates and copies the preview link', async () => {
    const writeText = vi.fn(async (_: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    open();
    fireEvent.click(screen.getByTestId('preview-link'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://x.test/p/abc'));
    expect(api.createPreviewLink).toHaveBeenCalledWith({ organizerId: 'o1', regenerate: false });
    expect(screen.getByTestId('preview-result')).toHaveTextContent('https://x.test/p/abc');
  });

  it('blocks the normalised e-mail and domain', async () => {
    open();
    await waitFor(() => expect(screen.getByTestId('block-toggle-email')).toBeEnabled());
    fireEvent.click(screen.getByTestId('block-toggle-email'));
    await waitFor(() => expect(api.addToBlocklist).toHaveBeenCalledWith('info@yoga.test', 'me'));
    fireEvent.click(screen.getByTestId('block-toggle-domain'));
    await waitFor(() => expect(api.addToBlocklist).toHaveBeenCalledWith('yoga.test', 'me'));
  });

  it('lifts an existing block', async () => {
    api.isOnBlocklist.mockResolvedValue(true);
    open();
    const buttons = await screen.findAllByRole('button', { name: 'Sperre aufheben' });
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(api.removeFromBlocklist).toHaveBeenCalledWith('info@yoga.test'));
    api.isOnBlocklist.mockResolvedValue(false);
  });
});

describe('Läufe', () => {
  it('lists runs with counts and errors', () => {
    state.runs = [
      { id: 'r1', region: 'zuerich', source: 'jsonld', counts: { found: 3 }, errors: ['timeout'] },
    ];
    render(<ImportTab />);
    fireEvent.click(screen.getByTestId('import-view-runs'));
    expect(screen.getByTestId('import-run')).toHaveTextContent('found: 3');
    expect(screen.getByTestId('import-run')).toHaveTextContent('timeout');
  });

  it('renders skippedByReason as readable reason: count pairs', () => {
    state.runs = [
      {
        id: 'r2',
        region: 'zuerich',
        source: 'jsonld',
        counts: { found: 5, skippedByReason: { 'past-date': 2, 'odd-reason': 1 } },
        errors: [],
      },
    ];
    render(<ImportTab />);
    fireEvent.click(screen.getByTestId('import-view-runs'));
    const run = screen.getByTestId('import-run');
    expect(run).not.toHaveTextContent('[object Object]');
    expect(run).toHaveTextContent('Datum in der Vergangenheit: 2');
    expect(run).toHaveTextContent('odd-reason: 1');
  });
});

describe('blocklist hashing', () => {
  it('matches the server helper for e-mails and domains', async () => {
    for (const v of [
      'Info@Yoga.test',
      ' @Yoga.test ',
      'https://www.Yoga.test/start?x=1',
      'yoga.test',
    ]) {
      expect(normalizeBlocklistValue(v)).toBe(server.normalizeBlocklistValue(v));
      expect(await blocklistIdAsync(v)).toBe(server.blocklistId(v));
      expect(blocklistKind(v)).toBe(server.blocklistKind(v));
    }
    expect(await blocklistIdAsync('Info@Yoga.test')).toMatch(/^[0-9a-f]{64}$/);
    await expect(blocklistIdAsync('  ')).rejects.toThrow();
  });
});
