// __BUILD_ID__ is replaced with the deploy commit SHA by the GitHub Actions
// workflow, so a fresh cache is picked up automatically on every deploy.
const CACHE_NAME = "campfire-poker-__BUILD_ID__";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./calc.js",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS.map((url) =>
          fetch(url, { cache: "reload" })
            .then((response) => (response.ok ? cache.put(url, response) : null))
            .catch(() => null) // one bad asset shouldn't block the rest from caching
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});