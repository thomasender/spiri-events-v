import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockConfetti = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));

vi.mock('canvas-confetti', () => ({ default: mockConfetti }));

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
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useConfettiCelebration', () => {
  it('rains confetti once active', async () => {
    renderHook(() => useConfettiCelebration(true));
    await waitFor(() => expect(mockConfetti).toHaveBeenCalled());
    expect(mockConfetti.mock.calls[0][0]).toMatchObject({ useWorker: false, zIndex: 2000 });
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
