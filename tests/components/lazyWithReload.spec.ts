import { describe, it, expect, vi, afterEach } from 'vitest';
import { CHUNK_RELOAD_KEY, loadWithReload } from '../../src/lib/lazyWithReload';
import { NETWORK_SLOW_EVENT, SLOW_LOAD_THRESHOLD_MS } from '../../src/utils/networkStatus';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('loadWithReload', () => {
  it('returns the page module and clears an earlier reload marker', async () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: '1' });
    const reload = vi.fn();
    const mod = { default: () => null };
    await expect(loadWithReload(() => Promise.resolve(mod), { storage, reload })).resolves.toBe(
      mod
    );
    expect(reload).not.toHaveBeenCalled();
    expect(storage.data.has(CHUNK_RELOAD_KEY)).toBe(false);
  });

  it('reloads the page once when a page chunk fails to load (stale tab after a deploy)', async () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const pending = loadWithReload(() => Promise.reject(new Error('Failed to fetch')), {
      storage,
      reload,
    });
    // The promise never settles: Suspense keeps the spinner while the page reloads.
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
    void pending;
  });

  it('shows the error instead of reloading again when the reload did not help', async () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: '1' });
    const reload = vi.fn();
    const error = new Error('Failed to fetch');
    await expect(loadWithReload(() => Promise.reject(error), { storage, reload })).rejects.toBe(
      error
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when storage is unavailable, so it can never loop', async () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const reload = vi.fn();
    const error = new Error('Failed to fetch');
    await expect(loadWithReload(() => Promise.reject(error), { storage, reload })).rejects.toBe(
      error
    );
    expect(reload).not.toHaveBeenCalled();
  });

  describe('offline', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('does not reload while offline, but loads the page once the connection is back', async () => {
      const storage = memoryStorage();
      const reload = vi.fn();
      let online = false;
      let backOnline: () => void = () => {};
      const mod = { default: () => null };
      const importer = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
        .mockResolvedValue(mod);
      const pending = loadWithReload(importer, {
        storage,
        reload,
        isOnline: () => online,
        waitForOnline: () => new Promise<void>((resolve) => (backOnline = resolve)),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(reload).not.toHaveBeenCalled();
      expect(storage.data.has(CHUNK_RELOAD_KEY)).toBe(false);

      online = true;
      backOnline();
      await expect(pending).resolves.toBe(mod);
      expect(importer).toHaveBeenCalledTimes(2);
      expect(reload).not.toHaveBeenCalled();
    });

    it('waits for the browser online event by default (also for a failed preload)', async () => {
      let online = false;
      vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
      const reload = vi.fn();
      const mod = { default: () => null };
      const importer = vi
        .fn()
        .mockRejectedValueOnce(new Error('Unable to preload CSS for /assets/AdminPage.css'))
        .mockResolvedValue(mod);
      const pending = loadWithReload(importer, { storage: memoryStorage(), reload });
      await new Promise((r) => setTimeout(r, 0));
      expect(reload).not.toHaveBeenCalled();
      online = true;
      window.dispatchEvent(new Event('online'));
      await expect(pending).resolves.toBe(mod);
      expect(reload).not.toHaveBeenCalled();
    });

    it('reports a page chunk that takes very long as a slow connection', async () => {
      vi.useFakeTimers();
      const listener = vi.fn();
      window.addEventListener(NETWORK_SLOW_EVENT, listener);
      void loadWithReload(() => new Promise(() => {}), {
        storage: memoryStorage(),
        reload: vi.fn(),
      });
      vi.advanceTimersByTime(SLOW_LOAD_THRESHOLD_MS);
      window.removeEventListener(NETWORK_SLOW_EVENT, listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
        source: 'page',
        reason: 'timeout',
      });
    });
  });
});
