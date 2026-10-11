import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import InstagramTab from '../../src/components/InstagramTab';

const DAY = 86400000;

const state = vi.hoisted(() => ({
  role: 'Admin',
  settings: null as Record<string, unknown> | null,
  posts: [] as Record<string, unknown>[],
  titles: {} as Record<string, string | null>,
  unposted: [] as Record<string, unknown>[],
  setDoc: vi.fn(),
  callable: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ role: state.role, user: { uid: 'admin-1' } }),
}));
vi.mock('../../src/hooks/useInstagramAdmin', () => ({
  useInstagramSettings: () => ({ settings: state.settings, loading: false, error: null }),
  useInstagramPosts: () => ({
    posts: state.posts,
    titles: state.titles,
    loading: false,
    error: null,
  }),
  useUnpostedConsentEvents: () => ({ events: state.unposted, loading: false, error: null }),
}));
vi.mock('../../src/lib/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  setDoc: (...args: unknown[]) => state.setDoc(...args),
  serverTimestamp: () => 'SERVER_TS',
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_fn: unknown, name: string) => {
    state.httpsCallable(name);
    return state.callable;
  },
}));

const post = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id: `feed_${id}`,
  eventId: id,
  status,
  attempts: 1,
  permalink: null,
  error: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  ...over,
});

beforeEach(() => {
  state.role = 'Admin';
  state.settings = {
    enabled: false,
    tokenExpiresAt: new Date(Date.now() + 40 * DAY),
    tokenRefreshedAt: new Date('2026-09-20T08:00:00Z'),
    tokenRefreshError: null,
  };
  state.posts = [];
  state.titles = {};
  state.unposted = [];
  state.setDoc.mockReset().mockResolvedValue(undefined);
  state.callable.mockReset().mockResolvedValue({ data: { outcome: 'published' } });
  state.httpsCallable.mockReset();
});

