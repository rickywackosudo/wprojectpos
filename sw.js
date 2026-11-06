/* W Project POS service worker
 * - The app opens offline: the page, icons and fonts are kept in a cache.
 * - The page itself is always fetched fresh when online, so new versions arrive right away.
 * - Order data never goes through here: /api and Google Apps Script requests are left alone.
 */
const VERSION = '1.6';
const SHELL = 'wpos-shell-' + VERSION;
const FONTS = 'wpos-fonts';
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icon-32.png', '/icon-180.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('wpos-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: keep a copy so the app looks right offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;            // Google Apps Script, WhatsApp, etc.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;

  // The page: network first, cached copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const fresh = await fetch(req);
        if (fresh.ok && (url.pathname === '/' || url.pathname === '/index.html')) cache.put('/', fresh.clone());
        return fresh;
      } catch (e) {
        return (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Icons, manifest and other same-site files: cached copy first, refreshed in the background.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: true });
    const update = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { event.waitUntil(update); return hit; }
    return (await update) || Response.error();
  })());
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  } catch (e) {
    return Response.error();
  }
}
