import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemeSettings } from '../../src/hooks/useThemeSettings';
import { THEME_DEFAULTS, THEME_VARIABLES } from '../../src/utils/themeDefaults';

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'admin-uid' },
  role: 'Admin',
}));

const mockThemeState = vi.hoisted(() => ({
  data: null as Record<string, unknown> | null,
  callbacks: [] as Array<
    (snap: { exists: () => boolean; data: () => Record<string, unknown> }) => void
  >,
  setCalls: [] as Array<{
    ref: { path: string[] };
    data: Record<string, unknown>;
    options?: unknown;
  }>,
  batchUpdates: [] as Array<{ ref: { path: string[] }; data: Record<string, unknown> }>,
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => {
    const ref: { type: string; path: string[]; set: unknown } = {
      type: 'doc',
      path,
      set: null,
    };
    // The hook calls `ref.set(...)` as a shortcut for `setDoc(ref, ...)`,
    // so the mock must expose a `set` method that mirrors setDoc.
    ref.set = async (data: Record<string, unknown>, options?: unknown) => {
      mockThemeState.setCalls.push({ ref, data, options });
      mockThemeState.data = { ...(mockThemeState.data || {}), ...data };
      mockThemeState.callbacks.forEach((cb) =>
        cb({
          exists: () => Boolean(mockThemeState.data),
          data: () => mockThemeState.data || {},
        })
      );
    };
    return ref;
  },
  onSnapshot: (_ref: unknown, callback: (snap: unknown) => void) => {
    mockThemeState.callbacks.push(callback);
    callback({
      exists: () => Boolean(mockThemeState.data),
      data: () => mockThemeState.data || {},
    });
    return () => {};
  },
  serverTimestamp: () => ({ type: 'serverTimestamp' }),
  setDoc: vi.fn(
    async (ref: { path: string[] }, data: Record<string, unknown>, options?: unknown) => {
      mockThemeState.setCalls.push({ ref, data, options });
      mockThemeState.data = { ...(mockThemeState.data || {}), ...data };
      mockThemeState.callbacks.forEach((cb) =>
        cb({
          exists: () => Boolean(mockThemeState.data),
          data: () => mockThemeState.data || {},
        })
      );
    }
  ),
  writeBatch: () => {
    const ops: Array<{ type: string; ref: unknown; data: unknown }> = [];
    return {
      set: (ref, data) => {
        ops.push({ type: 'set', ref, data });
      },
      commit: async () => {
        for (const op of ops) {
          mockThemeState.batchUpdates.push({ ref: op.ref, data: op.data });
          mockThemeState.data = { ...(mockThemeState.data || {}), ...op.data };
        }
        mockThemeState.callbacks.forEach((cb) =>
          cb({
            exists: () => Boolean(mockThemeState.data),
            data: () => mockThemeState.data || {},
          })
        );
      },
    };
  },
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));

const resetTheme = () => {
  mockThemeState.data = null;
  mockThemeState.callbacks = [];
  mockThemeState.setCalls = [];
  mockThemeState.batchUpdates = [];
};

describe('useThemeSettings', () => {
  beforeEach(() => {
    resetTheme();
    mockAuth.role = 'Admin';
  });

  it('falls back to the bundled defaults when no doc exists yet', () => {
    const { result } = renderHook(() => useThemeSettings());
    expect(result.current.settings['--bg-primary']).toBe(THEME_DEFAULTS['--bg-primary']);
    expect(result.current.settings['--accent-primary']).toBe(THEME_DEFAULTS['--accent-primary']);
  });

  it('exposes variables grouped by group label', () => {
    const { result } = renderHook(() => useThemeSettings());
    const groupNames = result.current.groupedVariables.map((g) => g.group);
    expect(groupNames).toContain('Surfaces');
    expect(groupNames).toContain('Brand');
    expect(groupNames).toContain('Signals');
  });

  it('updates a single variable and reflects it in settings', async () => {
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await result.current.updateVariable('--accent-primary', '#abcdef');
    });
    expect(result.current.settings['--accent-primary']).toBe('#abcdef');
    expect(mockThemeState.setCalls).toHaveLength(1);
    const call = mockThemeState.setCalls[0];
    expect(call.ref.path).toEqual(['app_settings', 'theme']);
    expect(call.data['--accent-primary']).toBe('#abcdef');
  });

  it('rejects updates for unknown variable names', async () => {
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await expect(result.current.updateVariable('--not-a-token', '#ffffff')).rejects.toThrow(
        /Unbekannte/
      );
    });
  });

  it('rejects malformed hex values', async () => {
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await expect(result.current.updateVariable('--accent-primary', '#zzz')).rejects.toThrow(
        /Ungültige Farbe/
      );
    });
  });

  it('accepts rgba() values without hex validation', async () => {
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await result.current.updateVariable('--accent-soft', 'rgba(0, 0, 0, 0.5)');
    });
    expect(result.current.settings['--accent-soft']).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('resetToDefault writes the bundled default for the token', async () => {
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await result.current.updateVariable('--accent-primary', '#123456');
    });
    mockThemeState.setCalls = [];
    await act(async () => {
      await result.current.resetToDefault('--accent-primary');
    });
    expect(mockThemeState.setCalls[0].data['--accent-primary']).toBe(
      THEME_DEFAULTS['--accent-primary']
    );
  });

  it('resetAllToDefaults writes every token in a single batch', async () => {
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await result.current.resetAllToDefaults();
    });
    expect(mockThemeState.batchUpdates).toHaveLength(1);
    const written = mockThemeState.batchUpdates[0].data;
    for (const variable of THEME_VARIABLES) {
      expect(written[variable.name]).toBe(variable.defaultValue);
    }
  });

  it('flags isModified / modifiedCount for tokens that differ from the default', () => {
    mockThemeState.data = { '--accent-primary': '#123456' };
    mockThemeState.callbacks.forEach((cb) =>
      cb({ exists: () => true, data: () => mockThemeState.data || {} })
    );
    const { result } = renderHook(() => useThemeSettings());
    expect(result.current.isModified('--accent-primary')).toBe(true);
    expect(result.current.isModified('--bg-primary')).toBe(false);
    expect(result.current.modifiedCount).toBe(1);
  });

  it('refuses to mutate when the user is not admin', async () => {
    mockAuth.role = 'User';
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await expect(result.current.updateVariable('--accent-primary', '#ffffff')).rejects.toThrow(
        /Nur Admins/
      );
      await expect(result.current.resetAllToDefaults()).rejects.toThrow(/Nur Admins/);
    });
    mockAuth.role = 'Admin';
  });

  it('ignores unknown keys that may exist in a stale or tampered doc', () => {
    mockThemeState.data = {
      '--accent-primary': '#abcdef',
      '--injected-attack': 'expression(alert(1))',
    };
    mockThemeState.callbacks.forEach((cb) =>
      cb({ exists: () => true, data: () => mockThemeState.data || {} })
    );
    const { result } = renderHook(() => useThemeSettings());
    expect(result.current.settings['--accent-primary']).toBe('#abcdef');
    expect(result.current.settings['--injected-attack']).toBeUndefined();
  });
});
