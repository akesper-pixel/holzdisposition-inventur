/* HolzDisposition iPhone V4 – robuster Offline-Service-Worker */
const CACHE = 'holzdisposition-mobile-v4-4-fotoanalyse';
const CORE = ['./index.html'];
const OPTIONAL = ['./manifest.webmanifest', './icon-192.png', './icon-512.png'];
const scopeURL = new URL(self.registration.scope);
const inScope = url => url.origin === scopeURL.origin && url.pathname.startsWith(scopeURL.pathname);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // index.html is mandatory. If offline during an update, keep the old worker.
    await cache.add(new Request(CORE[0], {cache: 'reload'}));
    // Optional assets must never block installation.
    await Promise.allSettled(OPTIONAL.map(asset => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('holzdisposition-mobile-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!inScope(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(req, {cache: 'no-store'});
        if (response.ok && response.type === 'basic') {
          // Save the latest page for offline use, regardless of / or /index.html.
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch (error) {
        const fallback = await cache.match('./index.html') || await caches.match('./index.html');
        if (fallback) return fallback;
        return Response.error();
      }
    })());
    return;
  }

  // Only known local static resources are cached; JSON imports/exports and
  // unrelated requests are not intercepted.
  const allowed = new Set(['manifest.webmanifest', 'icon-192.png', 'icon-512.png']);
  const filename = url.pathname.slice(scopeURL.pathname.length);
  if (!allowed.has(filename)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const response = await fetch(req);
      if (response.ok && response.type === 'basic') await cache.put(req, response.clone());
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});
