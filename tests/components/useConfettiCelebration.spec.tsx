import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// `mockConfetti` is the instance the hook creates; `mockDefaultConfetti` the library default.
const { mockConfetti, mockDefaultConfetti } = vi.hoisted(() => {
  const instance = Object.assign(vi.fn(), { reset: vi.fn() });
  const defaultFire = Object.assign(vi.fn(), { reset: vi.fn(), create: vi.fn(() => instance) });
  return { mockConfetti: instance, mockDefaultConfetti: defaultFire };
});

vi.mock('canvas-confetti', () => ({ default: mockDefaultConfetti }));

import {
  useConfettiCelebration,
  CONFETTI_DURATION_MS,
} from '../../src/hooks/useConfettiCelebration';

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  mockConfetti.mockClear();
  mockConfetti.reset.mockClear();
  mockDefaultConfetti.mockClear();
  mockDefaultConfetti.create.mockClear();
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useConfettiCelebration', () => {
  it('rains confetti once active', async () => {
    renderHook(() => useConfettiCelebration(true));
    await waitFor(() => expect(mockConfetti).toHaveBeenCalled());
    expect(mockConfetti.mock.calls[0][0]).toMatchObject({ zIndex: 2000 });
  });

  // The default instance always uses a blob: worker (a per-call `useWorker: false` is ignored),
  // which the production CSP blocks: the canvas stayed empty.
  it('draws through its own instance without a worker', async () => {
    renderHook(() => useConfettiCelebration(true));
    await waitFor(() => expect(mockConfetti).toHaveBeenCalled());
    expect(mockDefaultConfetti.create).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ useWorker: false, resize: true })
    );
    expect(mockDefaultConfetti).not.toHaveBeenCalled();
  });

  it('does nothing while inactive', async () => {
    renderHook(() => useConfettiCelebration(false));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockConfetti).not.toHaveBeenCalled();
  });

  it('does nothing with reduced motion', async () => {
    mockReducedMotion(true);
    renderHook(() => useConfettiCelebration(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockConfetti).not.toHaveBeenCalled();
  });

  it('stops after the duration', async () => {
    const { unmount } = renderHook(() => useConfettiCelebration(true));
    await waitFor(() => expect(mockConfetti).toHaveBeenCalled());
    const realNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(realNow + CONFETTI_DURATION_MS + 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const callsAfterEnd = mockConfetti.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockConfetti.mock.calls.length).toBe(callsAfterEnd);
    unmount();
    vi.restoreAllMocks();
  });

  it('resets the confetti on unmount', async () => {
    const { unmount } = renderHook(() => useConfettiCelebration(true));
    await waitFor(() => expect(mockConfetti).toHaveBeenCalled());
    unmount();
    expect(mockConfetti.reset).toHaveBeenCalled();
  });
});
