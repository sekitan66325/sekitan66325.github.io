self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // 通常のネットワークリクエストをそのまま通過させる
  event.respondWith(fetch(event.request));
});
