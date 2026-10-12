import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase';

// One shared store for the signed-in user's favorites: a single auth listener
// and a single Firestore listener no matter how many hearts are on screen.
// Favorites live in users/{uid}/favorites/{eventId} (one doc per event series).

export const PENDING_FAVORITE_KEY = 'pendingFavorite';

let state = { ready: false, uid: null, ids: new Set() };
const listeners = new Set();
let authUnsub = null;
let favUnsub = null;

function setState(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function readPending() {
  try {
    return sessionStorage.getItem(PENDING_FAVORITE_KEY);
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_FAVORITE_KEY);
  } catch {}
}

export function setPendingFavorite(eventId) {
  try {
    sessionStorage.setItem(PENDING_FAVORITE_KEY, eventId);
  } catch {}
}

function start() {
  authUnsub = onAuthStateChanged(auth, (user) => {
    favUnsub?.();
    favUnsub = null;
    if (!user) {
      setState({ ready: true, uid: null, ids: new Set() });
      return;
    }
    setState({ ready: true, uid: user.uid, ids: new Set() });
    favUnsub = onSnapshot(
      collection(db, 'users', user.uid, 'favorites'),
      (snap) => setState({ ids: new Set(snap.docs.map((d) => d.id)) }),
      () => setState({ ids: new Set() })
    );
    // A heart clicked while logged out is applied once the user is back.
    const pending = readPending();
    if (pending) {
      clearPending();
      setDoc(doc(db, 'users', user.uid, 'favorites', pending), {
        createdAt: serverTimestamp(),
      }).catch(() => {});
    }
  });
}

function stop() {
  authUnsub?.();
  favUnsub?.();
  authUnsub = null;
  favUnsub = null;
  state = { ready: false, uid: null, ids: new Set() };
}

export function subscribe(listener) {
  listeners.add(listener);
  if (!authUnsub) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function getSnapshot() {
  return state;
}

export async function setFavorite(eventId, favorited) {
  const { uid, ids } = state;
  if (!uid) return;
  // Optimistic: reflect the click immediately; the snapshot confirms or reverts.
  const next = new Set(ids);
  if (favorited) next.add(eventId);
  else next.delete(eventId);
  setState({ ids: next });
  const ref = doc(db, 'users', uid, 'favorites', eventId);
  try {
    if (favorited) await setDoc(ref, { createdAt: serverTimestamp() });
    else await deleteDoc(ref);
  } catch (err) {
    const revert = new Set(state.ids);
    if (favorited) revert.delete(eventId);
    else revert.add(eventId);
    setState({ ids: revert });
    throw err;
  }
}
