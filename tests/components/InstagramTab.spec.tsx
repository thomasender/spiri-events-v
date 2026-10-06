import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import InstagramTab from '../../src/components/InstagramTab';

const DAY = 86400000;

const state = vi.hoisted(() => ({
  role: 'Admin',
  settings: null as Record<string, unknown> | null,
  posts: [] as Record<string, unknown>[],
  titles: {} as Record<string, string | null>,
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
});
