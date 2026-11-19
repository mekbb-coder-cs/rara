const CACHE_NAME = 'relieflink-v1';
const PRECACHE_ASSETS = [
  '/',
  '/report',
  '/map',
  '/track',
  '/login',
  '/manifest.webmanifest',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache-first for OpenStreetMap tiles (so offline map displays already loaded areas)
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open('relieflink-map-tiles').then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        try {
          const networkResponse = await fetch(event.request);
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        } catch {
          return new Response('', { status: 408, statusText: 'Tile not cached and offline' });
        }
      })
    );
    return;
  }

  // Network-first for API requests, do not cache API POSTs
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first with cache fallback for pages and static assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Fallback to offline root page
        return caches.match('/');
      })
  );
});

// Background Sync Listener
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(
      // Broadcast to client tabs to execute batch offline sync
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_OFFLINE_SYNC' });
        });
      })
    );
  }
});
