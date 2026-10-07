// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  directory: {
    entries: [] as unknown[],
    loading: false,
    error: null as string | null,
    setHidden: vi.fn(),
  },
  auth: { role: 'User' },
}));

vi.mock('../../src/hooks/useDirectory', () => ({ useDirectory: () => mocks.directory }));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../src/hooks/useCategoryRegistry', () => ({
  useCategoryRegistry: () => ({
    categories: [
      { id: 'yoga', name: 'Yoga' },
      { id: 'coaching', name: 'Coaching' },
    ],
    colorByName: new Map([['Yoga', '#c48e6a']]),
  }),
}));
vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import DirectoryPage from '../../src/pages/DirectoryPage';

const e = (uid: string, over = {}) => ({
  uid,
  slug: uid,
  displayName: uid,
  bio: '',
  photoURL: null,
  categories: ['Yoga'],
  regions: [],
  hidden: false,
  ...over,
});

const renderPage = (url = '/verzeichnis') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <DirectoryPage />
    </MemoryRouter>
  );

const names = () =>
  screen
    .queryAllByRole('heading', { level: 2 })
    .map((h) => h.textContent)
    .filter((t) => !['Kategorie', 'Region'].includes(t || ''));

beforeEach(() => {
  mocks.auth.role = 'User';
  mocks.directory.loading = false;
  mocks.directory.error = null;
  mocks.directory.setHidden = vi.fn().mockResolvedValue(undefined);
  mocks.directory.entries = [
    e('zoe', { displayName: 'Zoe', categories: ['Coaching'], regions: ['Online'] }),
    e('anna', { displayName: 'Anna', regions: ['Dornbirn'] }),
    e('geheim', { displayName: 'Geheim', hidden: true }),
  ];
});

describe('DirectoryPage', () => {
  it('lists entries alphabetically and hides moderated ones from visitors', () => {
    renderPage();
    expect(names()).toEqual(['Anna', 'Zoe']);
    expect(screen.getByTestId('directory-count')).toHaveTextContent('2 Einträge');
    expect(screen.queryByTestId('directory-toggle-hidden')).not.toBeInTheDocument();
  });

  it('filters by category chip and shows counts', () => {
    renderPage();
    expect(
      within(screen.getByTestId('directory-category-Yoga')).getByText('1')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('directory-category-Coaching'));
    expect(names()).toEqual(['Zoe']);
    fireEvent.click(screen.getByTestId('directory-clear'));
    expect(names()).toEqual(['Anna', 'Zoe']);
  });

  it('reads filters from the URL', () => {
    renderPage('/verzeichnis?kategorie=Yoga&region=Dornbirn');
    expect(names()).toEqual(['Anna']);
    expect(screen.getByTestId('directory-category-Yoga')).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches by name', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('directory-search'), { target: { value: 'zo' } });
    expect(names()).toEqual(['Zoe']);
  });

  it('shows an empty state with a reset when nothing matches', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('directory-search'), { target: { value: 'xyz' } });
    expect(screen.getByTestId('directory-empty')).toHaveTextContent(/Keine Treffer/);
  });

  it('lets admins see hidden entries and restore them', async () => {
    mocks.auth.role = 'Admin';
    renderPage();
    expect(names()).toContain('Geheim');
    const card = screen
      .getAllByTestId('directory-card')
      .find((c) => c.textContent?.includes('Geheim'))!;
    fireEvent.click(within(card).getByTestId('directory-toggle-hidden'));
    await waitFor(() => expect(mocks.directory.setHidden).toHaveBeenCalledWith('geheim', false));
  });

  it('shows a CTA at the top linking to the profile directory section', () => {
    renderPage();
    const cta = screen.getByTestId('directory-top-cta');
    expect(cta.getAttribute('href')).toBe('/profil#verzeichnis');
  });
});
