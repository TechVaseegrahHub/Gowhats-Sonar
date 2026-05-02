/// <reference lib="webworker" />
/* eslint-disable no-undef */
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

self.skipWaiting();
clientsClaim();

// Precache build assets
precacheAndRoute(self.__WB_MANIFEST || []);

// ✅ SPA navigations: NetworkFirst + offline fallback
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 3600 })],
  }),
);

// Offline fallback to a static page (create /public/offline.html)
setCatchHandler(async ({ event }) => {
  if (event.request.mode === 'navigate') {
    return caches.match('/offline.html', { ignoreSearch: true }) || Response.error();
  }
  return Response.error();
});

// Static assets
registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: 'assets' }),
);

// Images
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 24 * 3600 }),
    ],
  }),
);

// API GETs
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-get',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 3600 })],
  }),
);

// Queue POST /api/messages/send while offline (change path if different)
const sendQueue = new BackgroundSyncPlugin('send-queue', { maxRetentionTime: 24 * 60 });
registerRoute(
  ({ url, request }) => request.method === 'POST' && url.pathname.startsWith('/api/messages/send'),
  new NetworkOnly({ plugins: [sendQueue] }),
  'POST',
);

const DEFAULT_NOTIFICATION_ICON = '/icons/icon-192.png';
const DEFAULT_NOTIFICATION_BADGE = '/icons/icon-192.png';

const parsePushPayload = (event) => {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch (_error) {
    return { body: event.data.text() };
  }
};

const buildNotificationOptions = (payload = {}) => ({
  body: payload.body || 'You have a new update in GoWhats.',
  icon: payload.icon || DEFAULT_NOTIFICATION_ICON,
  badge: payload.badge || DEFAULT_NOTIFICATION_BADGE,
  tag: payload.tag || 'gowhats-notification',
  renotify: Boolean(payload.renotify),
  requireInteraction: Boolean(payload.requireInteraction),
  actions: Array.isArray(payload.actions) ? payload.actions : [{ action: 'open', title: 'Open GoWhats' }],
  data: {
    url: payload.url || '/admin',
    phoneNumber: payload.phoneNumber || null,
    messageId: payload.messageId || null,
    tenantId: payload.tenantId || null,
    kind: payload.data?.kind || null,
    ...payload.data
  }
});

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const title = payload.title || 'GoWhats';
  const options = buildNotificationOptions(payload);

  event.waitUntil(self.registration.showNotification(title, options));
});

async function focusOrOpenWindow(url) {
  const clientList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  for (const client of clientList) {
    if (!('focus' in client)) {
      continue;
    }

    if ('navigate' in client) {
      await client.navigate(url);
    }

    return client.focus();
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(url);
  }

  return null;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification?.data?.url || '/admin',
    self.location.origin
  ).href;

  event.waitUntil(focusOrOpenWindow(targetUrl));
});

