import { useSyncExternalStore } from 'react';
import {
  LAYOUT_TOKENS,
  LAYOUT_TOKENS_BY_NAME,
  sanitizeLayoutOverrides,
  validateLayoutValue,
} from '../utils/layoutTokens';

// Tiny external store for the layout tokens (spacing, font sizes, radii).
//
//   published  what visitors see: `app_settings/layout`, cached in
//              localStorage so a returning visitor gets the right values before
//              the first paint (no layout jump while Firestore loads).
//   draft      a designer's unpublished work. Lives only in that browser, and
//              is only painted onto the page while the Design-Modus is on, so
//              it can never leak to visitors.
//
// Both are maps of overrides: a token that is missing keeps the stylesheet
// default from tokens.css / index.css.

const CACHE_KEY = 'layout-tokens:v1';
const DRAFT_KEY = 'layout-draft:v1';

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / blocked storage: the store still works, just not persisted.
  }
}

export function sameOverrides(a, b) {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

let state = { published: {}, draft: null, designMode: false, publishedLoaded: false };
const listeners = new Set();

function effectiveOverrides(s = state) {
  return s.designMode && s.draft ? s.draft : s.published;
}

export function applyToRoot() {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  const eff = effectiveOverrides();
  for (const token of LAYOUT_TOKENS) {
    const value = eff[token.name];
    if (value) style.setProperty(token.name, value);
    else style.removeProperty(token.name);
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  applyToRoot();
  listeners.forEach((l) => l());
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getState = () => state;

export function useLayoutState() {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Call once before React renders: paint the cached values immediately. */
export function initLayoutFromCache() {
  const cached = sanitizeLayoutOverrides(readJson(CACHE_KEY));
  const draft = readJson(DRAFT_KEY);
  setState({ published: cached, draft: draft ? sanitizeLayoutOverrides(draft) : null });
}

/** Called with the live Firestore document. */
export function setPublished(values) {
  const clean = sanitizeLayoutOverrides(values);
  writeJson(CACHE_KEY, clean);
  setState({ published: clean, publishedLoaded: true });
}

export function markPublishedLoaded() {
  if (!state.publishedLoaded) setState({ publishedLoaded: true });
}

export function setDesignMode(on) {
  setState({ designMode: Boolean(on) });
}

export function getEffectiveValue(name) {
  const token = LAYOUT_TOKENS_BY_NAME[name];
  if (!token) return undefined;
  return effectiveOverrides()[name] ?? token.default;
}

/** Validates, then stores the value in the draft. Throws on invalid input. */
export function setDraftValue(name, raw) {
  const token = LAYOUT_TOKENS_BY_NAME[name];
  const value = validateLayoutValue(token, raw);
  const base = { ...(state.draft ?? state.published) };
  if (value === token.default) delete base[name];
  else base[name] = value;
  commitDraft(base);
}

export function resetDraftValue(name) {
  const base = { ...(state.draft ?? state.published) };
  delete base[name];
  commitDraft(base);
}

/** Replace the whole draft, e.g. when restoring a history entry. */
export function loadDraft(values) {
  commitDraft(sanitizeLayoutOverrides(values));
}

export function discardDraft() {
  writeJson(DRAFT_KEY, null);
  setState({ draft: null });
}

function commitDraft(overrides) {
  // A draft identical to the published state is no draft at all.
  const draft = sameOverrides(overrides, state.published) ? null : overrides;
  writeJson(DRAFT_KEY, draft);
  setState({ draft });
}

/** One entry per token whose draft value differs from the published one. */
export function listChanges(s = state) {
  if (!s.draft) return [];
  const changes = [];
  for (const token of LAYOUT_TOKENS) {
    const from = s.published[token.name] ?? token.default;
    const to = s.draft[token.name] ?? token.default;
    if (from !== to) changes.push({ token: token.name, label: token.label, from, to });
  }
  return changes;
}

/** After a successful publish the draft equals the published state. */
export function afterPublish(values) {
  writeJson(DRAFT_KEY, null);
  setPublished(values);
  setState({ draft: null });
}

// Test hook: reset module state between specs.
export function __resetLayoutStoreForTests() {
  state = { published: {}, draft: null, designMode: false, publishedLoaded: false };
  listeners.clear();
}
