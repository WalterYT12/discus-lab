// service-worker.js
// Caches every file the app needs on first load, then serves everything
// from that cache afterward — including with no network connection at
// all. Bump CACHE_VERSION whenever app files change, so phones that
// already installed this app pick up the update instead of being stuck
// on stale cached files forever.

const CACHE_VERSION = 'discus-lab-v4';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/scene.js',
  './js/discus.js',
  './js/camera-orbit.js',
  './js/physics.js',
  './js/trajectory.js',
  './js/flightpath2d.js',
  './js/coaching.js',
  './js/ui.js',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
];

// Three.js itself is loaded from a CDN (see the importmap in index.html).
// We cache it too, on a best-effort basis, so the app can still load
// fully offline after the first successful visit. If this fetch fails
// (e.g. installing while offline), the rest of the cache still proceeds —
// see the Promise.allSettled below.
const CDN_ASSETS = [
  'https://unpkg.com/three@0.160.0/build/three.module.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await cache.addAll(ASSETS_TO_CACHE);
      // Best-effort: don't let a failed CDN fetch block installation of
      // the rest of the app (e.g. if you're installing this for the
      // first time without internet — unlikely, but graceful either way).
      await Promise.allSettled(
        CDN_ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old cache versions from previous deployments.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      // Not in cache (e.g. a new CDN resource): try the network, and
      // cache it for next time if it succeeds.
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fully offline and not cached — nothing more we can do for
          // this particular request.
          return new Response('Offline and not cached.', { status: 503 });
        });
    })
  );
});
