import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegionAboutTab from '../../src/components/RegionAboutTab';
import { STATIC_REGIONS } from '../../src/utils/regions';

const state = vi.hoisted(() => ({
  role: 'Admin' as string | null,
  staffRegionIds: [] as string[],
  stored: {} as Record<string, string>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ col, id }),
  serverTimestamp: () => 'TS',
  updateDoc: async (_ref: unknown, data: Record<string, unknown>) => {
    state.updates.push(data);
  },
}));
vi.mock('../../src/lib/imageUpload', () => ({
  uploadRegionImage: vi.fn(),
  MAX_INPUT_SIZE_BYTES: 1000,
}));
vi.mock('../../src/components/RichTextEditorLazy', () => ({ default: () => null }));
vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ role: state.role, staffRegionIds: state.staffRegionIds }),
}));
vi.mock('../../src/hooks/useRegions', () => ({
  refreshRegions: vi.fn(async () => undefined),
  useRegions: () => ({
    regions: STATIC_REGIONS.filter((r) => r.id === 'tirol' || r.id === 'vorarlberg').map((r) => ({
      ...r,
      ...(state.stored[r.id] ? { instagramHandle: state.stored[r.id] } : {}),
    })),
    loading: false,
  }),
}));

beforeEach(() => {
  state.role = 'Admin';
  state.staffRegionIds = [];
  state.stored = {};
  state.updates = [];
});

const pickTirol = () =>
  fireEvent.change(screen.getByTestId('region-about-region'), { target: { value: 'tirol' } });

describe('RegionAboutTab Instagram name', () => {
  it('Super-Admin saves a normalised handle', async () => {
    render(<RegionAboutTab />);
    pickTirol();
    fireEvent.change(screen.getByTestId('region-about-instagram-input'), {
      target: { value: 'https://www.instagram.com/tribe.tirol/' },
    });
    fireEvent.click(screen.getByTestId('region-about-save'));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0].instagramHandle).toBe('@tribe.tirol');
  });

  it('empty input saves null', async () => {
    state.stored = { tirol: '@alt' };
    render(<RegionAboutTab />);
    pickTirol();
    const input = screen.getByTestId('region-about-instagram-input') as HTMLInputElement;
    expect(input.value).toBe('@alt');
    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.click(screen.getByTestId('region-about-save'));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0].instagramHandle).toBeNull();
  });

  it('invalid input shows an error and does not save', async () => {
    render(<RegionAboutTab />);
    pickTirol();
    fireEvent.change(screen.getByTestId('region-about-instagram-input'), {
      target: { value: 'kein gültiger name!' },
    });
    expect(screen.getByTestId('region-about-instagram-error')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('region-about-save'));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it('has no connect or token UI', () => {
    render(<RegionAboutTab />);
    expect(screen.queryByText(/verbinden/i)).toBeNull();
    expect(screen.getByTestId('region-about-instagram').textContent).toMatch(/nur angezeigt/);
  });

  it('a moderator sees no input and never writes the field', async () => {
    state.role = 'RegionModerator';
    state.staffRegionIds = ['vorarlberg'];
    render(<RegionAboutTab />);
    expect(screen.queryByTestId('region-about-instagram-input')).toBeNull();
    expect(screen.getByTestId('region-about-instagram-readonly').textContent).toContain(
      '@tribevorarlberg'
    );
    fireEvent.click(screen.getByTestId('region-about-save'));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0]).not.toHaveProperty('instagramHandle');
  });

  it('a moderator of a region without a name sees no section', () => {
    state.role = 'RegionModerator';
    state.staffRegionIds = ['tirol'];
    render(<RegionAboutTab />);
    expect(screen.queryByTestId('region-about-instagram')).toBeNull();
  });
});
