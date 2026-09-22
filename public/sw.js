// Minimal service worker - exists only to satisfy Chrome/Android's PWA
// installability check (a registered SW with a fetch handler). No offline
// caching: every request just passes straight through to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
