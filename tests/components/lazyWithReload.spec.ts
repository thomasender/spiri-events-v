import { describe, it, expect, vi } from 'vitest';
import { CHUNK_RELOAD_KEY, loadWithReload } from '../../src/lib/lazyWithReload';

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
});
