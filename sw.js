// sw.js — httpclient Service Worker
// Strategy:
//   App-shell assets  → Cache First (serve from cache, update in background)
//   Outbound API calls → Network Only (the whole point of an HTTP client)
//   Offline fallback  → serve offline.html when navigation fails

const CACHE_NAME = 'httpclient-v1';
const OFFLINE_URL = '/offline.html';

const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activate immediately — don't wait for existing tabs to close
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ── Fetch: routing logic ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Same-origin navigation requests → App Shell (offline-first)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // 2. Same-origin static assets → Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Serve from cache, revalidate in background (stale-while-revalidate)
          const networkUpdate = fetch(request).then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          }).catch(() => {});
          return cached;
        }
        // Not in cache — fetch and cache it
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Cross-origin requests (outbound API calls) → Network Only
  // We do NOT intercept these — let the browser handle CORS normally.
  // Intercepting and re-fetching from SW context doesn't bypass CORS either
  // (SW fetch is still subject to CORS), so pass-through is correct.
});

// ── Message: handle skip-waiting from UI ─────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