describe('InstagramTab', () => {
  it('renders nothing for non-admins', () => {
    state.role = 'User';
    const { container } = render(<InstagramTab />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the kill switch as off when the settings doc is missing', () => {
    state.settings = { enabled: false, tokenExpiresAt: null, tokenRefreshedAt: null };
    render(<InstagramTab />);
    expect(screen.getByTestId('instagram-state')).toHaveTextContent('Ausgeschaltet');
    expect(screen.getByTestId('instagram-toggle')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('instagram-token-expiry')).toHaveTextContent('–');
  });

  it('toggling writes enabled, updatedAt and updatedBy only', async () => {
    render(<InstagramTab />);
    fireEvent.click(screen.getByTestId('instagram-toggle'));
    await waitFor(() => expect(state.setDoc).toHaveBeenCalledTimes(1));
    const [ref, data, options] = state.setDoc.mock.calls[0];
    expect(ref).toBe('app_settings/instagram');
    expect(data).toEqual({ enabled: true, updatedAt: 'SERVER_TS', updatedBy: 'admin-1' });
    expect(options).toEqual({ merge: true });
  });

  it('switches off when currently enabled', async () => {
    state.settings = { ...state.settings, enabled: true };
    render(<InstagramTab />);
    expect(screen.getByTestId('instagram-state')).toHaveTextContent('Eingeschaltet');
    fireEvent.click(screen.getByTestId('instagram-toggle'));
    await waitFor(() => expect(state.setDoc).toHaveBeenCalled());
    expect(state.setDoc.mock.calls[0][1].enabled).toBe(false);
  });

  it('shows an error when saving the toggle fails', async () => {
    state.setDoc.mockRejectedValue(new Error('denied'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<InstagramTab />);
    fireEvent.click(screen.getByTestId('instagram-toggle'));
    expect(await screen.findByText(/Speichern fehlgeschlagen/)).toBeInTheDocument();
  });

  it('shows no warning when the token has plenty of time left', () => {
    render(<InstagramTab />);
    expect(screen.queryByTestId('instagram-token-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('instagram-token-error')).toHaveTextContent('Keiner');
  });

  it('warns when the token expires in less than 14 days', () => {
    state.settings = {
      ...state.settings,
      tokenExpiresAt: new Date(Date.now() + 5 * DAY + 3600000),
    };
    render(<InstagramTab />);
    expect(screen.getByTestId('instagram-token-warning')).toHaveTextContent('5 Tagen');
  });

  it('warns that the token is expired', () => {
    state.settings = { ...state.settings, tokenExpiresAt: new Date(Date.now() - 2 * DAY) };
    render(<InstagramTab />);
    expect(screen.getByTestId('instagram-token-warning')).toHaveTextContent('abgelaufen');
  });

  it('renders the last token refresh error', () => {
    state.settings = { ...state.settings, tokenRefreshError: 'Refresh failed (HTTP 400)' };
    render(<InstagramTab />);
    expect(screen.getByTestId('instagram-token-error')).toHaveTextContent(
      'Refresh failed (HTTP 400)'
    );
  });

  it('shows an empty state without posts', () => {
    render(<InstagramTab />);
    expect(screen.getByTestId('instagram-empty')).toBeInTheDocument();
  });

  it('lists posts with title (or eventId fallback), badge, attempts, error and permalink', () => {
    state.titles = { e1: 'Kakao Zeremonie', e2: null };
    state.posts = [
      post('e1', 'published', { permalink: 'https://www.instagram.com/p/abc/' }),
      post('e2', 'failed', { attempts: 2, error: 'Instagram media publish failed (HTTP 400)' }),
    ];
    render(<InstagramTab />);
    const rows = screen.getAllByTestId('instagram-post');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Kakao Zeremonie')).toBeInTheDocument();
    expect(within(rows[0]).getByTestId('instagram-post-status')).toHaveTextContent(
      'Veröffentlicht'
    );
    expect(within(rows[0]).getByRole('link')).toHaveAttribute(
      'href',
      'https://www.instagram.com/p/abc/'
    );
    expect(within(rows[1]).getByText('e2')).toBeInTheDocument();
    expect(within(rows[1]).getByTestId('instagram-post-status')).toHaveTextContent(
      'Fehlgeschlagen'
    );
    expect(within(rows[1]).getByText('Versuche: 2')).toBeInTheDocument();
    expect(within(rows[1]).getByTestId('instagram-post-error')).toHaveTextContent('HTTP 400');
  });

  it('offers retry and skip only on the right statuses', () => {
    state.posts = [
      post('pub', 'published'),
      post('fail', 'failed'),
      post('pend', 'publishing'),
      post('skip', 'skipped'),
    ];
    render(<InstagramTab />);
    const [pub, fail, pend, skip] = screen.getAllByTestId('instagram-post');
    for (const row of [pub, skip]) {
      expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    }
    expect(within(fail).getByRole('button', { name: /Erneut versuchen/ })).toBeInTheDocument();
    expect(within(fail).getByRole('button', { name: /Überspringen/ })).toBeInTheDocument();
    expect(
      within(pend).queryByRole('button', { name: /Erneut versuchen/ })
    ).not.toBeInTheDocument();
    expect(within(pend).getByRole('button', { name: /Überspringen/ })).toBeInTheDocument();
  });

  it('retry calls adminRetryInstagramPost with the eventId and shows the outcome', async () => {
    state.posts = [post('fail', 'failed')];
    render(<InstagramTab />);
    fireEvent.click(screen.getByRole('button', { name: /Erneut versuchen/ }));
    await waitFor(() => expect(state.callable).toHaveBeenCalledWith({ eventId: 'fail' }));
    expect(state.httpsCallable).toHaveBeenCalledWith('adminRetryInstagramPost');
    expect(await screen.findByText('Der Beitrag wurde veröffentlicht.')).toBeInTheDocument();
  });

  it('skip calls adminSkipInstagramPost with the eventId', async () => {
    state.posts = [post('pend', 'publishing')];
    state.callable.mockResolvedValue({ data: { outcome: 'skipped' } });
    render(<InstagramTab />);
    fireEvent.click(screen.getByRole('button', { name: /Überspringen/ }));
    await waitFor(() => expect(state.callable).toHaveBeenCalledWith({ eventId: 'pend' }));
    expect(state.httpsCallable).toHaveBeenCalledWith('adminSkipInstagramPost');
  });

  it('shows an error when the callable fails', async () => {
    state.posts = [post('fail', 'failed')];
    state.callable.mockRejectedValue({ code: 'functions/permission-denied' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<InstagramTab />);
    fireEvent.click(screen.getByRole('button', { name: /Erneut versuchen/ }));
    expect(await screen.findByText(/Aktion fehlgeschlagen/)).toBeInTheDocument();
  });

  it('lists consented events without a post and posts them via the retry callable', async () => {
    state.unposted = [{ eventId: 'ev1', title: 'Yoga & Breathwork', date: '2026-10-16' }];
    render(<InstagramTab />);
    const row = within(screen.getByTestId('instagram-unposted')).getByTestId(
      'instagram-unposted-event'
    );
    expect(row).toHaveTextContent('Yoga & Breathwork');
    fireEvent.click(within(row).getByRole('button', { name: /Jetzt posten/ }));
    await waitFor(() => expect(state.callable).toHaveBeenCalledWith({ eventId: 'ev1' }));
    expect(state.httpsCallable).toHaveBeenCalledWith('adminRetryInstagramPost');
  });

  it('hides the unposted card when every consented event has a post', () => {
    render(<InstagramTab />);
    expect(screen.queryByTestId('instagram-unposted')).not.toBeInTheDocument();
  });
});

describe('InstagramTab weekly carousels', () => {
  const group = (over: Record<string, unknown> = {}) => ({
    postId: 'carousel_dornbirn_2026-10-12',
    bezirk: 'Dornbirn',
    part: 1,
    parts: 1,
    cover: {
      heading: 'Events nächste Woche',
      bezirk: 'in Dornbirn',
      dateRange: '12. – 18. Okt 2026',
    },
    caption: 'Events nächste Woche in Dornbirn\n\n• Kakao Zeremonie',
    events: [
      {
        id: 'e1',
        title: 'Kakao Zeremonie',
        date: '2026-10-14',
        time: '18:00',
        place: 'Studio',
        organizerHandle: '@kakao',
      },
    ],
    existingStatus: null,
    ...over,
  });

  const withPreview = (groups: unknown[]) =>
    state.callable.mockResolvedValue({ data: { weekLabel: '12. – 18. Okt 2026', groups } });

  const runPreview = async () => {
    render(<InstagramTab />);
    fireEvent.click(screen.getByTestId('instagram-carousel-preview'));
    await screen.findByTestId('instagram-carousel-result');
  };

  it('shows the dry run with slides and caption and posts nothing', async () => {
    withPreview([group()]);
    await runPreview();

    expect(state.httpsCallable).toHaveBeenCalledWith('adminPreviewWeeklyCarousels');
    expect(state.httpsCallable).not.toHaveBeenCalledWith('adminPostWeeklyCarousels');
    expect(screen.getByTestId('instagram-carousel-caption')).toHaveTextContent('Kakao Zeremonie');
    expect(screen.getByText(/Kakao Zeremonie \(Studio\) · @kakao/)).toBeInTheDocument();
  });

  it('keeps the post button disabled while the automation is off', async () => {
    withPreview([group()]);
    await runPreview();

    expect(screen.getByTestId('instagram-carousel-post')).toBeDisabled();
    expect(screen.getByTestId('instagram-carousel-off')).toBeInTheDocument();
  });

  it('posts only after the confirmation when the automation is on', async () => {
    state.settings = { ...state.settings, enabled: true };
    withPreview([group()]);
    await runPreview();

    fireEvent.click(screen.getByTestId('instagram-carousel-post'));
    expect(state.httpsCallable).not.toHaveBeenCalledWith('adminPostWeeklyCarousels');

    state.callable.mockResolvedValue({
      data: {
        status: 'done',
        results: [{ id: 'carousel_dornbirn_2026-10-12', outcome: 'published' }],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt veröffentlichen' }));

    await waitFor(() =>
      expect(state.httpsCallable).toHaveBeenCalledWith('adminPostWeeklyCarousels')
    );
    expect(await screen.findByRole('status')).toHaveTextContent('veröffentlicht');
  });

  it('does not offer carousels that already have a record', async () => {
    state.settings = { ...state.settings, enabled: true };
    withPreview([group({ existingStatus: 'published' })]);
    await runPreview();

    expect(screen.getByTestId('instagram-carousel-existing')).toBeInTheDocument();
    expect(screen.getByTestId('instagram-carousel-post')).toBeDisabled();
  });

  it('explains why events of the week are left out', async () => {
    state.callable.mockResolvedValue({
      data: {
        weekLabel: '12. – 18. Okt 2026',
        summary: {
          total: 6,
          eligible: 0,
          notApproved: 0,
          withoutConsent: 4,
          online: 1,
          otherRegion: 1,
          details: {
            withoutConsent: [
              { id: 'a', title: 'Kakao Abend', date: '2026-10-14', bezirk: 'Dornbirn' },
            ],
            online: [],
            otherRegion: [{ id: 'b', title: 'Yoga in Wien', date: '2026-10-15', bezirk: 'Wien' }],
            notApproved: [],
          },
        },
        groups: [],
      },
    });
    await runPreview();

    const summary = screen.getByTestId('instagram-carousel-summary');
    expect(summary).toHaveTextContent('6 Termine');
    expect(summary).toHaveTextContent('4 Termine ohne Zustimmung');
    expect(summary).toHaveTextContent('1 Online-Termin');
    expect(summary).toHaveTextContent('1 Termin ohne passenden Bezirk');
    expect(summary).toHaveTextContent('2026-10-14 · Kakao Abend (Dornbirn)');
    expect(summary).toHaveTextContent('2026-10-15 · Yoga in Wien (Wien)');
  });

  it('says so when there is nothing to post', async () => {
    withPreview([]);
    await runPreview();

    expect(screen.getByTestId('instagram-carousel-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('instagram-carousel-post')).toBeNull();
  });
});
