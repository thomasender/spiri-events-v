/* Web Push handlers of the app's service worker (docs/push-notifications.md).
 *
 * Pulled into the generated Workbox worker via `workbox.importScripts` in
 * vite.config.ts, so there is ONE service worker (no firebase-messaging-sw.js)
 * and its autoUpdate behaviour stays unchanged. No Firebase SDK here: the
 * functions (functions/src/push.ts) send a data-only FCM message
 * { title, body, link, tag } and this file shows it.
 */

function readPushPayload(event) {
  if (!event.data) return null;
  let raw;
  try {
    raw = event.data.json();
  } catch {
    return null;
  }
  // FCM wraps the message: { data: {...}, notification?: {...}, from, ... }.
  const data = (raw && (raw.data || raw.notification)) || raw || {};
  const title = typeof data.title === 'string' && data.title ? data.title : 'Dein Tribe';
  return {
    title,
    body: typeof data.body === 'string' ? data.body : '',
    link: typeof data.link === 'string' && data.link ? data.link : '/',
    tag: typeof data.tag === 'string' && data.tag ? data.tag : undefined,
  };
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event);
  if (!payload) return;
  // Every push must show a notification (Safari / iOS revoke the permission otherwise).
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'de',
      data: { link: payload.link },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  // Only links of this site: a push never opens a foreign page.
  const target = new URL(link, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (open && 'navigate' in open) {
        return open
          .focus()
          .then((client) => (client || open).navigate(target.href))
          .catch(() => self.clients.openWindow(target.href));
      }
      return self.clients.openWindow(target.href);
    })
  );
});
