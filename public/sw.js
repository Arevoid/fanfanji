const CACHE_NAME = "fanfan-phone-v5";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png"
];

// Install Event - cache core static shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching app shell");
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clear old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Clearing old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - handle caching strategies
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Bypass API requests to ensure real-time response from backend
  if (url.pathname.startsWith("/api/")) {
    return; // Let browser handle it normally with network-only
  }

  // Bypass hot-reload or non-http protocols (like chrome-extension)
  if (event.request.method !== "GET" || !event.request.url.startsWith("http")) {
    return;
  }

  // The HTML entry point must reflect the latest deployment immediately.  A
  // stale index.html keeps referencing the previous hashed CSS/JS bundle, so
  // visual updates such as bundled fonts and widget colours never reach an
  // already-installed phone app.
  if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((response) => response || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response, but update cache in background (Stale-While-Revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            /* Ignore offline fetch failure on background sync */
          });
        return cachedResponse;
      }

      // If not in cache, fetch from network and cache for next time
      return fetch(event.request)
        .then((networkResponse) => {
          // Cache valid responses
          if (networkResponse.status === 200 && networkResponse.type === "basic") {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is for HTML or navigation, return app shell index.html
          if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/");
          }
        });
    })
  );
});
