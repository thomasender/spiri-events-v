// Web Push on this device (Trello 6afe0f78, docs/push-notifications.md).
//
// Everything stays switched off while VITE_FIREBASE_VAPID_KEY is not set: no
// switch in the profile, no permission prompt, no token, no Messaging SDK.
// The Messaging SDK is loaded only when push is switched on or refreshed.
//
// A device that switched push on is remembered per account in localStorage
// (`tribe.pushDevice.<uid>` = the token's hash) and has its token in
// `users/{uid}/pushTokens/{sha256(token)}`. The functions (functions/src/push.ts)
// send to these tokens; the service worker (public/push-sw.js) shows them.
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import app, { db } from './firebase';

export const PUSH_VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();

const MARKER_PREFIX = 'tribe.pushDevice.';

/** True once a VAPID key is configured for this build. */
export function pushFeatureEnabled(vapidKey = PUSH_VAPID_KEY) {
  return typeof vapidKey === 'string' && vapidKey.trim().length > 0;
}

function isIosDevice(nav) {
  const ua = nav?.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS reports itself as a Mac; touch points give it away.
  return nav?.platform === 'MacIntel' && Number(nav?.maxTouchPoints) > 1;
}

/** What this browser offers, read once from `window` (all fields default to "no"). */
export function detectPushEnvironment(win = typeof window === 'undefined' ? undefined : window) {
  const nav = win?.navigator;
  let isStandalone = nav?.standalone === true;
  try {
    isStandalone ||= Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches);
  } catch {
    // matchMedia missing or broken: treat as browser tab.
  }
  return {
    hasServiceWorker: Boolean(nav && 'serviceWorker' in nav),
    hasPushManager: Boolean(win && 'PushManager' in win),
    hasNotification: Boolean(win && 'Notification' in win),
    permission: win?.Notification?.permission ?? 'default',
    isIos: isIosDevice(nav),
    isStandalone,
  };
}

/**
 * The push state of this device, pure:
 * - 'disabled'    no VAPID key: the feature does not exist yet (nothing is shown)
 * - 'ios-tab'     iPhone/iPad in a Safari tab: only the app on the home screen gets push
 * - 'unsupported' the browser cannot do Web Push
 * - 'denied'      the person blocked notifications for this site
 * - 'active'      switched on on this device
 * - 'available'   can be switched on
 */
export function pushSupportState({ vapidKey, env, enabledOnDevice }) {
  if (!pushFeatureEnabled(vapidKey)) return 'disabled';
  if (env?.isIos && !env.isStandalone) return 'ios-tab';
  if (!env?.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  if (env.permission === 'granted' && enabledOnDevice) return 'active';
  return 'available';
}

/** Short device label stored with the token (for support, never shown publicly). */
export function pushPlatformLabel(env = detectPushEnvironment()) {
  if (env.isIos) return 'ios';
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Hash of this device's token for `uid`, or null when push is off here. */
export function devicePushMarker(uid) {
  if (!uid) return null;
  return storage()?.getItem(MARKER_PREFIX + uid) || null;
}

function setDeviceMarker(uid, hash) {
  try {
    storage()?.setItem(MARKER_PREFIX + uid, hash);
  } catch {
    // Storage full or blocked: push still works until the next start.
  }
}

function clearDeviceMarker(uid) {
  try {
    storage()?.removeItem(MARKER_PREFIX + uid);
  } catch {
    // ignore
  }
}

/** SHA-256 (hex) of the token: the doc id in users/{uid}/pushTokens. */
export async function pushTokenHash(token) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const tokenRef = (uid, hash) => doc(db, 'users', uid, 'pushTokens', hash);

async function fetchToken() {
  // The app's own (Workbox) service worker; in dev there is none, so no push there.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error('push: no service worker registered');
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) throw new Error('push: messaging not supported');
  return getToken(getMessaging(app), {
    vapidKey: PUSH_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
}

async function storeToken(uid, token) {
  const hash = await pushTokenHash(token);
  await setDoc(tokenRef(uid, hash), {
    token,
    platform: pushPlatformLabel(),
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });
  setDeviceMarker(uid, hash);
  return hash;
}

/**
 * Switches push on for this device. Call it ONLY from a click: iOS shows the
 * permission prompt only then. Resolves `{ ok, permission }`.
 */
export async function enablePushOnDevice(uid) {
  if (!uid || !pushFeatureEnabled()) return { ok: false, permission: 'default' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, permission };
  await storeToken(uid, await fetchToken());
  return { ok: true, permission };
}

/**
 * Switches push off for this device (also on logout): forgets the marker and
 * deletes the token doc. Never throws; capped at `waitMs` so an offline logout
 * never hangs (the delete then goes out with the next connection).
 */
export async function disablePushOnDevice(uid, waitMs = 2000) {
  const hash = devicePushMarker(uid);
  clearDeviceMarker(uid);
  if (!hash) return;
  let timer;
  const cap = new Promise((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  const remove = deleteDoc(tokenRef(uid, hash)).catch((err) => {
    console.warn('push: could not delete the device token', err);
  });
  await Promise.race([remove, cap]);
  clearTimeout(timer);
}

/**
 * On app start: keeps this device's token current (`lastSeenAt`, a rotated
 * token replaces the old one). Does nothing unless push is on for this device
 * and allowed. Never throws, never asks for permission.
 */
export async function refreshPushOnStart(uid) {
  if (!uid || !pushFeatureEnabled()) return;
  const marker = devicePushMarker(uid);
  if (!marker) return;
  const env = detectPushEnvironment();
  try {
    if (env.permission === 'denied') {
      await disablePushOnDevice(uid);
      return;
    }
    if (env.permission !== 'granted' || !env.hasServiceWorker) return;
    const token = await fetchToken();
    const hash = await pushTokenHash(token);
    if (hash !== marker) {
      await deleteDoc(tokenRef(uid, marker)).catch(() => undefined);
      await storeToken(uid, token);
      return;
    }
    try {
      await updateDoc(tokenRef(uid, hash), { lastSeenAt: serverTimestamp() });
    } catch (err) {
      // The doc is gone (deleted as dead, or by another session): write it again.
      if (err?.code === 'not-found') await storeToken(uid, token);
      else throw err;
    }
  } catch (err) {
    console.warn('push: refresh failed', err);
  }
}
