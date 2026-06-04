// Sakspilot service worker, minimal "app shell" cache + network-first for API
// Versjons-string: bump for å invalidere cache hos brukere
const VERSION = 'v1-2026-05-28';
const CACHE_NAME = `sakspilot-${VERSION}`;

const APP_SHELL = ['/', '/manifest.json', '/favicon.svg', '/icon-192.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Slett gamle cacher
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API-kall: alltid network. Ikke cache, krever fersk JWT-sjekk.
  if (url.pathname.startsWith('/api/')) return;

  // POST/PATCH/DELETE: aldri cache
  if (event.request.method !== 'GET') return;

  // /delt/[token]: ikke cache offentlige sider, innholdet kan endres
  if (url.pathname.startsWith('/delt/')) return;

  // Statiske ressurser: cache-first
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.match(/\.(svg|png|jpg|ico|woff2?|css|js)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Navigasjon: network-first med cache-fallback
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request) || caches.match('/'))
  );
});
