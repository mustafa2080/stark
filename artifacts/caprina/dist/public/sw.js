// ─── CAPRINA OS — Service Worker ──────────────────────────────────────────────
// Strategy:
//   • JS/CSS (hashed assets) → Network First → Cache Fallback
//   • Images/fonts          → Cache First
//   • Navigation (HTML)     → Network First → fallback to cache
//   • API calls (/api/*)    → Network Only (never cache)
//   • Video/audio files     → Network Only (Range requests / 206 not cacheable)

const CACHE_VERSION = "caprina-v11";
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const NAV_CACHE     = `${CACHE_VERSION}-nav`;
const ALL_CACHES    = [STATIC_CACHE, NAV_CACHE];

const PRECACHE_URLS = ["./"];

// ─── Helper: safe to cache? (must be status 200, not partial 206) ─────────────
function isCacheable(response) {
  return response && response.status === 200 && response.type !== "opaque";
}

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            fetch(url).then((res) => {
              if (isCacheable(res)) return cache.put(url, res);
            }).catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// ─── Activate — clean old caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !ALL_CACHES.includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // 2. API calls → Network Only
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "لا يوجد اتصال بالسيرفر" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // 3. Video & audio → Network Only (206 Partial Content not cacheable)
  if (url.pathname.match(/\.(mp4|webm|ogg|mp3|wav|m4a|mov|avi)$/i)) {
    return; // let browser handle natively with Range support
  }

  // 4. JS & CSS (Vite hashed files) → Network First → Cache Fallback
  if (url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached ?? new Response("", { status: 404 })
          )
        )
    );
    return;
  }

  // 5. Images & fonts → Cache First
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|ttf|eot|webp|gif)$/i)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (isCacheable(response)) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response("", { status: 404 }));
      })
    );
    return;
  }

  // 6. Navigation (HTML) → always serve index.html (SPA routing)
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch("/index.html")
        .then((response) => {
          if (isCacheable(response)) {
            const clone = response.clone();
            caches.open(NAV_CACHE).then((cache) => cache.put("/index.html", clone));
          }
          return response;
        })
        .catch(() =>
          caches.match("/index.html").then((cached) => cached ?? caches.match("./"))
        )
    );
    return;
  }

  // 7. Everything else → Network First (only cache status 200)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (isCacheable(response)) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) => cached ?? new Response("", { status: 404 })
        )
      )
  );
});

// ─── Message handler ──────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
