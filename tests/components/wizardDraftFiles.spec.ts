import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GUEST_DRAFT_MAX_AGE_MS } from '../../src/utils/wizardDraftStorage';

// Fresh module (its in-memory copy) and a fresh IndexedDB for every test, so the
// tests below really read back from IndexedDB, as after a page reload.
async function freshModule() {
  vi.resetModules();
  return import('../../src/utils/wizardDraftFiles');
}

const photo = (name = 'cover.jpg', body = 'cover-bytes') =>
  new File([body], name, { type: 'image/jpeg' });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('wizardDraftFiles (photos of the event wizard draft)', () => {
  it('stores the photos and gives them back after a reload', async () => {
    const before = await freshModule();
    expect(
      await before.saveWizardDraftFiles('guest', {
        cover: photo(),
        instagram: photo('insta.png', 'insta'),
      })
    ).toBe(true);

    const after = await freshModule();
    const files = await after.loadWizardDraftFiles('guest');
    expect(files?.cover?.name).toBe('cover.jpg');
    expect(files?.cover?.type).toBe('image/jpeg');
    expect(await files?.cover?.text()).toBe('cover-bytes');
    expect(files?.instagram?.name).toBe('insta.png');
  });

  it('keeps the photos in memory for the running page (back from /login without reload)', async () => {
    const mod = await freshModule();
    const cover = photo();
    void mod.saveWizardDraftFiles('guest', { cover, instagram: null });
    expect(mod.peekWizardDraftFiles('guest')?.cover).toBe(cover);
    expect(mod.peekWizardDraftFiles('user-1')).toBeNull();
  });

  it('moves the guest photos onto the account after the login', async () => {
    const before = await freshModule();
    await before.saveWizardDraftFiles('guest', { cover: photo() });

    const after = await freshModule();
    expect(await after.adoptGuestWizardDraftFiles('user-1')).toBe(true);
    expect((await after.loadWizardDraftFiles('user-1'))?.cover?.name).toBe('cover.jpg');
    expect(await after.loadWizardDraftFiles('guest')).toBeNull();
  });

  it('removes the photos once the event is saved, and when both are gone', async () => {
    const mod = await freshModule();
    await mod.saveWizardDraftFiles('user-1', { cover: photo() });
    await mod.clearWizardDraftFiles('user-1');
    expect(await (await freshModule()).loadWizardDraftFiles('user-1')).toBeNull();

    await mod.saveWizardDraftFiles('user-2', { cover: photo() });
    await mod.saveWizardDraftFiles('user-2', { cover: null, instagram: null });
    expect(await (await freshModule()).loadWizardDraftFiles('user-2')).toBeNull();
  });

  it('drops photos older than about two weeks', async () => {
    const mod = await freshModule();
    await mod.saveWizardDraftFiles('guest', { cover: photo() });
    await mod.saveWizardDraftFiles('user-1', { cover: photo() });
    const later = Date.now() + GUEST_DRAFT_MAX_AGE_MS + 1000;

    const reloaded = await freshModule();
    expect(await reloaded.loadWizardDraftFiles('guest', later)).toBeNull();
    await reloaded.pruneWizardDraftFiles(later);
    expect(await reloaded.loadWizardDraftFiles('user-1')).toBeNull();
  });

  it('is best-effort without IndexedDB', async () => {
    // @ts-expect-error simulate a browser without IndexedDB
    delete globalThis.indexedDB;
    const mod = await freshModule();
    expect(await mod.saveWizardDraftFiles('guest', { cover: photo() })).toBe(false);
    const reloaded = await freshModule();
    expect(await reloaded.loadWizardDraftFiles('guest')).toBeNull();
    await expect(reloaded.adoptGuestWizardDraftFiles('user-1')).resolves.toBe(false);
  });
});
