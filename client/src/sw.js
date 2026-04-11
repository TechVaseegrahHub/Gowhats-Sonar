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

