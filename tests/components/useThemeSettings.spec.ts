import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemeSettings } from '../../src/hooks/useThemeSettings';
import { THEME_DEFAULTS, THEME_VARIABLES } from '../../src/utils/themeDefaults';

const mockAuth = vi.hoisted(() => ({
  user: { uid: 'admin-uid' },
  role: 'Admin',
}));

const firestore = vi.hoisted(() => {
  // Minimal in-memory Firestore simulation for the hook tests. The hook
  // only ever touches three paths: `app_settings/theme`,
  // `app_settings/activeTheme`, and the `themes` collection. We model
  // each subscriber as a list of callbacks the test fires whenever a
  // write happens so the hook re-derives state correctly.
  const state = {
    docs: new Map(),
    subscribers: new Map(), // path key -> Set of callbacks
    themes: new Map(), // id -> { id, ...data }
    themeSubscribers: new Set(),
    writes: [], // every setDoc / updateDoc / deleteDoc call, for assertions
    batches: [], // every batch.commit() payload, for assertions
  };

  function key(...path) {
    return path.join('/');
  }

  function fireDoc(...path) {
    const k = key(...path);
    const subs = state.subscribers.get(k);
    if (!subs) return;
    const data = state.docs.get(k) || null;
    for (const cb of subs) {
      cb({
        exists: () => Boolean(data),
        data: () => data || {},
      });
    }
  }

  function fireThemes() {
    const docs = Array.from(state.themes.values()).map((value) => ({
      id: value.id,
      data: () => value,
    }));
    for (const cb of state.themeSubscribers) {
      cb({
        docs,
        forEach(cb2) {
          docs.forEach((d) => cb2(d));
        },
      });
    }
  }

  return { state, key, fireDoc, fireThemes };
});

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => {
    // Two call shapes:
    //   1. doc(db, 'app_settings', 'theme')       — args[1] is the first path segment (string)
    //   2. doc(collectionRef)                     — args[0] is the collection ref (object)
    if (args.length >= 2 && typeof args[1] === 'string') {
      const path = args.slice(1) as string[];
      return { type: 'doc', path, id: path[path.length - 1] };
    }
    // doc(collectionRef) — args[0] is the collection.
    const coll = args[0] as { name?: string; id?: string };
    if (coll && coll.name) {
      const newId =
        coll.id && coll.id.startsWith('auto-')
          ? coll.id
          : 'auto-' + Math.random().toString(36).slice(2, 10);
      return { type: 'doc', path: [coll.name, newId], collectionName: coll.name, id: newId };
    }
    return { type: 'doc', path: [], id: 'unknown' };
  },
  collection: (_db: unknown, name: string) => ({
    type: 'collection',
    name,
    id: 'auto-' + Math.random().toString(36).slice(2, 10),
  }),
  onSnapshot: (
    ref: { type: string; path?: string[]; name?: string },
    callback: (snap: unknown) => void
  ) => {
    if (ref.type === 'doc') {
      const k = firestore.key(...(ref.path || []));
      if (!firestore.state.subscribers.has(k)) firestore.state.subscribers.set(k, new Set());
      firestore.state.subscribers.get(k)!.add(callback);
      // Fire immediately so the hook can derive its initial state.
      const data = firestore.state.docs.get(k) || null;
      callback({
        exists: () => Boolean(data),
        data: () => data || {},
      });
      return () => firestore.state.subscribers.get(k)?.delete(callback);
    }
    if (ref.type === 'collection') {
      firestore.state.themeSubscribers.add(callback);
      firestore.fireThemes();
      return () => firestore.state.themeSubscribers.delete(callback);
    }
    return () => {};
  },
  serverTimestamp: () => ({ type: 'serverTimestamp' }),
  setDoc: vi.fn(
    async (ref: { path?: string[]; collectionName?: string }, data: Record<string, unknown>) => {
      firestore.state.writes.push({ op: 'set', ref, data });
      if (ref.collectionName === 'themes' && ref.path) {
        const themeId = ref.path[1];
        firestore.state.themes.set(themeId, { id: themeId, ...data });
        firestore.fireThemes();
        return;
      }
      const k = firestore.key(...(ref.path || []));
      firestore.state.docs.set(k, { ...(firestore.state.docs.get(k) || {}), ...data });
      firestore.fireDoc(...(ref.path || []));
    }
  ),
  updateDoc: vi.fn(async (ref: { path?: string[] }, data: Record<string, unknown>) => {
    firestore.state.writes.push({ op: 'update', ref, data });
    if (!ref.path) return;
    const collectionName = ref.path[0];
    if (collectionName === 'themes') {
      const themeId = ref.path[1];
      const existing = firestore.state.themes.get(themeId);
      if (existing) {
        Object.assign(existing, data);
      }
      firestore.fireThemes();
    }
  }),
  deleteDoc: vi.fn(async (ref: { path?: string[] }) => {
    firestore.state.writes.push({ op: 'delete', ref });
    if (!ref.path) return;
    const k = firestore.key(...ref.path);
    firestore.state.docs.delete(k);
    if (ref.path[0] === 'themes') {
      firestore.state.themes.delete(ref.path[1]);
      firestore.fireThemes();
    } else {
      firestore.fireDoc(...ref.path);
    }
  }),
  writeBatch: () => {
    const ops: Array<{ op: string; ref: any; data?: any }> = [];
    const api = {
      set: (ref: any, data: any) => {
        ops.push({ op: 'set', ref, data });
      },
      update: (ref: any, data: any) => {
        ops.push({ op: 'update', ref, data });
      },
      delete: (ref: any) => {
        ops.push({ op: 'delete', ref });
      },
      commit: async () => {
        firestore.state.batches.push(ops);
        for (const op of ops) {
          if (op.op === 'set') {
            const k = firestore.key(...(op.ref.path || []));
            firestore.state.docs.set(k, {
              ...(firestore.state.docs.get(k) || {}),
              ...op.data,
            });
            firestore.fireDoc(...(op.ref.path || []));
          } else if (op.op === 'delete') {
            const k = firestore.key(...op.ref.path);
            firestore.state.docs.delete(k);
            firestore.fireDoc(...op.ref.path);
          }
        }
      },
    };
    return api;
  },
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));

