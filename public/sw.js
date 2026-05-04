/* DocScan Service Worker – enables offline use & "Add to Home Screen" */
'use strict';

const CACHE_NAME = 'docscan-v1';
const PRECACHE = [
  '/',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Never cache API calls — always hit the network
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request)
        .then(response => {
          // Cache successful GET responses for same-origin assets
          if (e.request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return response;
        })
      )
      .catch(() => caches.match('/'))  // offline fallback: show app shell
  );
});
