/*
 * Sednium CoWork - notification worker.
 *
 * It exists for exactly one reason: `registration.showNotification()` is the only way to raise a
 * system notification that Android Chrome honours, and a click on one has to be handled somewhere.
 * There is deliberately no fetch handler, so this worker can never cache, intercept or delay a
 * request - the app stays a plain web page, and an old service worker cannot pin an old bundle.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if ('focus' in client) {
          // Let a live dashboard scroll to whatever the alert was about, if it can.
          try {
            client.postMessage({ type: 'cowork:notification-click', data: event.notification.data });
          } catch {
            /* a client that vanished between matchAll and postMessage */
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })(),
  );
});

self.addEventListener('notificationclose', () => {
  /* No bookkeeping: the dashboard re-derives everything from the relay on its next poll. */
});