function resetFirestore() {
  firestore.state.docs.clear();
  firestore.state.themes.clear();
  firestore.state.subscribers.clear();
  firestore.state.themeSubscribers.clear();
  firestore.state.writes = [];
  firestore.state.batches = [];
}

describe('useThemeSettings', () => {
  beforeEach(() => {
    resetFirestore();
    mockAuth.role = 'Admin';
  });

  it('falls back to the bundled defaults when no active theme doc exists', () => {
    const { result } = renderHook(() => useThemeSettings());
    expect(result.current.activeValues['--bg-primary']).toBe(THEME_DEFAULTS['--bg-primary']);
    expect(result.current.activeValues['--accent-primary']).toBe(
      THEME_DEFAULTS['--accent-primary']
    );
  });

  it('initializes the editor from the active theme values', () => {
    firestore.state.docs.set(firestore.key('app_settings', 'theme'), {
      '--accent-primary': '#abcdef',
    });
    const { result } = renderHook(() => useThemeSettings());
    expect(result.current.editorValues['--accent-primary']).toBe('#abcdef');
    expect(result.current.editorBase).toEqual({ kind: 'active' });
  });

  it('exposes variables grouped by group label', () => {
    const { result } = renderHook(() => useThemeSettings());
    const groupNames = result.current.groupedVariables.map((g) => g.group);
    expect(groupNames).toContain('Surfaces');
    expect(groupNames).toContain('Brand');
    expect(groupNames).toContain('Signals');
  });

  it('updateVariable only mutates the editor — never touches Firestore', () => {
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.updateVariable('--accent-primary', '#abcdef');
    });
    expect(result.current.editorValues['--accent-primary']).toBe('#abcdef');
    expect(firestore.state.writes).toHaveLength(0);
    expect(firestore.state.batches).toHaveLength(0);
  });

  it('rejects unknown variable names in updateVariable', () => {
    const { result } = renderHook(() => useThemeSettings());
    expect(() => result.current.updateVariable('--not-a-token', '#fff')).toThrow(/Unbekannte/);
  });

  it('rejects malformed hex values in updateVariable', () => {
    const { result } = renderHook(() => useThemeSettings());
    expect(() => result.current.updateVariable('--accent-primary', '#zzz')).toThrow(
      /Ungültige Farbe/
    );
  });

  it('accepts rgba() values without hex validation', () => {
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.updateVariable('--accent-soft', 'rgba(0, 0, 0, 0.5)');
    });
    expect(result.current.editorValues['--accent-soft']).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('flags isModified / modifiedCount for tokens that differ from the base', () => {
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.updateVariable('--accent-primary', '#123456');
    });
    expect(result.current.isModified('--accent-primary')).toBe(true);
    expect(result.current.isModified('--bg-primary')).toBe(false);
    expect(result.current.modifiedCount).toBe(1);
  });

  it('ignores unknown keys that may exist in a stale or tampered doc', () => {
    firestore.state.docs.set(firestore.key('app_settings', 'theme'), {
      '--accent-primary': '#abcdef',
      '--injected-attack': 'expression(alert(1))',
    });
    const { result } = renderHook(() => useThemeSettings());
    expect(result.current.activeValues['--accent-primary']).toBe('#abcdef');
    expect(result.current.activeValues['--injected-attack']).toBeUndefined();
  });

  it('activateEditor writes the editor values to the live theme doc in a single batch', async () => {
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.updateVariable('--accent-primary', '#123456');
    });
    await act(async () => {
      await result.current.activateEditor();
    });
    expect(firestore.state.batches).toHaveLength(1);
    const ops = firestore.state.batches[0];
    const setOp = ops.find(
      (op) => op.ref.path?.[0] === 'app_settings' && op.ref.path?.[1] === 'theme'
    );
    expect(setOp?.data['--accent-primary']).toBe('#123456');
    // activeTheme pointer should be cleared when publishing without linking
    const deleteOp = ops.find(
      (op) =>
        op.op === 'delete' &&
        op.ref.path?.[0] === 'app_settings' &&
        op.ref.path?.[1] === 'activeTheme'
    );
    expect(deleteOp).toBeDefined();
  });

  it('activateEditor with a linked theme id sets the activeTheme pointer', async () => {
    firestore.state.themes.set('theme-1', {
      id: 'theme-1',
      name: 'Mein Theme',
      values: { ...THEME_DEFAULTS },
    });
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await result.current.activateEditor('theme-1');
    });
    const ops = firestore.state.batches[0];
    const activeSet = ops.find(
      (op) =>
        op.op === 'set' && op.ref.path?.[0] === 'app_settings' && op.ref.path?.[1] === 'activeTheme'
    );
    expect(activeSet?.data.themeId).toBe('theme-1');
    expect(activeSet?.data.name).toBe('Mein Theme');
  });

  it('activateSavedTheme copies the saved theme values to live without touching the editor', async () => {
    firestore.state.themes.set('theme-1', {
      id: 'theme-1',
      name: 'Waldfrühling',
      values: { ...THEME_DEFAULTS, '--accent-primary': '#3f523c' },
    });
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await result.current.activateSavedTheme('theme-1');
    });
    expect(result.current.editorValues['--accent-primary']).toBe(
      THEME_DEFAULTS['--accent-primary']
    );
    const ops = firestore.state.batches[0];
    const themeSet = ops.find(
      (op) => op.ref.path?.[0] === 'app_settings' && op.ref.path?.[1] === 'theme'
    );
    expect(themeSet?.data['--accent-primary']).toBe('#3f523c');
  });

  it('saveAsNewTheme creates a new doc and switches the editor to it', async () => {
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.updateVariable('--accent-primary', '#123456');
    });
    let newId;
    await act(async () => {
      newId = await result.current.saveAsNewTheme({ name: 'Sommerregen', description: '' });
    });
    expect(newId).toBeTruthy();
    expect(firestore.state.themes.get(newId)?.name).toBe('Sommerregen');
    expect(result.current.editorBase).toEqual({
      kind: 'saved',
      themeId: newId,
      name: 'Sommerregen',
    });
  });

  it('saveAsNewTheme validates name length', async () => {
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await expect(result.current.saveAsNewTheme({ name: '', description: '' })).rejects.toThrow(
        /Theme-Name/
      );
      await expect(
        result.current.saveAsNewTheme({ name: 'x'.repeat(51), description: '' })
      ).rejects.toThrow(/Theme-Name/);
    });
  });

  it('saveAsNewTheme rejects non-admin callers', async () => {
    mockAuth.role = 'User';
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await expect(result.current.saveAsNewTheme({ name: 'Foo', description: '' })).rejects.toThrow(
        /Nur Admins/
      );
    });
    mockAuth.role = 'Admin';
  });

  it('saveLoadedTheme updates the currently loaded saved theme', async () => {
    firestore.state.themes.set('theme-1', {
      id: 'theme-1',
      name: 'Wald',
      values: { ...THEME_DEFAULTS },
    });
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.loadIntoEditor('saved', 'theme-1');
      result.current.updateVariable('--accent-primary', '#abcdef');
    });
    await act(async () => {
      await result.current.saveLoadedTheme();
    });
    expect(firestore.state.themes.get('theme-1').values['--accent-primary']).toBe('#abcdef');
  });

  it('saveLoadedTheme throws when no saved theme is loaded', async () => {
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await expect(result.current.saveLoadedTheme()).rejects.toThrow(/Kein gespeichertes/);
    });
  });

  it('renameTheme updates the name and the editor base if the renamed theme is loaded', async () => {
    firestore.state.themes.set('theme-1', {
      id: 'theme-1',
      name: 'Alt',
      values: { ...THEME_DEFAULTS },
    });
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.loadIntoEditor('saved', 'theme-1');
    });
    await act(async () => {
      await result.current.renameTheme('theme-1', 'Neu');
    });
    expect(firestore.state.themes.get('theme-1').name).toBe('Neu');
    expect(result.current.editorBase).toEqual({ kind: 'saved', themeId: 'theme-1', name: 'Neu' });
  });

  it('renameTheme validates name length', async () => {
    firestore.state.themes.set('theme-1', {
      id: 'theme-1',
      name: 'Alt',
      values: { ...THEME_DEFAULTS },
    });
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await expect(result.current.renameTheme('theme-1', '')).rejects.toThrow(/Theme-Name/);
    });
  });

  it('deleteTheme removes the doc and clears the active pointer if it was active', async () => {
    firestore.state.docs.set(firestore.key('app_settings', 'activeTheme'), {
      themeId: 'theme-1',
      name: 'Wald',
    });
    firestore.state.themes.set('theme-1', {
      id: 'theme-1',
      name: 'Wald',
      values: { ...THEME_DEFAULTS },
    });
    const { result } = renderHook(() => useThemeSettings());
    await act(async () => {
      await result.current.deleteTheme('theme-1');
    });
    expect(firestore.state.themes.has('theme-1')).toBe(false);
    expect(firestore.state.docs.has(firestore.key('app_settings', 'activeTheme'))).toBe(false);
  });

  it('deleteTheme bounces the editor back to live when the loaded theme is deleted', async () => {
    firestore.state.docs.set(firestore.key('app_settings', 'theme'), {
      '--accent-primary': '#ffffff',
    });
    firestore.state.themes.set('theme-1', {
      id: 'theme-1',
      name: 'Wald',
      values: { ...THEME_DEFAULTS, '--accent-primary': '#123456' },
    });
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.loadIntoEditor('saved', 'theme-1');
    });
    expect(result.current.editorValues['--accent-primary']).toBe('#123456');
    await act(async () => {
      await result.current.deleteTheme('theme-1');
    });
    expect(result.current.editorBase).toEqual({ kind: 'active' });
    expect(result.current.editorValues['--accent-primary']).toBe('#ffffff');
  });

  it('loadIntoEditor("saved", id) seeds the editor with the theme values', () => {
    firestore.state.themes.set('theme-1', {
      id: 'theme-1',
      name: 'Wald',
      values: { ...THEME_DEFAULTS, '--accent-primary': '#3f523c' },
    });
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.loadIntoEditor('saved', 'theme-1');
    });
    expect(result.current.editorValues['--accent-primary']).toBe('#3f523c');
    expect(result.current.editorBase).toEqual({ kind: 'saved', themeId: 'theme-1', name: 'Wald' });
  });

  it('resetEditorToBase restores the editor values from the loaded theme', () => {
    firestore.state.themes.set('theme-1', {
      id: 'theme-1',
      name: 'Wald',
      values: { ...THEME_DEFAULTS, '--accent-primary': '#3f523c' },
    });
    const { result } = renderHook(() => useThemeSettings());
    act(() => {
      result.current.loadIntoEditor('saved', 'theme-1');
      result.current.updateVariable('--accent-primary', '#000000');
    });
    expect(result.current.editorValues['--accent-primary']).toBe('#000000');
    act(() => {
      result.current.resetEditorToBase();
    });
    expect(result.current.editorValues['--accent-primary']).toBe('#3f523c');
    expect(result.current.modifiedCount).toBe(0);
  });

  it('blocks every mutation for non-admin callers', () => {
    mockAuth.role = 'User';
    const { result } = renderHook(() => useThemeSettings());
    // updateVariable is still allowed locally — it just edits the sandbox.
    act(() => {
      result.current.updateVariable('--accent-primary', '#ffffff');
    });
    expect(result.current.editorValues['--accent-primary']).toBe('#ffffff');
    return act(async () => {
      await expect(result.current.activateEditor()).rejects.toThrow(/Nur Admins/);
      await expect(result.current.activateSavedTheme('x')).rejects.toThrow(/Nur Admins/);
      await expect(result.current.saveAsNewTheme({ name: 'X', description: '' })).rejects.toThrow(
        /Nur Admins/
      );
      await expect(result.current.saveLoadedTheme()).rejects.toThrow(/Nur Admins/);
      await expect(result.current.renameTheme('x', 'Y')).rejects.toThrow(/Nur Admins/);
      await expect(result.current.deleteTheme('x')).rejects.toThrow(/Nur Admins/);
    }).then(() => {
      mockAuth.role = 'Admin';
    });
  });

  describe('live-preview broadcast (BroadcastChannel)', () => {
    it('exposes broadcastEditorValues and previewActive on the hook return', () => {
      const { result } = renderHook(() => useThemeSettings());
      expect(typeof result.current.broadcastEditorValues).toBe('function');
      expect(result.current.previewActive).toBe(false);
    });

    it('broadcastEditorValues does not throw with valid payloads', () => {
      const { result } = renderHook(() => useThemeSettings());
      // happy-dom has BroadcastChannel, so the call should just succeed
      // without throwing — even with non-cloneable payloads it must
      // degrade gracefully rather than crash the editor.
      expect(() => result.current.broadcastEditorValues({})).not.toThrow();
      expect(() =>
        result.current.broadcastEditorValues({
          '--accent-primary': '#123456',
        })
      ).not.toThrow();
    });

    it('received preview values override active values when painted to :root', async () => {
      firestore.state.docs.set(firestore.key('app_settings', 'theme'), {
        '--accent-primary': '#000000',
      });

      const { result } = renderHook(() => useThemeSettings());
      // Let the Firestore snapshot land + apply to :root.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(
        getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
      ).toBe('#000000');

      const channel = new BroadcastChannel('spiri-theme-preview');
      try {
        await act(async () => {
          channel.postMessage({
            type: 'theme-editor-values',
            values: { ...THEME_DEFAULTS, '--accent-primary': '#ff00ff' },
          });
          await new Promise((r) => setTimeout(r, 10));
        });
      } finally {
        channel.close();
      }

      expect(
        getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
      ).toBe('#ff00ff');
      // activeValues on the hook still reflects the Firestore state, not
      // the preview — that separation is the whole point of the hook's
      // three orthogonal concerns.
      expect(result.current.activeValues['--accent-primary']).toBe('#000000');
    });

    it('ignores messages with an unknown type or a non-object payload', async () => {
      const { result } = renderHook(() => useThemeSettings());

      const channel = new BroadcastChannel('spiri-theme-preview');
      try {
        await act(async () => {
          channel.postMessage({ type: 'something-else', values: { x: 1 } });
          channel.postMessage(null);
          channel.postMessage('plain string');
          channel.postMessage({ type: 'theme-editor-values', values: 'not-an-object' });
          await new Promise((r) => setTimeout(r, 10));
        });
        expect(result.current.previewActive).toBe(false);
      } finally {
        channel.close();
      }
    });
  });
});
