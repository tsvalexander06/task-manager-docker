/* Lot Size Calculator — service worker
   Network-first for the app code (HTML / JS / calendar.json) so updates reach
   users immediately when online; cache-first only for static assets (icons,
   manifest). Cache is the offline fallback. */
const CACHE = "lot-calc-v10";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Let cross-origin requests (FX-rates API, calendar proxies) hit the network directly.
  if (url.origin !== self.location.origin) return;

  const isDoc  = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html");
  const isCode = url.pathname.endsWith(".js") || url.pathname.endsWith("calendar.json") || url.pathname.endsWith(".webmanifest");

  if (isDoc || isCode) {
    // Network-first: always try fresh, fall back to cache when offline.
    e.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || (isDoc ? caches.match("./index.html") : undefined)))
    );
    return;
  }

  // Cache-first for static assets (icons, images).
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return resp;
      })
    )
  );
});
