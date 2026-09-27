// DMFT Sahayak service worker: network-first, cached app shell as offline fallback.
// API responses are never cached here (answers must always come from the server).
const CACHE = "dmft-shell-v2";
const SHELL = [
  "/",
  "/static/css/base.css",
  "/static/css/app.css",
  "/static/js/render.js",
  "/static/js/app.js",
  "/static/img/logo.svg",
  "/static/fonts/NotoSans-Latin.woff2",
  "/static/fonts/NotoSans-Devanagari.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (url.pathname === "/" || url.pathname.startsWith("/static/"))) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match("/")))
  );
});
