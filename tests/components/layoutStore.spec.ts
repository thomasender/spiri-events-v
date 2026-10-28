import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetLayoutStoreForTests,
  afterPublish,
  discardDraft,
  getEffectiveValue,
  getState,
  initLayoutFromCache,
  listChanges,
  loadDraft,
  resetDraftValue,
  setDesignMode,
  setDraftValue,
  setPublished,
} from '../../src/lib/layoutStore';

const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('style');
  __resetLayoutStoreForTests();
});

describe('layoutStore', () => {
  it('paints published values and removes them again when reset to default', () => {
    setPublished({ '--card-padding': '24px' });
    expect(rootVar('--card-padding')).toBe('24px');
    setPublished({});
    expect(rootVar('--card-padding')).toBe('');
  });

  it('ignores unknown or invalid published values', () => {
    setPublished({ '--card-padding': 'expression(1)', '--evil': '1px' });
    expect(rootVar('--card-padding')).toBe('');
    expect(rootVar('--evil')).toBe('');
  });

  it('keeps the draft off the page until the Design-Modus is on', () => {
    setPublished({ '--card-padding': '24px' });
    setDraftValue('--card-padding', '32px');
    expect(rootVar('--card-padding')).toBe('24px');
    setDesignMode(true);
    expect(rootVar('--card-padding')).toBe('32px');
    setDesignMode(false);
    expect(rootVar('--card-padding')).toBe('24px');
  });

  it('rejects invalid draft values and leaves the draft alone', () => {
    expect(() => setDraftValue('--card-padding', '999px')).toThrow();
    expect(getState().draft).toBeNull();
  });

  it('a draft equal to the published state is no draft', () => {
    setPublished({ '--card-padding': '24px' });
    setDraftValue('--card-gap', '10px');
    expect(getState().draft).not.toBeNull();
    resetDraftValue('--card-gap');
    expect(getState().draft).toBeNull();
  });

  it('lists changes against the published state, including resets to default', () => {
    setPublished({ '--card-padding': '24px' });
    setDraftValue('--card-padding', '16px'); // back to default
    setDraftValue('--grid-gap', '30px');
    expect(listChanges().map((c) => [c.token, c.from, c.to])).toEqual([
      ['--grid-gap', '20px', '30px'],
      ['--card-padding', '24px', '16px'],
    ]);
    setDesignMode(true);
    expect(getEffectiveValue('--card-padding')).toBe('16px');
    expect(getEffectiveValue('--grid-gap')).toBe('30px');
  });

  it('persists the draft and restores it after a reload', () => {
    setDraftValue('--card-gap', '12px');
    __resetLayoutStoreForTests();
    initLayoutFromCache();
    expect(getState().draft).toEqual({ '--card-gap': '12px' });
  });

  it('restores the published cache before the first render', () => {
    setPublished({ '--btn-gap': '12px' });
    __resetLayoutStoreForTests();
    document.documentElement.removeAttribute('style');
    initLayoutFromCache();
    expect(rootVar('--btn-gap')).toBe('12px');
  });

  it('afterPublish clears the draft and adopts the values', () => {
    setDraftValue('--card-gap', '12px');
    afterPublish({ '--card-gap': '12px' });
    expect(getState().draft).toBeNull();
    expect(getState().published).toEqual({ '--card-gap': '12px' });
  });

  it('loadDraft / discardDraft', () => {
    loadDraft({ '--row-gap': '8px', '--bogus': '1px' });
    expect(getState().draft).toEqual({ '--row-gap': '8px' });
    discardDraft();
    expect(getState().draft).toBeNull();
  });
});
