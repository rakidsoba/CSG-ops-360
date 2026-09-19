/* CharteredOps 360 — Service Worker stub for Phase 2 offline field capture
   Will cache shell + queue attendance payloads in IndexedDB when offline.
*/
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});
self.addEventListener('fetch', (e) => {
  // Phase 2: network-first for API, cache-first for shell
});
