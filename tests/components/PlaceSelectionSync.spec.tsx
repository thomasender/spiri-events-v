import { render, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Snap = { exists: () => boolean; data: () => Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  authListener: null as null | ((user: { uid: string } | null) => void),
  snapListener: null as null | ((snap: { exists: () => boolean; data: () => unknown }) => void),
  unsubSnap: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
  setPlaceSelection: vi.fn(),
  placeSelection: null as unknown,
}));

vi.mock('../../src/lib/firebase', () => ({ auth: { currentUser: { uid: 'u1' } }, db: {} }));
vi.mock('../../src/hooks/useRegion', () => ({
  useRegion: () => ({
    placeSelection: mocks.placeSelection,
    setPlaceSelection: mocks.setPlaceSelection,
  }),
}));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: { uid: string } | null) => void) => {
    mocks.authListener = cb;
    return () => {};
  },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: (_ref: unknown, cb: (snap: Snap) => void) => {
    mocks.snapListener = cb;
    return mocks.unsubSnap;
  },
  updateDoc: mocks.updateDoc,
}));

import PlaceSelectionSync from '../../src/components/PlaceSelectionSync';

const chosen = {
  label: 'München',
  lat: 48.137,
  lon: 11.575,
  radiusKm: 25,
  regionId: 'muenchen',
  source: 'search',
  updatedAt: 1000,
};

beforeEach(() => {
  mocks.authListener = null;
  mocks.snapListener = null;
  mocks.unsubSnap.mockClear();
  mocks.updateDoc.mockClear();
  mocks.setPlaceSelection.mockClear();
  mocks.placeSelection = chosen;
});

describe('PlaceSelectionSync', () => {
  it('writes the place chosen before registering once the new profile doc exists', async () => {
    render(<PlaceSelectionSync />);
    act(() => {
      mocks.authListener!({ uid: 'u1' });
    });
    // Right after sign-up the profile doc does not exist yet.
    await act(async () => {
      mocks.snapListener!({ exists: () => false, data: () => ({}) });
    });
    expect(mocks.updateDoc).not.toHaveBeenCalled();

    // Registration creates it a moment later: the browser's choice reaches the profile.
    await act(async () => {
      mocks.snapListener!({ exists: () => true, data: () => ({ displayName: 'Neu' }) });
    });
    await waitFor(() =>
      expect(mocks.updateDoc).toHaveBeenCalledWith(
        { path: 'users/u1' },
        { placeSelection: expect.objectContaining({ regionId: 'muenchen' }) }
      )
    );
    expect(mocks.unsubSnap).toHaveBeenCalled();
  });

  it('takes the profile choice into a browser that has none (other device)', async () => {
    mocks.placeSelection = null;
    render(<PlaceSelectionSync />);
    act(() => {
      mocks.authListener!({ uid: 'u1' });
    });
    await act(async () => {
      mocks.snapListener!({ exists: () => true, data: () => ({ placeSelection: chosen }) });
    });
    expect(mocks.setPlaceSelection).toHaveBeenCalledWith(
      expect.objectContaining({ regionId: 'muenchen' }),
      { keepTime: true }
    );
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});
