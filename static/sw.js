// DMFT Sahayak service worker: network-first, cached app shell as offline fallback.
// API responses are never cached here (answers must always come from the server).
// Paths are relative to the worker's location, so the same file works at "/" on the server and at
// "/<repo>/" on the GitHub Pages demo.
const CACHE = "dmft-shell-v3";
const BASE = new URL("./", self.location).pathname;
const SHELL = [
  "",
  "static/css/base.css",
  "static/css/app.css",
  "static/js/render.js",
  "static/js/app.js",
  "static/img/logo.svg",
  "static/fonts/NotoSans-Latin.woff2",
  "static/fonts/NotoSans-Devanagari.woff2",
].map((path) => BASE + path);

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

const cacheable = (path) => path === BASE || path.startsWith(`${BASE}static/`) || path.startsWith(`${BASE}demo/`);

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith(`${BASE}api/`)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && cacheable(url.pathname)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match(BASE)))
  );
});
