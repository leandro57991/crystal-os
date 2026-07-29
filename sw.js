const CACHE_NAME = 'crystal-os-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/css/components.css',
  '/css/mobile.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/db.supabase.js',
  '/js/router.js',
  '/js/ui.js',
  '/assets/logo.png'
];

// Network-first: siempre intenta traer la versión más reciente del servidor.
// Solo usa la copia guardada si el teléfono está sin internet.
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(res => {
      const resClone = res.clone();
      caches.open(CACHE_NAME).then(cache => {
        if (!e.request.url.includes('chrome-extension')) cache.put(e.request, resClone);
      });
      return res;
    }).catch(() => caches.match(e.request))
  );
});
