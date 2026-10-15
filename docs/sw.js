// Offline support. The build writes precache.json: the files of the site (all but the creature
// pictures) and a version that changes whenever any of them does. Installing downloads them once.
// The pictures, which are many and big, are kept as they are first seen, in a cache of their own
// that a new version of the game does not throw away. After that the game runs without a connection.

const PREFIX = "tall-grass-clicker-";
const SPRITES = "tall-grass-clicker-sprites";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const meta = await (await fetch("precache.json", { cache: "no-store" })).json();
      const cache = await caches.open(PREFIX + meta.version);
      await cache.addAll(meta.files.map((f) => new Request(f, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const meta = await (await fetch("precache.json", { cache: "no-store" })).json().catch(() => null);
      for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== SPRITES && (!meta || key !== PREFIX + meta.version)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  const isSprite = url.origin === self.location.origin && url.pathname.includes("/assets/sprites/");
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (isSprite && response.ok) (await caches.open(SPRITES)).put(request, response.clone());
        return response;
      } catch {
        // offline and not cached: the page itself is the only thing worth falling back to
        if (request.mode === "navigate") return (await caches.match("index.html")) ?? Response.error();
        return Response.error();
      }
    })(),
  );
});
