/* Service worker de BancaVirtual: recibe notificaciones push y las muestra en el teléfono. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (_) {
    d = { cuerpo: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(d.titulo || 'BancaVirtual', {
      body: d.cuerpo || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || undefined,
      data: { url: d.url || '/notificaciones' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/notificaciones';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
